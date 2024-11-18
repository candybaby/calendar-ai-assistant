import userModel from '../Models/User.js'

export default class userRepository {
    async findOneByLineId(lineId) {
        return userModel.findOne({
            'line_id': lineId
        })
            .then((res)=>{
                return res;
            })
            .catch((err)=>{
                console.log(err);
            });
    }

    async save(payload) {
        return userModel(payload).save();
    }

    async updateByLineId(lineId, payload) {
        return userModel.findOneAndUpdate({
            'line_id': lineId
        }, payload);
    }
}
