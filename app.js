import 'dotenv/config';

import express from 'express'; // 引入 Express
import {Client, middleware} from '@line/bot-sdk'; // 引入 LINE Bot SDK3
import userRepository from './Repositories/UserRepository.js';
// const userRepository = require('./Repositories/UserRepository');
const userRepo = new userRepository();

const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
};

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

app.get('/', (_req, res) => {
    res.send('Hello World!')
})

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
    }3

    // create a echoing text message
    const echo = { type: 'text', text: 'UserId: ' + event.source.userId };

    // use reply API
    return client.replyMessage(event.replyToken, echo);
}

app.listen(3000, () => {
    console.log(`Server running on port 3000`);
});