const {MongoClient} = require("mongodb");
let config = require("../config");
const config_test = require("../config_test");
config = config.curNetwork == 'testNet'? config_test : config;

module.exports = {
    projectionToken: {"_id": 0, tokenId:1, blockNumber:1, timestamp:1, value: 1,memo: 1, to: 1, holder: "$to",
        tokenIndex: "$token.tokenIndex", quantity: "$token.quantity", royalties: "$token.royalties",
        royaltyOwner: "$token.royaltyOwner", createTime: '$token.createTime', tokenIdHex: '$token.tokenIdHex',
        name: "$token.name", description: "$token.description", kind: "$token.kind", type: "$token.type",
        thumbnail: "$token.thumbnail", asset: "$token.asset", size: "$token.size", tokenDid: "$token.did",
        adult: "$token.adult"},

    queryCollectibleByTokenId: async function(tokenId) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_token_event');

            let result = await collection.aggregate([
                { $match: {tokenId}},
                { $sort: {tokenId: 1, blockNumber: -1}},
                { $group: {_id: "$tokenId", doc: {$first: "$$ROOT"}}},
                { $replaceRoot: { newRoot: "$doc"}},
                { $lookup: {from: "pasar_token", localField: "tokenId", foreignField: "tokenId", as: "token"} },
                { $unwind: "$token"},
                { $project: this.projectionToken}
            ]).toArray();

            return {code: 200, message: 'success', data: result[0]};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    queryCollectibleByOther: async function(types, keyword) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_token_event');

            let match = {};
            if(types === 'creator') {
                match["token.royaltyOwner"] = keyword;
            } else if(types === 'owner') {
                match["to"] = keyword;
            } else if(types === 'keyword') {
                match = {$or: [{tokenId: keyword}, {"token.royaltyOwner": keyword}, {"token.name": {$regex: keyword}}, {"token.description": {$regex: keyword}}]}
            }

            let result = await collection.aggregate([
                { $sort: {tokenId: 1, blockNumber: -1}},
                { $group: {_id: "$tokenId", doc: {$first: "$$ROOT"}}},
                { $replaceRoot: { newRoot: "$doc"}},
                { $lookup: {from: "pasar_token", localField: "tokenId", foreignField: "tokenId", as: "token"} },
                { $unwind: "$token"},
                { $match: match},
                { $project: this.projectionToken}
            ]).toArray();

            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    queryCollectibleByOthers: async function(owner, creator, types) {
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
            }
            return {code: 200, message: 'success', data: {result}};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    queryAllCollectibles: async function() {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_token_event');

            let result = await collection.aggregate([
                { $sort: {tokenId: 1, blockNumber: -1}},
                { $group: {_id: "$tokenId", doc: {$first: "$$ROOT"}}},
                { $replaceRoot: { newRoot: "$doc"}},
                { $lookup: {from: "pasar_token", localField: "tokenId", foreignField: "tokenId", as: "token"} },
                { $unwind: "$token"},
                { $project: this.projectionToken}
            ]).toArray();

            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    queryAllCreators: async function() {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_token');

            let result = await collection.distinct("royaltyOwner");

            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    queryDidsByAddress: async function(address) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_address_did');
            let did = await collection.find({address}).project({"_id": 0}).toArray();
            let dids = []
            did.forEach(item => {
                dids.push(item.did);
            })

            return {code: 200, message: 'success', data: {address, dids}};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    /**
     * @param orderState 1 => orderForSale  2 => orderFilled  3 => orderCanceled
     * @param types tokenId  buyer
     * @param keyword
     * @returns {Promise<{code: number, message: string}|{code: number, data: *, message: string}>}
     */
    queryOrders: async function(orderState, types, keyword) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_order');

            let query = {orderState, [types]: keyword}
            
            let result = await collection.find(query).project({"_id": 0}).toArray();

            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    projectionOrder: {"_id": 0, to: 1, seller: "$to", orderId: "$order.orderId", amount: "$order.amount",bids: "$order.bids",
        blockNumber: "$order.blockNumber",buyerAddr: "$order.buyerAddr",createTime: "$order.createTime",endTime: "$order.endTime",
        filled: "$order.filled",lastBid: "$order.lastBid",lastBidder: "$order.lastBidder",orderState: "$order.orderState",
        orderType: "$order.orderType",price: "$order.price",royaltyFee: "$order.royaltyFee",royaltyOwner: "$order.royaltyOwner",
        sellerAddr: "$order.sellerAddr",tokenId: "$order.tokenId",updateTime: "$order.updateTime"},

    queryOrdersBySeller: async function(orderState, seller) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_token_event');

            let result = await collection.aggregate([
                { $sort: {tokenId: 1, blockNumber: -1}},
                { $group: {_id: "$tokenId", doc: {$first: "$$ROOT"}}},
                { $replaceRoot: { newRoot: "$doc"}},
                { $lookup: {from: "pasar_order", localField: "tokenId", foreignField: "tokenId", as: "order"} },
                { $unwind: "$order"},
                { $match: {to: seller, "order.orderState": orderState}},
                { $project: this.projectionOrder}
            ]).toArray();

            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    // {kind: "$token.kind", type: "$token.type", size: "$token.size",
    // royalties: "$token.royalties",royaltyOwner: "$token.royaltyOwner", quantity: "$token.quantity",
    // tokenDid: "$token.did", thumbnail: "$token.thumbnail", tokenCreateTime: "$token.createTime",
    // tokenUpdateTime: "$token.updateTime", adult: "$token.adult"}
    queryOrdersByKeyword: async function(orderState, keyword) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_order');

            let result = await collection.aggregate([
                { $match: {orderState}},
                { $lookup: {from: "pasar_token", localField: "tokenId", foreignField: "tokenId", as: "token"} },
                { $unwind: "$token"},
                { $match: {$or: [{"token.name": {$regex: keyword}}, {"token.description": {$regex: keyword}}]}},
                { $project: {"_id": 0, orderId:1, orderType:1, orderState:1, tokenId: 1,blockNumber: 1, amount: 1,
                        price: 1, endTime: 1, sellerAddr: 1, buyerAddr: 1, bids: 1, lastBidder: 1, filled:1, royaltyFee: 1,
                        createTime: 1, updateTime: 1, lastBid: 1,sellerDid: 1, asset: "$token.asset", name: "$token.name",
                        description: "$token.description"}}
            ]).toArray();

            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    queryAllOrder: async function(orderState) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_order');

            let query = orderState !== undefined ? {orderState} : {}

            let result = await collection.find(query).project({"_id": 0}).toArray();

            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    queryOrderPriceChangeHistory: async function(tokenId) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_order');
            let result = (await collection.find({tokenId}).project({"_id": 0}).toArray())[0];
            let collection2 = client.db(config.dbName).collection('pasar_order_event');
            result.priceHistory = await collection2.find({orderId: result.orderId, event: 'OrderPriceChanged'}).project({"_id": 0}).sort({blockNumber: -1}).toArray();
            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    queryGiveawaysToken: async function(types, value) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_token_event');

            let result = await collection.aggregate([
                {$match: {[types]: value, memo: {$exists: true, "$ne": ""}}},
                {$lookup: {from: "pasar_token", localField: "tokenId", foreignField: "tokenId", as: "token"}},
                {$unwind: "$token"},
                {$project: {from: 1, ...this.projectionToken}}
            ]).toArray();

            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    queryGiveawaysTokenByRoyaltyOwner: async function(royaltyOwner) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_token_event');

            let result = await collection.aggregate([
                {$match: {memo: {$exists: true, "$ne": ""}}},
                {$lookup: {from: "pasar_token", localField: "tokenId", foreignField: "tokenId", as: "token"}},
                {$unwind: "$token"},
                {$match: {"token.royaltyOwner": royaltyOwner}},
                {$project: {from: 1, ...this.projectionToken}}
            ]).toArray();

            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    queryCollectiblesByPageNumAndPageSize: async function(pageNum, pageSize) {
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

    queryTransactionsByTokenId: async function(tokenId) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token_event');
            let result = await collection.find({tokenId}).sort({blockNumber: -1}).toArray();
            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    queryTransactionsByPageNumAndPageSize: async function(pageNum, pageSize) {
        let projectToken = {"_id": 0, tokenId:1, blockNumber:1, timestamp: 1, value: 1,memo: 1, to: 1, from: 1,
        tokenIndex: "$token.tokenIndex", quantity: "$token.quantity", royalties: "$token.royalties",
        royaltyOwner: "$token.royaltyOwner", createTime: '$token.createTime', tokenIdHex: '$token.tokenIdHex',
        name: "$token.name", description: "$token.description", kind: "$token.kind", type: "$token.type",
        thumbnail: "$token.thumbnail", asset: "$token.asset", size: "$token.size", tokenDid: "$token.did",
        adult: "$token.adult", amount: "$order.amount", royaltyfee: "$order.royaltyFee", price: "$order.price", 
        orderstate: "$order.orderState", orderid: "$order.orderId"};

        let projectTokenFinal = {"_id": 0, tokenId:1, blockNumber:1, timestamp: 1, value: 1,memo: 1, to: 1, from: 1,
        tokenIndex: 1, quantity: 1, royalties: 1, royaltyOwner: 1, createTime: 1, tokenIdHex: 1, name: 1, description: 1, kind: 1, type: 1,
        thumbnail: 1, asset: 1, size: 1, tokenDid: 1, adult: 1, amount: 1, royaltyfee: 1, price: 1, 
        platformfee: "$platformfee.platformFee", orderstate: 1, orderid: 1}
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            const collection = client.db(config.dbName).collection('pasar_token_event');
            await collection.aggregate([
                { $lookup: {from : 'pasar_token', localField: 'tokenId', foreignField: 'tokenId', as: 'token'} },
                { $unwind: "$token" },
                { $lookup:{from : 'pasar_order', localField: 'tokenId', foreignField: 'tokenId', localField: 'from', foreignField: 'sellerAddr',
                        localField: 'to', foreignField: 'buyerAddr', localField: 'blockNumber', foreignField: 'blockNumber', as: 'order'} },
                { $unwind:"$order" },
                { $project: projectToken },
                { $match:{$and : [{"orderstate" : "2"}]} },
                { $out: "transactiontemp" }
            ]).toArray();
            
            let result = await client.db(config.dbName).collection('transactiontemp').aggregate([
                { $lookup:{from: "pasar_order_platform_fee", localField: "orderid", foreignField: "orderId", as: "platformfee"} },
                { $unwind: "$platformfee" },
                { $project: projectTokenFinal },
                { $sort: {timestamp: -1} },
                { $limit: pageSize },
                { $skip: (pageNum - 1) * pageSize }
            ]).toArray();
            client.db(config.dbName).collection('transactiontemp').drop();
            let total = await collection.find().count();
            return {code: 200, message: 'success', data: {total, result}};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    }
}
