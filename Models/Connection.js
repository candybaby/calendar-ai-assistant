import mongoose from 'mongoose';
const { Schema } = mongoose;

mongoose.connect('mongodb://mongodb:27017/calendar')
    .then(() => console.log('Connected!'));3

export {
    mongoose,
    Schema
};
