require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');

const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);

const app = express();

app.get('/', (_req, res) => {
    res.send('Hello World!')
})

app.listen(3000, () => {
    console.log(`Server running on port 3000`);
});