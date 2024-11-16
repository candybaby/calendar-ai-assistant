import {mongoose, Schema} from './Connection.js';

const userSchema = new Schema({
    line_id: String,
    name: String
});

const userModel = mongoose.model('User', userSchema);

export default userModel;
