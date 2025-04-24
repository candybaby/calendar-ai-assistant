import 'dotenv/config';

import serverless from 'serverless-http';
import express from 'express'; // 引入 Express
import { google } from 'googleapis';
import * as line from '@line/bot-sdk';
import OpenAI from 'openai';
import moment from 'moment';
import { zodResponseFormat } from "openai/helpers/zod";
import { createUser, getUserByLineId, updateUserRefreshToken } from './Models/User.js'
import CalendarEvent from './CalendarEvent.js';
import generateFlexMessage from './lineFlexMessage.js';
const openai = new OpenAI();

// create LINE SDK config from env variables
const config = {
    channelSecret: process.env.CHANNEL_SECRET,
};

// create LINE SDK client
const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
});

const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.SECRET_ID,
    process.env.REDIRECT
);

const app = express();

// oauth2Client.on('tokens', (tokens) => {
//     if (tokens.refresh_token) {
//         userRepo.updateByLineId(user.line_id, {
//             'refresh_token': tokens.refresh_token
//         })
//     }
// });

app.post('/callback', line.middleware(config), (req, res) => {
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error('errors', err);
            res.status(500).end();
        });
});

// Route to initiate Google OAuth2 flow
app.get('/', async (req, res) => {
    // Generate the Google authentication URL
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Request offline access to receive a refresh token
        scope: 'https://www.googleapis.com/auth/calendar' // Scope for read-only access to the calendar
    });
    // // Redirect the user to Google's OAuth 2.0 server
    res.redirect(url);
});

// Route to handle the OAuth2 callback
app.get('/oauth2callback', (req, res) => {
    // Extract the code from the query parameter
    const code = req.query.code;
    const line_id = req.query.state;
    
    // 如果没有 code 或 line_id，显示错误
    if (!code || !line_id) {
        return res.status(400).send('授權失敗：缺少必要參數');
    }
    
    // Exchange the code for tokens
    oauth2Client.getToken(code, async (err, tokens) => {
        if (err) {
            // Handle error if token exchange fails
            console.error('Couldn\'t get token', err);
            return res.send('授權失敗：' + (err.message || '未知錯誤'));
        }

        try {
            // 确保我们获得了 refresh_token
            if (!tokens?.refresh_token) {
                console.error('未获取到 refresh_token', tokens);
                return res.send('授權失敗：未獲取到必要的令牌，請重試');
            }
            
            await updateUserRefreshToken(line_id, tokens.refresh_token);
            
            // Notify the user of a successful login
            return res.send('授權成功！您可以關閉此頁面，並返回 LINE 應用程序繼續使用。');
        } catch (dbError) {
            console.error('存储 refresh_token 失败', dbError);
            return res.send('授權過程中發生錯誤，請重試');
        }
    });
});

async function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        // ignore non-text-message event
        return Promise.resolve(null);
    }

    let text = event.message.text;
    let lineInfo = await client.getProfile(event.source.userId);

    let user = await getUserByLineId(event.source.userId);

    if (user?.Item === undefined) {
        await createUser({
            line_id: {
                'S': event.source.userId
            },
            name: {
                'S': lineInfo.displayName
            }
        })

        user = await getUserByLineId(event.source.userId);
    }

    let textMessage;
    let flexMessage;
    
    // 检查用户是否有 refresh token
    if (user?.Item?.refresh_token?.S === null || user?.Item?.refresh_token?.S === undefined) {
        return generateAuthMessage(event);
    } else {
        try {
            oauth2Client.setCredentials({
                refresh_token: user?.Item?.refresh_token?.S
            });

            const today = moment().format("YYYY-MM-DD, dddd");
            const completion = await openai.beta.chat.completions.parse({
                messages: [{
                    role: "system",
                    content: `你會幫我把內容拆分成標題、開始時間、結束時間、提醒(轉換成分鐘)、地點、描述。
                    範例: ['與同事聚餐', '2015-05-28T09:00:00+08:00','2015-05-28T10:00:00+08:00', 60, '美麗華', '具體描述']，
                    並且要能整理出對應標題、行事曆時間、幾分鐘前提醒、地點，其餘內容整理完後放在描述裡面，
                    現在是 2024 年，今天是${today}。最後透過json回傳。 內容為 => ${text}`
                }],
                model: "gpt-4o-mini",
                response_format: zodResponseFormat(CalendarEvent, "event")
            });
            const data = completion.choices[0].message.parsed;

            // Create a Google Calendar API client
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
            const response = await calendar.events.insert({
                calendarId: 'primary',
                auth: oauth2Client,
                resource: {
                    summary: data.title,
                    location: data.location,
                    description: data.description,
                    start: {
                        dateTime: data.startTime,
                        timeZone: 'Asia/Taipei'
                    },
                    end: {
                        dateTime: data.endTime,
                        timeZone: 'Asia/Taipei'
                    },
                    reminders: {
                        useDefault: false,
                        overrides: [
                            {
                                method: 'popup',
                                minutes: data.reminders
                            }
                        ]
                    }
                }
            });

            textMessage = { type: 'text', text: '點擊下方按鈕,確認行程' };
            flexMessage = generateFlexMessage('Google行事曆', response.data.htmlLink);
        } catch (error) {
            console.error('errors', error);
            
            // 检查是否为 invalid_grant 错误
            if (error.message?.includes('invalid_grant') || 
                (error.response?.data?.error === 'invalid_grant')) {
                // 清除用户的 refresh token
                await updateUserRefreshToken(event.source.userId, null);
                
                // 引导用户重新授权
                return generateAuthMessage(event);
            }
            
            // 其他类型的错误
            textMessage = { type: 'text', text: '很抱歉，處理您的請求時發生錯誤。請稍後再試。' };
            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [textMessage]
            });
        }
    }

    // use reply API
    return client.replyMessage({
        replyToken: event.replyToken,
        messages: [textMessage, flexMessage]
    });
}

// 抽取生成授权消息的功能为独立函数
function generateAuthMessage(event) {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Request offline access to receive a refresh token
        scope: 'https://www.googleapis.com/auth/calendar', // Scope for read-only access to the calendar
        prompt: 'consent', // 强制显示同意页面，确保获取新的 refresh token
        state: event.source.userId
    });

    // create a echoing text message
    const textMessage = { type: 'text', text: '點擊下方按鈕,完成授權' };
    const flexMessage = generateFlexMessage('Google授權', url);
    
    return client.replyMessage({
        replyToken: event.replyToken,
        messages: [textMessage, flexMessage]
    });
}

export const handler = serverless(app);