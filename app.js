require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');

const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);

const app = express();


app.post('/callback', line.middleware(config), (req, res) => {
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

app.get('/', (_req, res) => {
    res.send('Hello World!')
})

function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        // ignore non-text-message event
        return Promise.resolve(null);
    }

    // create a echoing text message
    const echo = { type: 'text', text: 'UserId: ' + event.source.userId };

    // use reply API
    return client.replyMessage(event.replyToken, echo);
}

app.listen(3000, () => {
    console.log(`Server running on port 3000`);
});