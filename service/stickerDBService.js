const {MongoClient} = require("mongodb");
const config = require("../config");

module.exports = {
    getLastStickerSyncHeight: async function () {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token_event');
            let doc = await collection.findOne({}, {sort:{blockNumber: -1}});
            if(doc) {
                return doc.blockNumber
            } else {
                return config.stickerContractDeploy - 1;
            }
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    listStickers: async function(pageNum, pageSize) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            const collection = client.db(config.dbName).collection('pasar_token');
            let total = await collection.find().count();
            let result = await collection.find().sort({createTime: -1})
                .project({"_id": 0}).limit(pageSize).skip((pageNum-1)*pageSize).toArray();
            return {code: 200, message: 'success', data: {total, result}};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    addEvent: async function(transferEvent) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            const collection = client.db(config.dbName).collection('pasar_token_event');
            await collection.insertOne(transferEvent);
        } catch (err) {
            logger.error(err);
        } finally {
            await client.close();
        }
    },

    replaceEvent: async function(transferEvent) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        let {tokenId, blockNumber} = transferEvent
        try {
            await client.connect();
            const collection = client.db(config.dbName).collection('pasar_token_event');
            await collection.replaceOne({tokenId, blockNumber}, transferEvent, {upsert: true});
        } catch (err) {
            logger.error(err);
        } finally {
            await client.close();
        }
    },

    burnToken: async function (tokenId) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            await collection.updateOne({tokenId}, {$set: {
                    royaltyOwner: '0x0000000000000000000000000000000000000000',
                    holder: '0x0000000000000000000000000000000000000000'
                }});
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    replaceToken: async function (token) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            await collection.replaceOne({tokenId: token.tokenId}, token, {upsert: true});
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    replaceGalleriaToken: async function (token) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token_galleria');
            await collection.replaceOne({tokenId: token.tokenId}, token, {upsert: true});
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    updateToken: async function (tokenId, holder, timestamp) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            await collection.updateOne({tokenId, updateTime: {"$lt": timestamp}}, {$set: {holder, updateTime: timestamp}});
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    search: async function(keyword) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            const collection = client.db(config.dbName).collection('pasar_token');
            let result = await collection.find({$or: [{tokenId: keyword}, {royaltyOwner: keyword}, {name: {$regex: keyword}}, {description: {$regex: keyword}}]}).project({"_id": 0}).toArray();
            return {code: 200, message: 'success', data: {result}};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    query: async function(owner, creator, types) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_token_event');

            let match = {}, result;
            if(owner) {
                match["to"] = owner;
            }
            if(creator) {
                match["token.royaltyOwner"] = creator;
            }

            if(types !== undefined) {
                match['token.type'] = { "$in": types };
            }

            if(types !== undefined && types[0] === 'feeds-chanel') {
                result = await collection.aggregate([
                    { $sort: {tokenId: 1, blockNumber: -1}},
                    { $group: {_id: "$tokenId", doc: {$first: "$$ROOT"}}},
                    { $replaceRoot: { newRoot: "$doc"}},
                    { $lookup: {from: "pasar_token_galleria", localField: "tokenId", foreignField: "tokenId", as: "token"} },
                    { $unwind: "$token"},
                    { $match: {...match}},
                    { $project: {"_id": 0, tokenId:1, blockNumber:1, timestamp:1, value: 1,memo: 1, to: 1, holder: "$to",
                            tokenIndex: "$token.tokenIndex", quantity: "$token.quantity", royalties: "$token.royalties",
                            royaltyOwner: "$token.royaltyOwner", createTime: '$token.createTime', tokenIdHex: '$token.tokenIdHex',
                            name: "$token.name", description: "$token.description", type: "$token.type", tippingAddress: "$token.tippingAddress",
                            entry: "$token.entry", avatar: "$token.avatar", tokenDid: "$token.did", version: '$token.tokenJsonVersion'}}
                ]).toArray();
            } else {
                result = await collection.aggregate([
                    { $sort: {tokenId: 1, blockNumber: -1}},
                    { $group: {_id: "$tokenId", doc: {$first: "$$ROOT"}}},
                    { $replaceRoot: { newRoot: "$doc"}},
                    { $lookup: {from: "pasar_token", localField: "tokenId", foreignField: "tokenId", as: "token"} },
                    { $unwind: "$token"},
                    { $match: {...match}},
                    { $project: {"_id": 0, tokenId:1, blockNumber:1, timestamp:1, value: 1,memo: 1, to: 1, holder: "$to",
                            tokenIndex: "$token.tokenIndex", quantity: "$token.quantity", royalties: "$token.royalties",
                            royaltyOwner: "$token.royaltyOwner", createTime: '$token.createTime', tokenIdHex: '$token.tokenIdHex',
                            name: "$token.name", description: "$token.description", kind: "$token.kind", type: "$token.type",
                            thumbnail: "$token.thumbnail", asset: "$token.asset", size: "$token.size", tokenDid: "$token.did",
                            adult: "$token.adult"}}
                ]).toArray();

                let tokenIds = [];
                result.map(item => tokenIds.push(item.tokenId));

                let collection = client.db(config.dbName).collection('pasar_panel_event');
            }
            return {code: 200, message: 'success', data: {result}};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    stickerCount: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            return await collection.find({}).count();
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    stickerOrderEventCount: async function(startBlock, endBlock) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token_event');
            return await collection.find({blockNumber: {$gte: startBlock, $lte: endBlock}}).count();
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    tokenTrans: async function(tokenId) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token_event');
            return await collection.find({tokenId}).sort({blockNumber: -1}).toArray();
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    listTrans: async function(pageNum, pageSize) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            const collection = client.db(config.dbName).collection('pasar_token_event');
            let results = await collection.aggregate([
                {
                    $lookup:
                    {
                        from : 'pasar_token',
                        localField: 'tokenId',
                        foreignField: 'tokenId',
                        as: 'pasar_token_info'
                    }
                },
                {
                    $match:{
                        "pasar_token_info": {$size : 1}
                    }
                },
                {
                    $sort: {blockNumber: -1}
                },
                {
                    $limit: pageSize,
                },
                {
                    $project: {"_id": 0},
                },
                {
                    $skip: (pageNum - 1) * pageSize
                }
            ]).toArray();
            let result = [];
            for(var i = 0; i < results.length; i++) {
                let token_info = results[i]['pasar_token_info'][0];
                if(token_info == undefined)
                    continue;
                delete results[i]['pasar_token_info'];
                results[i]['method'] = 'TRANSFER';
                if(results[i]['from'] == 0x0000000000000000000000000000000000000000)
                    results[i]['method'] = 'CREATE';
                if(results[i]['to'] == 0x0000000000000000000000000000000000000000)
                    results[i]['method'] = 'DELETE';
                result.push({...results[i] ,...token_info});
            }
            let total = await collection.find().count();
            return {code: 200, message: 'success', data: {total, result}};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    relatednftnum: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token_event');
            let result = await collection.aggregate([
                {
                    $group: { 
                        _id  : "$tokenId"
                    }
                }
            ]).toArray();
            return {value: result.length}
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },
}
