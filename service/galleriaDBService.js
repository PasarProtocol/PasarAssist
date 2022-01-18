let MongoClient = require('mongodb').MongoClient;
let config = require('../config');

module.exports = {
    getLastPanelEventSyncHeight: async function (event) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_panel_event');
            let doc = await collection.findOne({event}, {sort:{blockNumber: -1}});
            if(doc) {
                return doc.blockNumber
            } else {
                return config.galleriaContractDeploy - 1;
            }
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    addPanelEvent: async function(event) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_panel_event');
            await collection.insertOne(event);
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    listPanels: async function(pageNum, pageSize) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_panel_event');

            let total = await collection.aggregate([
                { $sort: {panelId: -1, blockNumber: -1}},
                { $group: {_id: "$panelId", doc: {$first: "$$ROOT"}}},
                { $replaceRoot: { newRoot: "$doc"}},
                { $match: {event: 'PanelCreated'}},
                { $count: 'count'}
            ]).toArray();

            let result = await collection.aggregate([
                { $sort: {panelId: -1, blockNumber: -1}},
                { $group: {_id: "$panelId", doc: {$first: "$$ROOT"}}},
                { $replaceRoot: { newRoot: "$doc"}},
                { $lookup: {from: "pasar_token_galleria", localField: "tokenId", foreignField: "tokenId", as: "token"} },
                { $unwind: "$token"},
                { $match: {event: 'PanelCreated'}},
                { $project: {"_id": 0, tokenId:1, blockNumber:1, panelId: 1, user: 1, amount: 1, fee: 1, did: 1,
                        tokenIndex: "$token.tokenIndex", quantity: "$token.quantity", royalties: "$token.royalties",
                        royaltyOwner: "$token.royaltyOwner", createTime: '$token.createTime', tokenIdHex: '$token.tokenIdHex',
                        name: "$token.name", description: "$token.description", type: "$token.type", tippingAddress: "$token.tippingAddress",
                        entry: "$token.entry", avatar: "$token.avatar", tokenDid: "$token.did", version: '$token.tokenJsonVersion'}},
                { $sort: {blockNumber: -1}},
                { $skip: (pageNum - 1) * pageSize },
                { $limit: pageSize }
            ]).toArray();
            return {code: 200, message: 'success', data: {total: total[0].count, result}};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    getPanel: async function(tokenId) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_panel_event');

            let result = await collection.aggregate([
                { $sort: {panelId: -1, blockNumber: -1}},
                { $group: {_id: "$panelId", doc: {$first: "$$ROOT"}}},
                { $replaceRoot: { newRoot: "$doc"}},
                { $match: {tokenId}},
                { $lookup: {from: "pasar_token_galleria", localField: "tokenId", foreignField: "tokenId", as: "token"} },
                { $unwind: "$token"},
                { $project: {"_id": 0, tokenId:1, blockNumber:1, panelId: 1, user: 1, amount: 1, fee: 1, did: 1,
                        tokenIndex: "$token.tokenIndex", quantity: "$token.quantity", royalties: "$token.royalties",
                        royaltyOwner: "$token.royaltyOwner", createTime: '$token.createTime', tokenIdHex: '$token.tokenIdHex',
                        name: "$token.name", description: "$token.description", type: "$token.type", tippingAddress: "$token.tippingAddress",
                        entry: "$token.entry", avatar: "$token.avatar", tokenDid: "$token.did", version: '$token.tokenJsonVersion'}},

            ]).toArray();
            return {code: 200, message: 'success', data: result[0]};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },
}
