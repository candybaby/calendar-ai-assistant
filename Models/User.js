import { dynamoDB } from './Connection.js';
import {
    CreateTableCommand,
    PutItemCommand,
    GetItemCommand,
    UpdateItemCommand,
    DeleteItemCommand
} from '@aws-sdk/client-dynamodb';

const tableName = 'User';

const createUser = async (item) => {
    const params = new PutItemCommand({
        TableName: tableName,
        Item: item,
        ReturnValues: 'NONE'
    });

    return await dynamoDB.send(params);
};

// Read operation
const getUserByLineId = async (lineId) => {
    const params = new GetItemCommand({
        TableName: tableName,
        Key: {
            line_id: {
                'S': lineId
            }
        },
    });

    return await dynamoDB.send(params);
};

// Update operation
const updateUserRefreshToken = async (lineId, refreshToken) => {
    // 如果 refreshToken 为 null，则移除该属性
    if (refreshToken === null) {
        const params = new UpdateItemCommand({
            TableName: tableName,
            Key: {
                line_id: {
                    'S': lineId
                }
            },
            UpdateExpression: 'REMOVE refresh_token',
            ReturnValues: 'NONE'
        });

        return await dynamoDB.send(params);
    }

    // 否则更新为新的 refresh_token
    const params = new UpdateItemCommand({
        TableName: tableName,
        Key: {
            line_id: {
                'S': lineId
            }
        },
        AttributeUpdates: {
            refresh_token: {
                Value: {
                    'S': refreshToken
                },
                Action: 'PUT'
            }
        },
        ReturnValues: 'NONE'
    });

    return await dynamoDB.send(params);
};
//
// // Delete operation
// const deleteUser = async (lineId) => {
//     const params = {
//         TableName: 'User',
//         Key: {
//             line_id: lineId,
//         },
//     };
//
//     return dynamoDB.delete(params).promise();
// };

export {
    createUser,
    getUserByLineId,
    updateUserRefreshToken,
    // deleteUser
};
