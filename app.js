import 'dotenv/config';

import express from 'express'; // 引入 Express
import { google } from 'googleapis';
import {Client, middleware} from '@line/bot-sdk'; // 引入 LINE Bot SDK3
import userRepository from './Repositories/UserRepository.js';
// const userRepository = require('./Repositories/UserRepository');
const userRepo = new userRepository();

const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
};

const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.SECRET_ID,
    process.env.REDIRECT
);

const client = new Client(config);

const app = express();


app.post('/callback', middleware(config), (req, res) => {
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

// Route to initiate Google OAuth2 flow
app.get('/', (req, res) => {
    // Generate the Google authentication URL
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Request offline access to receive a refresh token
        scope: 'https://www.googleapis.com/auth/calendar.readonly' // Scope for read-only access to the calendar
    });
    // Redirect the user to Google's OAuth 2.0 server
    res.redirect(url);
});

// Route to handle the OAuth2 callback
app.get('/oauth2callback', (req, res) => {
    // Extract the code from the query parameter
    const code = req.query.code;
    // Exchange the code for tokens
    oauth2Client.getToken(code, (err, tokens) => {
        if (err) {
            // Handle error if token exchange fails
            console.error('Couldn\'t get token', err);
            res.send('Error');
            return;
        }
        // Set the credentials for the Google API client
        oauth2Client.setCredentials(tokens);
        console.log(tokens);
        // Notify the user of a successful login
        res.send('Successfully logged in');
    });
});

// Route to list all calendars
app.get('/calendars', (req, res) => {
    // Create a Google Calendar API client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    // List all calendars
    calendar.calendarList.list({}, (err, response) => {
        if (err) {
            // Handle error if the API request fails
            console.error('Error fetching calendars', err);
            res.end('Error!');
            return;
        }
        // Send the list of calendars as JSON
        const calendars = response.data.items;
        res.json(calendars);
    });
});

// Route to list events from a specified calendar
app.get('/events', (req, res) => {
    // Get the calendar ID from the query string, default to 'primary'
    const calendarId = req.query.calendar ?? 'primary';
    // Create a Google Calendar API client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    // List events from the specified calendar
    calendar.events.list({
        calendarId,
        timeMin: (new Date()).toISOString(),
        maxResults: 15,
        singleEvents: true,
        orderBy: 'startTime'
    }, (err, response) => {
        if (err) {
            // Handle error if the API request fails
            console.error('Can\'t fetch events');
            res.send('Error');
            return;
        }
        // Send the list of events as JSON
        const events = response.data.items;
        res.json(events);
    });
});

async function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        // ignore non-text-message event
        return Promise.resolve(null);
    }

    const user = await userRepo.findOneByLineId(event.source.userId);

    if (user === null) {
        userRepo.save({
            line_id: event.source.userId,
            'name': 'tang'
        })
    }

    // create a echoing text message
    const echo = { type: 'text', text: 'UserId: ' + event.source.userId };

    // use reply API
    return client.replyMessage(event.replyToken, echo);
}

app.listen(3000, () => {
    console.log(`Server running on port 3000`);
});