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
}
