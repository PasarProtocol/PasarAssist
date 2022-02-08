const fetch = require('node-fetch');
const cookieParser = require("cookie-parser");
const res = require("express/lib/response");
const {MongoClient} = require("mongodb");
let config = require("../config");
const pasarDBService = require("./pasarDBService");
const { ReplSet } = require('mongodb/lib/core');
const config_test = require("../config_test");
config = config.curNetwork == 'testNet'? config_test : config;

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
                return config.stickerContractDeploy;
            }
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },
    removePasarOrderByHeight: async function(lastHeight, eventType) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection_event = mongoClient.db(config.dbName).collection('pasar_order_event');
            await collection_event.deleteMany({$and: [ {blockNumber: lastHeight}, {event: eventType} ]});
            collection_event = mongoClient.db(config.dbName).collection('pasar_order');
            await collection_event.deleteMany({$and: [ {blockNumber: lastHeight}]});
            return true;
        } catch (err) {
            logger.error(err);
            return false;
        }
    },
    removePlatformFeeByHeight: async function(lastHeight) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection_event = mongoClient.db(config.dbName).collection('pasar_order_platform_fee');
            await collection_event.deleteMany({$and: [ {blockNumber: lastHeight} ]});
            return true;
        } catch (err) {
            logger.error(err);
            return false;
        }
    },
    removeApprovalByHeight: async function(lastHeight) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection_event = mongoClient.db(config.dbName).collection('pasar_approval_event');
            await collection_event.deleteMany({$and: [ {blockNumber: lastHeight} ]});
            return true;
        } catch (err) {
            logger.error(err);
            return false;
        }
    },
    removeTokenInfoByHeight: async function(lastHeight) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection_event = mongoClient.db(config.dbName).collection('pasar_token_event');
            await collection_event.deleteMany({$and: [ {blockNumber: lastHeight} ]});
            collection_event = mongoClient.db(config.dbName).collection('pasar_token');
            await collection_event.deleteMany({$and: [ {blockNumber: lastHeight}]});
            return true;
        } catch (err) {
            logger.error(err);
            return false;
        }
    },
    getGasFee: async function(txHash) {
        let transactionFee;
        try {
            const response = await fetch(
                config.elastos_transation_api_url + txHash
            );
            if (!response.ok) {
                throw new Error(response.statusText);
            }
            let data = await response.json();
            data = data.result;
            transactionFee = data.gasUsed * data.gasPrice / (10 ** 18);
        } catch (err) {
            transactionFee = 0
        } finally {
            return transactionFee == 0 ? await this.getGasFee(txHash): transactionFee;
        }
    },
    getTimestamp: async function(txHash) {
        let timeStamp;
        try {
            const response = await fetch(
                config.elastos_transation_api_url + txHash
            );
            if (!response.ok) {
                throw new Error(response.statusText);
            }
            let data = await response.json();
            data = data.result;
            timeStamp = data.timeStamp;
        } catch (err) {
            timeStamp = 0;
        } finally {
            return timeStamp == 0 ? await this.getTimestamp(txHash): timeStamp;
        }
    },
    verifyEvents: function(result) {
        for(var i = 0; i < result.length; i++) {
            if(result[i]['event'] == undefined || result[i]['event'] == "notSetYet") {
                if(result[i]['from'] == config.burnAddress) {
                    result[i]['event'] = 'Mint';
                }
                if(result[i]['to'] == config.burnAddress) {
                    result[i]['event'] = 'Burn';
                }
                if(result[i]['from'] != config.burnAddress && result[i]['to'] != config.burnAddress) {
                    if(result[i]['memo'] == undefined)
                        result[i]['event'] = 'SafeTransferFrom';
                    else result[i]['event'] = 'SafeTransferFromWithMemo';
                }
            }
            if(result[i]['event'] == 'OrderFilled') {
                result[i]['event'] = "BuyOrder";
                if(result[i]['royaltyOwner'] == result[i]['from']) // this the primary sale
                    result[i]['royaltyFee'] = 0;
            }
            if(result[i]['event'] == 'OrderCanceled')
                result[i]['event'] = "CancelOrder";
            if(result[i]['event'] == 'OrderPriceChanged')
                result[i]['event'] = "ChangeOrderPrice";
            if(result[i]['event'] == 'OrderForSale')
                result[i]['event'] = "CreateOrderForSale";
        }
        return result;
    },
    composeMethodCondition: function(methodStr, requestType, data) {
        let methods = methodStr.split(",");
        let conditions_order_event = [];
        let conditions_token_event = [];
        for(var i = 0; i < methods.length; i++) {
            var method = methods[i];
            let methodCondition_order = [], methodCondition_token = [];
            if(method == 'SetApprovalForAll')
                continue;
            switch(method)
            {
                case "Mint":
                    methodCondition_token.push({'from': "0x0000000000000000000000000000000000000000"});
                    if(requestType == "walletAddr") {
                        methodCondition_token.push({'to': data});
                    }
                    methodCondition_order.push({'event': 'notSetYet'});
                    break;
                case 'SafeTransferFrom':
                    if(requestType == "walletAddr") {
                        methodCondition_token.push({$or: [{'from': data}, {'to': data}]});
                    }
                    else {
                        methodCondition_token.push({'from': {$ne: "0x0000000000000000000000000000000000000000"}});
                        methodCondition_token.push({'to': {$ne: "0x0000000000000000000000000000000000000000"}});
                    }
                    methodCondition_order.push({'event': 'notSetYet'});
                    break;
                case 'SafeTransferFromWithMemo':
                    if(requestType == "walletAddr") {
                        methodCondition_token.push({$or: [{'from': data}, {'to': data}]});
                    }
                    else {
                        methodCondition_token.push({'from': {$ne: "0x0000000000000000000000000000000000000000"}});
                        methodCondition_token.push({'to': {$ne: "0x0000000000000000000000000000000000000000"}});
                    }
                    methodCondition_order.push({'event': 'notSetYet'});
                    methodCondition_token.push({'memo': {$ne: ''}});
                    break;
                case 'Burn':
                    methodCondition_token.push({'to': "0x0000000000000000000000000000000000000000"});
                    if(requestType == "walletAddr") {
                        methodCondition_token.push({'from': data});
                    }
                    methodCondition_order.push({'event': 'notSetYet'});
                    break;
                case 'BuyOrder':
                    methodCondition_order.push({'event': "OrderFilled"});
                    methodCondition_token.push({'from': 'OrderFilled'});
                    if(requestType == 'walletAddr') {
                        methodCondition_order.push({$or: [{'sellerAddr': data}, {'buyerAddr': data}]});
                    }
                    break;
                case 'CreateOrderForSale':
                    methodCondition_order.push({'event': 'OrderForSale'});
                    methodCondition_token.push({'from': 'OrderForSale'});
                    if(requestType == 'walletAddr') {
                        methodCondition_order.push({$or: [{'sellerAddr': data}, {'buyerAddr': data}]});
                    }
                    break;
                case 'CancelOrder':
                    methodCondition_order.push({'event': 'OrderCanceled'});
                    methodCondition_token.push({'from': 'OrderCanceled'});
                    if(requestType == 'walletAddr') {
                        methodCondition_order.push({$or: [{'sellerAddr': data}, {'buyerAddr': data}]});
                    }
                    break;
                case 'ChangeOrderPrice':
                    methodCondition_order.push({'event': 'OrderPriceChanged'});
                    methodCondition_token.push({'from': 'OrderPriceChanged'});
                    if(requestType == 'walletAddr') {
                        methodCondition_order.push({$or: [{'sellerAddr': data}, {'buyerAddr': data}]});
                    }
                    break;
                case 'All':
                    if(requestType == 'walletAddr') {
                        methodCondition_token.push({$or: [{'from': data}, {'to': data}]});
                        methodCondition_order.push({$or: [{'sellerAddr': data}, {'buyerAddr': data}]});
                    }
                    methodCondition_order.push({event: {$ne: 'randomEvent'}});
                    methodCondition_token.push({from: {$ne: 'random'}});
                    break;
            }
            if(methodCondition_order.length > 0)
                conditions_order_event.push({$and: methodCondition_order});

            if(methodCondition_token.length > 0)
                conditions_token_event.push({$and: methodCondition_token});
        }
        return {'order': {$or: conditions_order_event}, 'token':  {$or: conditions_token_event}};
    },

    listStickers: async function(pageNum, pageSize, timeOrder) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            const collection = client.db(config.dbName).collection('pasar_token');
            let total = await collection.find().count();
            let result = await collection.find().sort({createTime: -1})
                .project({"_id": 0}).sort({"createTime": timeOrder}).limit(pageSize).skip((pageNum-1)*pageSize).toArray();
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
                    holder: config.burnAddress
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

    updateToken: async function (tokenId, holder, timestamp, blockNumber) {
        if(holder == config.pasarContract)
            return;
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            await collection.updateOne({tokenId, blockNumber: {"$lt": blockNumber}}, {$set: {holder, blockNumber, updateTime: timestamp}});
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    getLastApprovalSyncHeight: async function () {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_approval_event');
            let doc = await collection.findOne({}, {sort:{blockNumber: -1}});
            if(doc) {
                return doc.blockNumber
            } else {
                return config.stickerContractDeploy;
            }
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    addAprovalForAllEvent: async function (eventData, gasFee, timestamp) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const db = mongoClient.db(config.dbName);
            let record = {blockNumber: eventData.blockNumber, transactionHash: eventData.transactionHash, blockHash: eventData.blockHash,
                 owner: eventData.returnValues._owner, operator: eventData.returnValues._operator, approved: eventData.returnValues._approved, gasFee, timestamp};
            if (db.collection('pasar_approval_event').find({}).count() == 0) {
                await db.createCollection('pasar_approval_event');
            }
            await db.collection('pasar_approval_event').insertOne(record);
            return;
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

            if(types !== undefined && types[0] === 'feeds-channel') {
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
                            adult: "$token.adult", data: "$token.data", version: '$token.tokenJsonVersion'}}
                ]).toArray();
            }

            if(owner) {
                collection = client.db(config.dbName).collection('pasar_order');
                let pipeline = [
                    { $match: {sellerAddr: owner, orderState: "1"}},
                    { $lookup: {from: "pasar_token", localField: "tokenId", foreignField: "tokenId", as: "token"} },
                    { $unwind: "$token"},
                    { $project: pasarDBService.resultProject},
                    { $sort: {blockNumber: -1}},
                ];

                let result2 = await collection.aggregate(pipeline).toArray();
                result = [...result, ...result2]
            }

            return {code: 200, message: 'success', data: result};
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

    stickerGalleriaCount: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token_galleria');
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

    updateOrderEventCollection: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection_event = mongoClient.db(config.dbName).collection('pasar_order_event');
            let result = await collection_event.aggregate([
                { $lookup : {from: 'pasar_order', localField: 'orderId', foreignField: 'orderId', as: 'order'} },
                { $unwind : "$order" },
                { $project: {'_id': 1, id: 1, orderId: 1, tIndex: 1, logIndex: 1, blockHash: 1, removed: 1, event: 1, tHash: 1, sellerAddr: "$order.sellerAddr", buyerAddr: "$order.buyerAddr",
                    timestamp: "$order.updateTime", price: "$order.price", tokenId: "$order.tokenId", blockNumber: 1, royaltyFee: "$order.royaltyFee", data: 1} }
            ]).toArray();
            await collection_event.deleteMany({});
            await collection_event.insertMany(result);
            return {result:result, total: result.length};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },
    updateAllEventCollectionForGasFee: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection_event = mongoClient.db(config.dbName).collection('pasar_order_event');
            let result = await collection_event.find({}).toArray();
            for(var i = 0; i < result.length; i++) {
                result[i]['gasFee'] = await this.getGasFee(result[i]['tHash']);
            }
            await collection_event.deleteMany({});
            await collection_event.insertMany(result);

            collection_event = mongoClient.db(config.dbName).collection('pasar_token_event');
            result = await collection_event.find({}).toArray();
            for(var i = 0; i < result.length; i++) {
                result[i]['gasFee'] = await this.getGasFee(result[i]['txHash']);
            }
            await collection_event.deleteMany({});
            await collection_event.insertMany(result);
            return {result:result, total: result.length};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    listTrans: async function(pageNum, pageSize, method, timeOrder) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        let methodCondition = this.composeMethodCondition(method, "null", "null");
        let methodCondition_order = methodCondition['order'];
        let methodCondition_token = methodCondition['token'];
        try {
            await mongoClient.connect();
            let collection = mongoClient.db(config.dbName).collection('pasar_order_event');
            let rows = await collection.aggregate([
                { $match: { $and: [methodCondition_order] }},
                { $project:{'_id': 0, event: 1, tHash: 1, from: "$sellerAddr", to: "$buyerAddr", orderId: 1,
                timestamp: 1, price: 1, tokenId: 1, blockNumber: 1, royaltyFee: 1, data: 1, gasFee: 1} },
            ]).toArray();
            let temp_collection = 'token_temp_' + Date.now().toString();
            if(rows.length > 0)
                await mongoClient.db(config.dbName).collection(temp_collection).insertMany(rows);

            collection = mongoClient.db(config.dbName).collection('pasar_token_event');
            rows = await collection.aggregate([
                { $match: { $and: [methodCondition_token] } },
                { $project: {'_id': 0, event: "notSetYet", tHash: "$txHash", from: 1, to: 1, gasFee: 1,
                timestamp: 1, memo: 1, tokenId: 1, blockNumber: 1, royaltyFee: "0"} }
            ]).toArray();
            if(rows.length > 0)
                await mongoClient.db(config.dbName).collection(temp_collection).insertMany(rows);
            collection =  mongoClient.db(config.dbName).collection(temp_collection);
            let result = await collection.find().sort({blockNumber: parseInt(timeOrder)}).toArray();
            await collection.drop();
            let results = [];
            let collection_token = mongoClient.db(config.dbName).collection('pasar_token');
            let collection_platformFee = mongoClient.db(config.dbName).collection('pasar_order_platform_fee');
            for(var i = (pageNum - 1) * pageSize; i < pageSize * pageNum; i++)
            {
                if(i >= result.length)
                    break;
                let res  = await collection_token.findOne({tokenId: result[i]['tokenId']});
                if(res != null) {
                    result[i]['name'] = res['name'];
                    result[i]['royalties'] = res['royalties'];
                    result[i]['asset'] = res['asset'];
                    result[i]['royaltyOwner'] = res['royaltyOwner'];
                }
                if(result[i]['event'] == 'OrderFilled') {
                    let res  = await collection_platformFee.findOne({$and:[{blockNumber: result[i]['blockNumber']}, {orderId: result[i]['orderId']}]});
                    if(res != null) {
                        result[i]['platformfee'] = res['platformFee'];
                    }
                }
                if(result[i]['gasFee'] == null) {
                    result[i]['gasFee'] = await this.getGasFee(result[i]['tHash']);
                }
                results.push(result[i]);
            }
            results = this.verifyEvents(results);
            let total = result.length;
            return {code: 200, message: 'success', data: {total, results}};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    nftnumber: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            let result = await collection.aggregate([
                {
                    $group: {
                        _id  : "$status",
                        value: {$sum: 1 }
                    }
                }
            ]).toArray();
            return {code: 200, message: 'success', data: (result.length == 0 ? 0 : result[0]['value'])};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    relatednftnum: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const clientDB = mongoClient.db(config.dbName);
            let total = await clientDB.collection('pasar_token_event').find().count() + await clientDB.collection('pasar_order_event').find().count();
            return {code: 200, message: 'success', data: total};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    owneraddressnum: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection  = mongoClient.db(config.dbName).collection('pasar_token');
            let owners = await collection.aggregate([
                {
                    $group: {
                        _id: "$holder"
                    }
                }]).toArray();
            return {code: 200, message: 'success', data: owners.length};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    gettv: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_order');
            let result = await collection.aggregate([
                {
                    $match :{
                        orderState: "2"
                    }
                }
            ]).toArray();
            let sum = 0;
            result.forEach(ele => {
                sum += parseInt(ele['price']) * parseInt(ele['amount']);
            });
            sum = Math.floor(sum / Math.pow(10, 18));
            result = {code: 200, message: 'success', data : sum};
          return result;
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    getNftPriceByTokenId: async function(tokenId) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection = mongoClient.db(config.dbName).collection('pasar_order');
            let temp_collection = 'token_temp' + Date.now().toString();
            await collection.find({"tokenId": tokenId, orderState: 2}).forEach( function (x) {
                x.updateTime = new Date(x.updateTime * 1000);
                x.price = parseInt(x.price);
                mongoClient.db(config.dbName).collection(temp_collection).save(x);
            });
            collection =  mongoClient.db(config.dbName).collection(temp_collection);
            let result = await collection.aggregate([
                { $addFields: {onlyDate: {$dateToString: {format: '%Y-%m-%d %H', date: '$updateTime'}}} },
                { $match: {$and : [{"tokenId": new RegExp('^' + tokenId)}, { 'orderState': '2'}]} },
                { $group: { "_id"  : { tokenId: "$tokenId", onlyDate: "$onlyDate"}, "price": {$sum: "$price"}} },
                { $project: {_id: 0, tokenId : "$_id.tokenId", onlyDate: "$_id.onlyDate", price:1} },
                { $sort: {onlyDate: 1} }
            ]).toArray();
            if(result.length > 0)
                await collection.drop();
            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    getTranDetailsByTokenId: async function(tokenId, method, timeOrder) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        let methodCondition = this.composeMethodCondition(method, "tokenId", tokenId);
        let methodCondition_order = methodCondition['order'];
        let methodCondition_token = methodCondition['token'];
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_order_event');

            let result = await collection.aggregate([
                { $facet: {
                  "collection1": [
                    { $limit: 1 },
                    { $lookup: {
                      from: "pasar_order_event",
                      pipeline: [
                        { $project: {'_id': 0, event: 1, tHash: 1, from: "$sellerAddr", to: "$buyerAddr", data: 1, orderId: 1, gasFee: 1,
                            timestamp: 1, price: 1, tokenId: 1, blockNumber: 1, royaltyFee: 1} },
                        { $match : {$and: [{tokenId : tokenId.toString()}, methodCondition_order]} }
                      ],
                      "as": "collection1"
                    }}
                  ],
                  "collection2": [
                    { $limit: 1 },
                    { $lookup: {
                      from: "pasar_token_event",
                      pipeline: [
                        { $project: {'_id': 0, event: "notSetYet", tHash: "$txHash", from: 1, to: 1, gasFee: 1,
                            timestamp: 1, memo: 1, tokenId: 1, blockNumber: 1, royaltyFee: "0"} },
                        { $match : {$and: [{tokenId : tokenId.toString()}, methodCondition_token]} }],
                      "as": "collection2"
                    }}
                  ]
                }},
                { $project: {
                  data: {
                    $concatArrays: [
                      { "$arrayElemAt": ["$collection1.collection1", 0] },
                      { "$arrayElemAt": ["$collection2.collection2", 0] },
                    ]
                  }
                }},
                { $unwind: "$data" },
                { $replaceRoot: { "newRoot": "$data" } },
                { $lookup: {from: 'pasar_token', localField: 'tokenId', foreignField: 'tokenId', as: 'token'} },
                { $unwind: "$token" },
                { $project: {event: 1, tHash: 1, from: 1, to: 1, timestamp: 1, price: 1, tokenId: 1, blockNumber: 1, data: 1, name: "$token.name"
                , royalties: "$token.royalties", asset: "$token.asset", royaltyFee: 1, royaltyOwner: "$token.royaltyOwner", orderId: 1, gasFee: 1} },
                { $sort: {blockNumber: parseInt(timeOrder)} }
            ]).toArray();
            let collection_platformFee = mongoClient.db(config.dbName).collection('pasar_order_platform_fee');
            for(var i = 0; i < result.length; i++) {
                if(result[i]['event'] == 'OrderFilled') {
                    let res  = await collection_platformFee.findOne({$and:[{blockNumber: result[i]['blockNumber']}, {orderId: result[i]['orderId']}]});
                    if(res != null) {
                        result[i]['platformfee'] = res['platformFee'];
                    }
                }
                if(result[i]['gasFee'] == null) {
                    result[i]['gasFee'] = await this.getGasFee(result[i]['tHash']);
                }
            }
            result = this.verifyEvents(result);
            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    getCollectibleByTokenId: async function(tokenId) {
        let projectionToken = {"_id": 0, tokenId:1, blockNumber:1, timestamp:1, value: 1,memo: 1, to: 1, holder: "$to",
        tokenIndex: "$token.tokenIndex", quantity: "$token.quantity", royalties: "$token.royalties",
        royaltyOwner: "$token.royaltyOwner", createTime: '$token.createTime', tokenIdHex: '$token.tokenIdHex',
        name: "$token.name", description: "$token.description", kind: "$token.kind", type: "$token.type",
        thumbnail: "$token.thumbnail", asset: "$token.asset", size: "$token.size", tokenDid: "$token.did",
        adult: "$token.adult", properties: "$token.properties"}
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_token_event');

            let result = await collection.aggregate([
                { $match: {$and: [{tokenId: tokenId}, {to: {$ne: config.pasarContract}}] }},
                { $sort: {tokenId: 1, blockNumber: -1}},
                { $limit: 1},
                { $group: {_id: "$tokenId", doc: {$first: "$$ROOT"}}},
                { $replaceRoot: { newRoot: "$doc"}},
                { $lookup: {from: "pasar_token", localField: "tokenId", foreignField: "tokenId", as: "token"} },
                { $unwind: "$token"},
                { $project: projectionToken}
            ]).toArray();
            result = result[0];
            collection = client.db(config.dbName).collection('pasar_order_event');
            let orderForMarketRecord = await collection.find(
                {$and: [{tokenId: tokenId}, {buyerAddr: config.burnAddress}, {sellerAddr: result.holder}, {$or: [{event: 'OrderForSale'}, {event: 'OrderForAuction'}]}]}
            ).toArray();
            let priceRecord = await collection.find({$and: [{tokenId: tokenId}]}).sort({'blockNumber': -1}).toArray();
            if(orderForMarketRecord.length > 0) {
                result['DateOnMarket'] = orderForMarketRecord[0]['timestamp'];
                result['SaleType'] = orderForMarketRecord[0]['sellerAddr'] == result['royaltyOwner'] ? "Primary Sale": "Secondary Sale";
                result['OrderId'] = orderForMarketRecord[0]['orderId'];
            } else {
                result['DateOnMarket'] = "Not on sale";
                result['SaleType'] = "Not on sale";
            }
            if(priceRecord.length > 0) {
                result['Price'] = priceRecord[0].price;
            } else 
            result['Price'] = 0;
            if(result.type == 'image')
                result.type = "General";
            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    getTotalRoyaltyandTotalSaleByWalletAddr: async function(walletAddr, type) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let addressCondition = [];
            //type 0: total royalties, 1: total sales
            if(type == 0)
                addressCondition.push({"sellerAddr": new RegExp('^' + walletAddr)});
            else
                addressCondition.push({"royaltyOwner": new RegExp('^' + walletAddr)});
            let collection = client.db(config.dbName).collection('pasar_order');
            let rows = [];
            let result = await collection.aggregate([
                { $match: {$and : [{$or :[...addressCondition]}, { 'orderState': '2'}]} },
                { $sort: {updateTime: 1}},
                { $project: {"_id": 0, royaltyOwner: 1, sellerAddr: 1, tokenId: 1, orderId: 1, price: 1, royaltyFee: 1, updateTime: 1, amount: 1} },
                { $lookup: {from: "pasar_order_platform_fee", localField: "orderId", foreignField: "orderId", as: "platformFee"} },
            ]).toArray();
            result.forEach(x => {
                x.time = new Date(x.updateTime * 1000);
                let platformFee = x.platformFee.length > 0 ? x.platformFee[0].platformFee: 0;
                x.value = type == 1 ? (x.sellerAddr == x.royaltyOwner? 0: parseInt(x.royaltyFee)) : parseInt(x.price) * parseFloat(x.amount) - parseInt(platformFee);
                rows.push(x);
            });
            let now  = Date.now().toString();
            if(rows.length > 0) {
                await client.db(config.dbName).collection('token_temp_' + now).insertMany(rows);
            }
            collection =  client.db(config.dbName).collection('token_temp' + now);
            result = await collection.aggregate([
                { $addFields: {onlyDate: {$dateToString: {format: '%Y-%m-%d %H', date: '$time'}}} },
                { $group: { "_id"  : { onlyDate: "$onlyDate"}, "value": {$sum: "$value"}} },
                { $project: {_id: 0, onlyDate: "$_id.onlyDate", value:1} },
                { $sort: {onlyDate: 1} },
            ]).toArray();
            await collection.drop();
            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    getStastisDataByWalletAddr: async function(walletAddr) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let result = {};

            let tokens_burned = await mongoClient.db(config.dbName).collection('pasar_token_event').aggregate([
                { $match: {$and: [{to: config.burnAddress}, {from: walletAddr}]} },
                { $project: {"_id": 0, tokenId: 1} }
            ]).toArray();
            let burn_tokens = [];
            tokens_burned.forEach(ele => {
                burn_tokens.push(ele['tokenId']);
            });
            let tokens_self_burned = await mongoClient.db(config.dbName).collection('pasar_token').aggregate([
                { $match: {$and: [{tokenId: {$in: burn_tokens}}, {royaltyOwner: walletAddr}]} },
                { $project: {"_id": 0, tokenId: 1} }
            ]).toArray();
            let burn_tokens_cnt = tokens_self_burned.length;
            let collection = mongoClient.db(config.dbName).collection('pasar_token_event');
            let mint_collectibles = await collection.aggregate([
                { $match: {$and: [{from: config.burnAddress}, {to: walletAddr}]} }
            ]).toArray();

            collection = mongoClient.db(config.dbName).collection('pasar_order_event');
            let count_sold = await collection.aggregate([
                { $match: {$and: [{sellerAddr: walletAddr}, {event: 'OrderFilled'}]} }
            ]).toArray();
            let count_purchased = await collection.aggregate([
                { $match: {$and: [{buyerAddr: walletAddr}, {event: 'OrderFilled'}]} }
            ]).toArray();
            let count_transactions = await collection.aggregate([
                { $match: {$or: [{sellerAddr: walletAddr}, {buyerAddr: walletAddr}]} }
            ]).toArray();
            result = {assets: mint_collectibles.length - burn_tokens_cnt, sold: count_sold.length, purchased: count_purchased.length, transactions: count_transactions.length};
            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    getTranDetailsByWalletAddr: async function(walletAddr, method, timeOrder, keyword, pageNum, pageSize, performer) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        let methodCondition = this.composeMethodCondition(method, "walletAddr", walletAddr);
        let methodCondition_order = methodCondition['order'];
        let methodCondition_token = methodCondition['token'];
        let condition_performer = performer == "By" ? {from: walletAddr} : {to: walletAddr};
        let methodCondition_approval = (method == 'All' || method.indexOf('SetApprovalForAll') != -1) ? {event: 'SetApprovalForAll'}: {event: 'notSetApprovalForAll'}
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_order_event');
            let result = await collection.aggregate([
                { $facet: {
                  "collection1": [
                    { $limit: 1 },
                    { $lookup: {
                      from: "pasar_order_event",
                      pipeline: [
                        { $match : {$and: [methodCondition_order]} },
                        { $project: {'_id': 0, event: 1, tHash: 1, from: "$sellerAddr", to: "$buyerAddr", data: 1, gasFee: 1,
                            timestamp: 1, price: 1, tokenId: 1, blockNumber: 1, royaltyFee: 1, orderId: 1} }
                      ],
                      "as": "collection1"
                    }}
                  ],
                  "collection2": [
                    { $limit: 1 },
                    { $lookup: {
                      from: "pasar_token_event",
                      pipeline: [
                        { $match : {$and: [methodCondition_token]} },
                        { $project: {'_id': 0, event: "notSetYet", tHash: "$txHash", from: 1, to: 1, gasFee: 1,
                            timestamp: 1, memo: 1, tokenId: 1, blockNumber: 1, royaltyFee: "0"} }
                      ],
                      "as": "collection2"
                    }}
                  ],
                  "collection3": [
                    { $limit: 1 },
                    { $lookup: {
                      from: "pasar_approval_event",
                      pipeline: [
                        { $match: {owner: walletAddr} },
                        { $project: {'_id': 0, event: 'SetApprovalForAll', tHash: "$transactionHash", from: '$owner', to: '$operator', gasFee: 1, timestamp: 1} },
                        { $limit:  1 },
                        { $match: methodCondition_approval}],
                      "as": "collection3"
                    }}
                  ]
                }},
                { $project: {
                  data: {
                    $concatArrays: [
                      { "$arrayElemAt": ["$collection1.collection1", 0] },
                      { "$arrayElemAt": ["$collection2.collection2", 0] },
                      { "$arrayElemAt": ["$collection3.collection3", 0] },
                    ]
                  }
                }},
                { $unwind: "$data" },
                { $replaceRoot: { "newRoot": "$data" } },
                { $match: condition_performer },
                { $sort: {blockNumber: parseInt(timeOrder)} }
            ]).toArray();
            let results = [];
            let collection_token = mongoClient.db(config.dbName).collection('pasar_token');
            let collection_platformFee = mongoClient.db(config.dbName).collection('pasar_order_platform_fee');
            let start = (pageNum - 1) * pageSize;
            let tempResult = [];
            for(var i = 0; i < result.length; i++) {
                let res  = await collection_token.findOne({$and:[{tokenId: result[i]['tokenId']}, {$or: [{name: new RegExp(keyword.toString())}, {royaltyOwner: keyword}, {holder: keyword}, {tokenId: keyword}]}]});
                if(res != null) {
                    result[i]['name'] = res['name'];
                    result[i]['royalties'] = res['royalties'];
                    result[i]['asset'] = res['asset'];
                    result[i]['royaltyOwner'] = res['royaltyOwner'];
                } else if(result[i]['event'] != 'SetApprovalForAll') continue;
                tempResult.push(result[i]);
            };
            result = tempResult;
            for(var i = start, count = 0; count < pageSize; i++)
            {
                if(i >= result.length)
                    break;
                count++;
                if(result[i]['event'] == 'OrderFilled') {
                    let res  = await collection_platformFee.findOne({$and:[{blockNumber: result[i]['blockNumber']}, {orderId: result[i]['orderId']}]});
                    if(res != null) {
                        result[i]['platformfee'] = res['platformFee'];
                    }
                }
                if(result[i]['gasFee'] == null) {
                    result[i]['gasFee'] = await this.getGasFee(result[i]['tHash']);
                }
                results.push(result[i]);
            }
            results = this.verifyEvents(results);
            let total = result.length;
            return {code: 200, message: 'success', data: {total, results}};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },
    getLatestBids: async function (tokenId, sellerAddr) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_order_event');
            let result = await collection.aggregate([ 
                { $match: { $and: [{sellerAddr: sellerAddr}, {tokenId : new RegExp(tokenId.toString())}, {event: 'OrderBid'} ] } },
                { $sort: {timestamp: -1} }
            ]).toArray();
            const collection_address = mongoClient.db(config.dbName).collection('pasar_address_did');
            for(var i = 0; i < result.length; i++) {
                let rec = await collection_address.findOne({address: result[i].buyerAddr});
                result[i] = {...result[i], ...rec};
            }
            return { code: 200, message: 'success', data: result };
        } catch (err) {
            logger.error(err)
        } finally {
            await mongoClient.close();
        }
    },

    getAuctionOrdersByTokenId: async function (tokenId) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection  = mongoClient.db(config.dbName).collection('pasar_token');
            let result = await collection.findOne({tokenId});
            let sellerAddr = result.holder;
            collection = mongoClient.db(config.dbName).collection('pasar_order_event');
            result = await collection.aggregate([
                { $match: {$and: [{tokenId: tokenId}, {sellerAddr: sellerAddr}, {event: 'OrderForAuction'}]} },
                { $sort: {blockNumber: 1} }
            ]).toArray();
            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    getMarketStatusByTokenId: async function (tokenId, sellerAddr){
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection  = mongoClient.db(config.dbName).collection('pasar_order_event');
            let result0 = await collection.aggregate([
                {$match: {$and: [{tokenId}, {sellerAddr}]}},
                {$sort: {blockNumber: -1}},
                {$limit: 1}
            ]).toArray();
            let result1 = await collection.aggregate([
                {$match: {$and: [{tokenId}, {sellerAddr}]}},
                {$sort: {blockNumber: 1}},
                {$limit: 1}
            ]).toArray();
            let result = {};
            if(result0.length > 0) {
                if(result0[0]['event'] == 'OrderForSale') {
                    result.event = 'OrderForSale';
                }else if(result0[0]['event'] == 'OrderForAuction') {
                    result.event = 'OrderForAuction';
                    result.endTime = result0[0].endTime;
                }   
            }
            if(result1.length > 0) {
                result.price = result1[0].price;
            }
            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    getDetailedCollectibles: async function (status, minPrice, maxPrice, collectionType, itemType, adult, order, pageNum, pageSize, keyword) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection  = mongoClient.db(config.dbName).collection('pasar_order');
            let sort = {};
            switch (order) {
                case '0':
                    sort = {marketTime: -1};
                    break;
                case '1':
                    sort = {createTime: -1};
                    break;
                case '2':
                    sort = {marketTime: 1};
                    break;
                case '3':
                    sort = {createTime: 1};
                    break;
                case '4':
                    sort = {price: 1};
                    break;
                case '5':
                    sort = {price: -1};
                    break;
                case '6':
                    sort = {endTime: -1};
                    break;
                default:
                    sort = {createTime: -1}
            }

            let status_condition = [];
            let statusArr = status.split(',');
            for (let i = 0; i < statusArr.length; i++) {
                const ele = statusArr[i];
                if(ele == 'All') {
                    status_condition.push({orderType: '1'});
                    status_condition.push({orderType: '2'});
                }
                else if(ele == 'Listed')
                    status_condition.push({orderType: '1'})
                else status_condition.push({orderType: '2'})
            }
            status_condition = {$or: status_condition};

            let itemType_condition = [];
            let itemTypeArr = itemType.split(',');
            for (let i = 0; i < itemTypeArr.length; i++) {
                const ele = itemTypeArr[i];
                if(ele == 'General')
                    ele = 'image';
                if(ele == 'All')
                    itemType_condition.push({type: new RegExp('')});
                else itemType_condition.push({type: ele});
            }
            itemType_condition = {$or: itemType_condition};
            minPrice = BigInt(minPrice, 10) / BigInt(10 ** 18, 10);
            maxPrice = BigInt(maxPrice, 10) / BigInt(10 ** 18, 10);
            let price_condition = {$and: [{priceCalculated: {$gte: parseInt(minPrice)}}, {priceCalculated: {$lte: parseInt(maxPrice)}}]};
            let availableOrders = await collection.aggregate([
                {
                    $addFields: {
                       "priceCalculated": { $divide: [ "$priceNumber", 10 ** 18 ] }
                    }
                },
                { $match: {$and: [status_condition, price_condition, {orderState: '1'}]} },
                { $project: {"_id": 0, tokenId: 1, priceCalculated: 1, price: "$priceNumber", marketTime: "$createTime", endTime: 1, orderId: 1} },
                { $sort: {tokenId: 1} }
            ]).toArray();
            let result = [];
            collection = mongoClient.db(config.dbName).collection('pasar_token');
            for (let i = 0; i < availableOrders.length; i++) {
                const element = availableOrders[i];
                let record = await collection.aggregate([
                    { $match: {$and: [itemType_condition, {adult: adult == "true"}, {tokenId: element.tokenId}, {$or: [{tokenId: keyword}, {name: new RegExp(keyword)}, {royaltyOwner: keyword}]}]} }
                ]).toArray();
                if(record.length == 0)
                    continue;
                delete record[0]["_id"];
                result.push({...element, ...record[0]});
            }
            let total = result.length;
            if(result.length > 0) {
                let temp_collection = 'pasar_token_temp' + Date.now().toString();
                await mongoClient.db(config.dbName).collection(temp_collection).insertMany(result);
                result = await mongoClient.db(config.dbName).collection(temp_collection).aggregate([
                    { $sort: sort },
                    { $skip: (pageNum - 1) * pageSize },
                    { $limit: pageSize }
                ]).toArray();
                await mongoClient.db(config.dbName).collection(temp_collection).drop();
            }
            return {code: 200, message: 'success', data: {total, result}};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    getListedCollectiblesByAddress: async function(address, orderType) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_order');
            const token_collection = mongoClient.db(config.dbName).collection('pasar_token');
            let sort = {};
            switch (orderType) {
                case '0':
                    sort = {createTime: -1};
                    break;
                case '1':
                    sort = {createTime: 1};
                    break;
                case '2':
                    sort = {price: -1};
                    break;
                case '3':
                    sort = {price: 1};
                    break;
                default:
                    sort = {createTime: -1}
            }
            let open_orders = await collection.aggregate([
                { $match: {$and: [{sellerAddr: address}, {orderState: '1'}]} },
                { $project: {'_id': 0, orderId: 1, tokenId: 1, price: 1, createTime: 1} },
                { $sort: sort }
            ]).toArray();
            let result = [];
            for (let i = 0; i < open_orders.length; i++) {
                const ele = open_orders[i];
                let record = await token_collection.findOne({tokenId: ele.tokenId});
                record.price = ele.price;
                record.orderId = ele.orderId;
                result.push(record);
            }
            return { code: 200, message: 'sucess', data: result };
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    getOwnCollectiblesByAddress: async function(address, orderType) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const order_collection = mongoClient.db(config.dbName).collection('pasar_order');
            const token_collection = mongoClient.db(config.dbName).collection('pasar_token');
            let sort = {};
            switch (orderType) {
                case '0':
                    sort = {createTime: -1};
                    break;
                case '1':
                    sort = {createTime: 1};
                    break;
                case '2':
                    sort = {price: -1};
                    break;
                case '3':
                    sort = {price: 1};
                    break;
                default:
                    sort = {createTime: -1}
            }
            let tokens = await token_collection.aggregate([
                { $match: {$and: [{holder: address}]} }
            ]).toArray();
            for (let i = 0; i < tokens.length; i++) {
                delete tokens[i]["_id"];
                let record = await order_collection.aggregate([
                    { $match: {$and: [{tokenId: tokens[i].tokenId}, {orderState: {$ne: '3'}}]} },
                    { $project: {'_id': 0, price: 1, blockNumber: 1, orderId: 1, sellerAddr: 1} },
                    { $sort: {blockNumber: -1} }
                ]).toArray();
                console.log(record);
                if(record.length > 1) {
                    if(record[0]['sellerAddr'] == tokens[i]['holder']) {
                        tokens[i].saleType = 'Secondary Sale';
                        tokens[i].orderId = record[0].orderId;
                    }else {
                        tokens[i].saleType = 'Not on sale';
                        tokens[i].orderId = null;
                    }
                    tokens[i].price = record[0].price;
                }else if(record.length == 1){
                    if(record[0]['sellerAddr'] == tokens[i]['holder']) {
                        tokens[i].saleType = 'Primary Sale';
                        tokens[i].orderId = record[0].orderId;
                    }else {
                        tokens[i].saleType = 'Not on sale';
                        tokens[i].orderId = null;
                    }
                    tokens[i].price = record[0].price;
                }else {
                    tokens[i].saleType = 'Not on sale';
                    tokens[i].orderId = null;
                    tokens[i].price = 0;
                }
            }
            let result = [];
            if(tokens.length > 0) {
                let collection_name = 'pasar_token_temp' + Date.now().toString();
                await mongoClient.db(config.dbName).collection(collection_name).insertMany(tokens);
                result = await mongoClient.db(config.dbName).collection(collection_name).aggregate([
                    { $sort: sort }
                ]).toArray();
                await mongoClient.db(config.dbName).collection(collection_name).drop();
            }
            return { code: 200, message: 'sucess', data: result };
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    getCreatedCollectiblesByAddress: async function(address, orderType) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            let sort = {};
            switch (orderType) {
                case '0':
                    sort = {createTime: -1};
                    break;
                case '1':
                    sort = {createTime: 1};
                    break;
                case '2':
                    sort = {price: -1};
                    break;
                case '3':
                    sort = {price: 1};
                    break;
                default:
                    sort = {createTime: -1}
            }
            let tokens = await collection.aggregate([
                { $match: {$and: [{royaltyOwner: address}, {holder: {$ne: config.burnAddress}}]} }
            ]).toArray();
            const collection_orderEvent = mongoClient.db(config.dbName).collection('pasar_order_event');
            for (let i = 0; i < tokens.length; i++) {
                delete tokens[i]["_id"];
                let record = await collection_orderEvent.aggregate([
                    { $match: {tokenId: tokens[i].tokenId} },
                    { $sort: {timestamp: -1} },
                    { $limit: 1 }
                ]).toArray();
                if(record.length > 0)
                    tokens[i].price = record[0].price;
                else tokens[i].price = 0;
            }
            const collection_temp = mongoClient.db(config.dbName).collection('pasar_token_temp_' + Date.now().toString());
            if(tokens.length > 0)
                await collection_temp.insertMany(tokens)
            let result = await collection_temp.aggregate([
                { $sort: sort }
            ]).toArray()
            if(result.length > 0)
                await collection_temp.drop();
            return {code: 200, message: 'sucess', data: result};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    getLatestPurchasedToken: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const token_collection = mongoClient.db(config.dbName).collection('pasar_token');
            const order_collection = mongoClient.db(config.dbName).collection('pasar_order');
            let latest_orderFilled = await order_collection.aggregate([
                { $match: {$and: [{orderState: '2'}]} },
                { $sort: {updateTime: -1} },
                { $limit: 1 }
            ]).toArray();
            let result = await token_collection.findOne({tokenId: latest_orderFilled[0]['tokenId']});
            return {code: 200, message: 'sucess', data: result};
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    updateBurnTokens: async function(){
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const token_event_collection = mongoClient.db(config.dbName).collection('pasar_token_event');
            const token_collection = mongoClient.db(config.dbName).collection('pasar_token');
            let burn_tokens = await token_event_collection.aggregate([
                { $match: {to: config.burnAddress} }
            ]).toArray();
            for(var i = 0; i < burn_tokens.length; i++) {
                await token_collection.updateOne({tokenId: burn_tokens[i]['tokenId']}, {$set: {
                    holder: config.burnAddress
                }})
            }
            return {code: 200, message: 'sucess'};
        } catch(err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    updateTokenHolders: async function(){
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const token_event_collection = mongoClient.db(config.dbName).collection('pasar_token_event');
            const token_collection = mongoClient.db(config.dbName).collection('pasar_token');
            let tokens = await token_collection.aggregate([
                { $match: {$expr:{$ne:["$royaltyOwner", "$holder"]}} }
            ]).toArray();
            
            for(var i = 0; i < tokens.length; i++) {
                let tokenId = tokens[i].tokenId;
                let result = await token_event_collection.aggregate([
                    { $match: {$and: [{tokenId}, {to: {$ne: config.pasarContract}}] } },
                    { $sort: {tokenId: 1, blockNumber: -1} },
                    { $limit: 1 }
                ]).toArray();
                await token_collection.updateOne({tokenId}, {$set: {holder: result[0]['to']}});
            }
            return {code: 200, message: 'sucess'};
        } catch(err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    }
}
