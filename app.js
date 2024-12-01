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
    // Exchange the code for tokens
    oauth2Client.getToken(code, async (err, tokens) => {
        if (err) {
            // Handle error if token exchange fails
            console.error('Couldn\'t get token', err);
            res.send('Error');
            return;
        }

        if (tokens?.refresh_token !== undefined) {
            await updateUserRefreshToken(line_id, tokens.refresh_token);
        }

        // Notify the user of a successful login
        res.send('Successfully logged in');
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

    let echo;
    if (user?.Item?.refresh_token?.S === null || user?.Item?.refresh_token?.S === undefined) {
        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline', // Request offline access to receive a refresh token
            scope: 'https://www.googleapis.com/auth/calendar', // Scope for read-only access to the calendar
            prompt: 'consent',
            state: event.source.userId
        });

        // create a echoing text message
        echo = { type: 'text', text: url };
    } else {
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
        await calendar.events.insert({
            calendarId: 'primary',
            auth:oauth2Client,
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
                    overrides: {
                        method: 'popup',
                        minutes: data.reminders
                    }
                }
            }
        });

        echo = { type: 'text', text: JSON.stringify(data) };
    }

    // use reply API
    return client.replyMessage({
        replyToken: event.replyToken,
        messages: [echo]
    });
}

export const handler = serverless(app);