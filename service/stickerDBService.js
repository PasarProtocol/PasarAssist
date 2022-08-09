const fetch = require('node-fetch');
const axios = require('axios');
const cookieParser = require("cookie-parser");
const res = require("express/lib/response");
const {MongoClient} = require("mongodb");
var ObjectID = require('mongodb').ObjectID;
let config = require("../config");
const pasarDBService = require("./pasarDBService");
const { ReplSet } = require('mongodb/lib/core');
const config_test = require("../config_test");
let Web3 = require('web3');
let pasarContractABI = require('../contractABI/pasarABI');
const diaContractABI = require('../contractABI/diaTokenABI');
config = config.curNetwork == 'testNet'? config_test : config;
let jobService = require('./jobService');
const indexDBService = require('./indexDBService');

const burnAddress = '0x0000000000000000000000000000000000000000';

const ELAToken = '0x0000000000000000000000000000000000000000';

module.exports = {
    getLastStickerSyncHeight: async function (token=config.elastos.stickerV2Contract) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token_event');
            let doc = await collection.findOne({token}, {sort:{blockNumber: -1}});
            if(doc) {
                return doc.blockNumber
            } else {
                if(token == config.elastos.stickerV2Contract) {
                    return config.elastos.stickerV2ContractDeploy;
                } else if(token == config.elastos.stickerContract){
                    return config.elastos.stickerContractDeploy;
                } else if(token == config.ethereum.stickerContract) {
                    return config.ethereum.stickerContractDeploy;
                }
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
    removeTokenInfoByHeight: async function(lastHeight, baseToken=config.elastos.stickerV2Contract) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection_event = mongoClient.db(config.dbName).collection('pasar_token_event');
            await collection_event.deleteMany({$and: [ {blockNumber: lastHeight}, {token: baseToken} ]});
            collection_event = mongoClient.db(config.dbName).collection('pasar_token');
            await collection_event.deleteMany({$and: [ {blockNumber: lastHeight}, {baseToken: baseToken}]});
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
    getLatestElaPrice: async function () {
        let latest_price = 0;
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            const collection = client.db(config.dbName).collection('pasar_cmc_price');
            let result = await collection.find({}).sort({timestamp : -1}).limit(1).toArray();
            if(result.length > 0) {
                latest_price = result[0]['ELA'];
            }
            return {code: 200, message: 'success', data: latest_price};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
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

    paginateRows: async function(rows, pageNum, pageSize) {
        let result = [];
        
        for(var i = (pageNum - 1) * pageSize; i < pageSize * pageNum; i++) {
            if(i >= rows.length)
                break;
            result.push(rows[i]);
        }
        return result;
    },

    composeMethodCondition: function(methodStr, requestType, data) {
        let methods = methodStr.split(",");
        let conditions_order_event = [{1: 1}];
        let conditions_token_event = [{1: 1}];
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
                    methodCondition_token.push({'memo': {$ne: null}});
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
                case 'CreateOrderForAuction':
                    methodCondition_order.push({'event': 'OrderForAuction'});
                    methodCondition_token.push({'from': 'OrderForAuction'});
                    if(requestType == 'walletAddr') {
                        methodCondition_order.push({$or: [{'sellerAddr': data}, {'buyerAddr': data}]});
                    }
                    break;
                case 'BidForOrder':
                    methodCondition_order.push({'event': 'OrderBid'});
                    methodCondition_token.push({'from': 'OrderBid'});
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
            let total = await collection.find({ holder: {$ne: config.burnAddress} }).count();
            let result = await collection.find({ holder: {$ne: config.burnAddress} }).sort({createTime: -1})
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
    getEvents: async function(tokenId, token, marketPlace) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            const collection = client.db(config.dbName).collection('pasar_token_event');
            let result = await collection.find({tokenId, token, marketPlace}).sort({blockNumber: 1}).toArray();
            return {code: 200, message: 'success', data: result};
        } catch (err) {
            return {code: 500, message: 'server error'};
        } finally {
            await client.close();
        }
    },

    addEvents: async function(transferEvents) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            const collection = client.db(config.dbName).collection('pasar_token_event');
            await collection.insertOne(transferEvents);
        } catch (err) {
            logger.error(err);
        } finally {
            await client.close();
        }
    },

    replaceEvent: async function(transferEvent) {
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});

        try {
            await client.connect();
            const collection = client.db(config.dbName).collection('pasar_token_event');
            let eventCount = await collection.find({tokenId: transferEvent.tokenId, blockNumber: transferEvent.blockNumber, token: transferEvent.token, marketPlace: transferEvent.marketPlace}).count();
            if(eventCount == 0) {
                await collection.updateOne({tokenId: transferEvent.tokenId, blockNumber: transferEvent.blockNumber, token: transferEvent.token, marketPlace: transferEvent.marketPlace}, {$set: transferEvent}, {upsert: true});
            }
        } catch (err) {
            logger.error(err);
        } finally {
            await client.close();
        }
    },

    burnToken: async function (tokenId, baseToken, marketPlace=config.elastos.chainType) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            await collection.updateOne({tokenId, baseToken, marketPlace}, {$set: {
                    holder: config.burnAddress
            }});
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    burnTokenBatch: async function (tokenIds, baseToken, marketPlace=config.elastos.chainType) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            await collection.update({tokenId: {$in: tokenIds}, baseToken, marketPlace}, {$set: {
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
            let length = await collection.find({tokenId: token.tokenId, baseToken: token.baseToken, marketPlace:token.marketPlace, holder: {$ne: config.burnAddress}}).count();
            
            if(length == 0) {
                await collection.updateOne({tokenId: token.tokenId, baseToken: token.baseToken, marketPlace: token.marketPlace}, {$set: token}, {upsert: true});
            }
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    updateDidTokenByDid: async function (token) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            await collection.updateOne({orderId: token.orderId}, {$set: token}, {upsert: true});
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
            await collection.updateOne({tokenId: token.tokenId}, {$set: token}, {upsert: true});
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    updateToken: async function (tokenId, holder, timestamp, blockNumber, baseToken=config.elastos.stickerV2Contract, marketPlace=config.elastos.chainType) {
        if(holder == config.elastos.pasarContract || holder == config.elastos.pasarV2Contract || holder == config.ethereum.pasarContract)
            return;
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            await collection.updateOne({tokenId, baseToken, marketPlace, holder: {$ne: burnAddress}}, {$set: {holder, updateTime: timestamp, blockNumber}});
        } catch (err) {
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    updateRoyaltiesOfToken: async function (tokenId, royalties, baseToken, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            await collection.updateOne({tokenId, baseToken, marketPlace}, {$set: {royalties}});
        } catch (err) {
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    updateNormalToken: async function (token) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');

            await collection.updateOne({tokenId: token.tokenId, baseToken: token.baseToken, marketPlace: token.marketPlace, holder: {$ne: burnAddress}}, {$set: token});
            let checkData = await collection.find(token).count();
            if(checkData == 0) {
                await this.updateNormalToken(token);
            }
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    updateTokenInfo: async function(tokenId, price, orderId, marketTime, endTime, status, holder, blockNumber, quoteToken=null, baseToken=null, marketPlace=config.elastos.chainType) {
        price = parseInt(price);
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            let updateData = {price, orderId, blockNumber};

            if(quoteToken != null) {
                updateData.quoteToken = quoteToken;
            }
            
            if(marketTime != null) {
                updateData.marketTime = marketTime;
            }

            if(endTime != null) {
                updateData.endTime = endTime;
            }

            await collection.updateOne({tokenId, baseToken, marketPlace}, {$set: updateData});
            if(this.checkAddress(holder)) {
                updateData.holder = holder;
                await collection.updateOne({tokenId, baseToken, marketPlace}, {$set: {holder}});
            }
            if(status != null) {
                updateData.status = status;
                await collection.updateOne({tokenId, baseToken, marketPlace}, {$set: {status}});
            }
            updateData.tokenId = tokenId;
            updateData.baseToken = baseToken;
            updateData.marketPlace = marketPlace;
            let checkData = await collection.findOne(updateData);
            if(checkData == null) {
                await this.updateTokenInfo(tokenId, price, orderId, marketTime, endTime, status, holder, blockNumber, quoteToken, baseToken, marketPlace)
            }
            
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
                return config.elastos.stickerContractDeploy;
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
            let result = await collection.find({$or: [{tokenId: keyword}, {tokenIdHex: keyword}, {royaltyOwner: keyword}, {name: {$regex: keyword}}, {description: {$regex: keyword}}]}).project({"_id": 0}).toArray();
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
            return {code: 200, message: 'success', result:result, total: result.length};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    listTrans: async function(pageNum, pageSize, method, timeOrder) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        let methodCondition = this.composeMethodCondition(method, "null", "null");
        let methodCondition_order = methodCondition['order'];
        let methodCondition_token = methodCondition['token'];
        let methodCondition_approval = (method == 'All' || method.indexOf('SetApprovalForAll') != -1) ? {event: 'SetApprovalForAll'}: {event: 'notSetApprovalForAll'}
        try {
            await mongoClient.connect();
            let collection = mongoClient.db(config.dbName).collection('pasar_order_event');
            let temp_collection =  mongoClient.db(config.dbName).collection('token_temp_' + Date.now().toString());
            let results = [];
            let collection_token = mongoClient.db(config.dbName).collection('pasar_token');
            let collection_platformFee = mongoClient.db(config.dbName).collection('pasar_order_platform_fee');

            // fetch order evetns
            let rows = await collection.aggregate([
                { $match: { $and: [methodCondition_order] }},
                { $addFields: {timestamp: {$toInt : "$timestamp"}}},
                { $project:{'_id': 0, event: 1, tHash: 1, from: "$sellerAddr", to: "$buyerAddr", orderId: 1,
                timestamp: 1, price: 1, tokenId: 1, blockNumber: 1, royaltyFee: 1, data: 1, gasFee: 1, v1Event: 1, marketPlace: 1} },
            ]).toArray();
            if(rows.length > 0)
                await temp_collection.insertMany(rows);

            // fetch token_transfer_events
            collection = mongoClient.db(config.dbName).collection('pasar_token_event');
            rows = await collection.aggregate([
                { $match: { $and: [methodCondition_token] } },
                { $addFields: {timestamp: {$toInt : "$timestamp"}}},
                { $project: {'_id': 0, event: "notSetYet", tHash: "$txHash", from: 1, to: 1, gasFee: 1,
                timestamp: 1, memo: 1, tokenId: 1, blockNumber: 1, royaltyFee: "0", marketPlace: 1} }
            ]).toArray();
            if(rows.length > 0)
                await temp_collection.insertMany(rows);

            // fetch approval_events
            // collection =  mongoClient.db(config.dbName).collection('pasar_approval_event');
            // rows = await collection.aggregate([
            //     { $project: {'_id': 0, blockNumber: 1, event: 'SetApprovalForAll', tHash: "$transactionHash", from: '$owner', to: '$operator', gasFee: 1, timestamp: 1} },
            //     { $match: methodCondition_approval }
            // ]).toArray();
            // if(rows.length > 0)
            //     await temp_collection.insertMany(rows);

            // fetch results from temporary collection
            let result = await temp_collection.find().sort({timestamp: parseInt(timeOrder)}).toArray();
            await temp_collection.drop();
            for(var i = (pageNum - 1) * pageSize; i < pageSize * pageNum; i++)
            {
                if(i >= result.length)
                    break;
                if(result[i]['event'] == 'SetApprovalForAll') {
                    results.push(result[i]);
                    continue;
                }
                let res  = await collection_token.findOne({tokenId: result[i]['tokenId']});
                if(res != null) {
                    result[i]['name'] = res['name'];
                    result[i]['royalties'] = res['royalties'];
                    result[i]['asset'] = res['asset'];
                    result[i]['royaltyOwner'] = res['royaltyOwner'];
                    result[i]['thumbnail'] = res['thumbnail'];
                    result[i]['data'] = {...result[i]['data'], ...res['data']};
                    result[i]['tokenJsonVersion'] = res['tokenJsonVersion'];
                    result[i]['quoteToken'] = res['quoteToken'];
                    result[i]['baseToken'] = res['baseToken'];
                    result[i]['marketPlace'] = res['marketPlace'];
                    result[i]['v1Event'] = res['v1Event'] ? res['v1Event'] : null;
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
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    nftnumber: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            let result = await collection.find({ holder: {$ne: config.burnAddress} }).count()
            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
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
            return {code: 500, message: 'server error'};
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
                {$match: {holder: {$ne: config.burnAddress}}},
                { $group: {
                        _id: "$holder"
                    }
                }]).toArray();
            return {code: 200, message: 'success', data: owners.length};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
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
            
            let rates = await this.getPriceRate();
            let listRate_ela = [], listRate_eth = [], listRate_fusion=[];
            for(var i=0; i < rates.length; i++) {
                if(rates[i].marketPlace == config.elastos.chainType) {
                    listRate_ela[rates[i].type] = rates[i].rate;
                } else if(rates[i].marketPlace == config.ethereum.chainType) {
                    listRate_eth[rates[i].type] = rates[i].rate;
                } else if(rates[i].marketPlace == config.fusion.chainType) {
                    listRate_fusion[rates[i].type] = rates[i].rate;
                }
            }

            result.forEach(ele => {
                let convertToken = ele['quoteToken'];
                if(ele['quoteToken'] == config.elastos.diaTokenContract)
                    convertToken = '0x2C8010Ae4121212F836032973919E8AeC9AEaEE5';
                
                let amount = ele['amount'] ? parseInt(ele['amount']) : 1;
                let rate = 1;
                switch(ele.marketPlace) {
                    case config.elastos.chainType:
                        rate = listRate_ela[convertToken];
                        break;
                    case config.ethereum.chainType:
                        rate = listRate_eth[convertToken];
                        break;
                    case config.fusion.chainType:
                        rate = listRate_fusion[convertToken];
                        break;
                    default:
                        rate = 1;
                        break;
                }
                let price = parseInt(ele['price']) * rate / 10 ** 18;

                sum += price * amount;
            });
            
            result = {code: 200, message: 'success', data : sum};
          return result;
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    getNftPriceByTokenId: async function(tokenId, baseToken=null) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection = mongoClient.db(config.dbName).collection('pasar_order_event');
            let temp_collection = 'token_temp_' + Date.now().toString();

            let events = await collection.find({tokenId: tokenId, baseToken: baseToken, event: "OrderFilled"}).toArray();
            for(var i = 0; i < events.length; i++) {
                console.log(events[i].timestamp);
                // events[i].timestamp = new Date(events[i].timestamp * 1000);
                console.log(events[i].timestamp);
                events[i].price = parseInt(events[i].price);
            }

            collection =  mongoClient.db(config.dbName).collection(temp_collection);
            await collection.insertMany(events);

            let result = await collection.aggregate([
                // { $addFields: {onlyDate: {$dateToString: {format: '%Y-%m-%d %H', date: '$timestamp'}}} },
                { $match: {$and : [{"tokenId": new RegExp('^' + tokenId)}, {baseToken: baseToken}, { event: "OrderFilled" }]} },
                { $group: { "_id"  : { tokenId: "$tokenId", timestamp: "$timestamp", quoteToken: "$quoteToken", marketPlace: "$marketPlace"}, "price": {$sum: "$price"}} },
                { $project: {_id: 0, tokenId : "$_id.tokenId", onlyDate: "$_id.timestamp", quoteToken: "$_id.quoteToken", price:1, marketPlace: "$_id.marketPlace"} },
                { $sort: {timestamp: 1} }
            ]).toArray();
            if(result.length > 0)
                await collection.drop();

            return {code: 200, message: 'success', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    getTranDetailsByTokenId: async function(tokenId, method, timeOrder, baseToken = null) {
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
                            timestamp: 1, price: 1, tokenId: 1, blockNumber: 1, baseToken:1, royaltyFee: 1, quoteToken: 1, v1Event: 1, marketPlace: 1} },
                        { $match : {$and: [{tokenId : tokenId.toString()}, methodCondition_order, {baseToken: baseToken}]} }
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
                            timestamp: 1, memo: 1, tokenId: 1, token:1, blockNumber: 1, marketPlace: 1, royaltyFee: "0"} },
                        { $match : {$and: [{tokenId : tokenId.toString()}, {token : baseToken}, methodCondition_token]} }],
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
                { 
                    $lookup: {from: "pasar_token",
                    let: {"ttokenId": "$tokenId"},
                    pipeline: [{$match: { baseToken: baseToken, "$expr":{"$eq":["$$ttokenId","$tokenId"]} }}],
                    as: "token"}
                },
                { $lookup: {
                    from: "pasar_order",
                    let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken", "tmarketPlace": "$marketPlace"},
                    pipeline: [{$match: {$and: [{$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}}, {$expr: {$eq: ["$$tmarketPlace", "$marketPlace"]}}]}}],
                as: "order"}},
                { $unwind: "$token" },
                { $unwind: {path: "$order", preserveNullAndEmptyArrays: true}},
                { $project: {event: 1, tHash: 1, from: 1, to: 1, timestamp: 1, price: 1, tokenId: 1, blockNumber: 1, data: 1, name: "$token.name", marketPlace: 1
                , royalties: "$token.royalties", asset: "$token.asset", endTime: "$token.endTime", royaltyFee: 1, royaltyOwner: "$token.royaltyOwner", orderId: 1, gasFee: 1, quoteToken: "$order.quoteToken", v1Event: true }},
                { $sort: {blockNumber: parseInt(timeOrder)} }
            ]).toArray();
            let collection_platformFee = mongoClient.db(config.dbName).collection('pasar_order_platform_fee');
            for(var i = 0; i < result.length; i++) {
                if(result[i]['event'] == 'OrderFilled') {
                    let res  = await collection_platformFee.findOne({$and:[{blockNumber: result[i]['blockNumber']}, {orderId: result[i]['orderId']}, {marketPlace: result[i]['marketPlace']}]});
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
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    getCollectibleByTokenId: async function(tokenId, baseToken=null) {
        let projectionToken = {"_id": 0, tokenId:1, blockNumber:1, timestamp:1, value: 1,memo: 1, to: 1, marketPlace: 1, holder: "$token.holder",
        tokenIndex: "$token.tokenIndex", quantity: "$token.quantity", royalties: "$token.royalties",
        royaltyOwner: "$token.royaltyOwner", createTime: '$token.createTime', marketTime: '$token.marketTime', endTime: '$token.endTime', tokenIdHex: '$token.tokenIdHex',
        name: "$token.name", description: "$token.description", kind: "$token.kind", type: "$token.type",
        thumbnail: "$token.thumbnail", asset: "$token.asset", size: "$token.size", tokenDid: "$token.did",
        adult: "$token.adult", properties: "$token.properties", data: "$token.data", tokenJsonVersion: "$token.tokenJsonVersion",
        quoteToken: "$toke.quoteToken", baseToken: "$token.baseToken", reservePrice: "$order.reservePrice", attribute: "$token.attribute", v1State: "$token.v1State"}
        let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await client.connect();
            let collection = client.db(config.dbName).collection('pasar_token_event');

            let result = await collection.aggregate([
                { $match: {$and: [{tokenId: tokenId}, {token: baseToken},{to: {$ne: config.elastos.pasarContract}}] }},
                { $sort: {tokenId: 1, blockNumber: -1}},
                { $limit: 1},
                { $group: {_id: "$tokenId", doc: {$first: "$$ROOT"}}},
                { $replaceRoot: { newRoot: "$doc"}},
                { 
                    $lookup: {from: "pasar_token",
                    let: {"ttokenId": "$tokenId"},
                    pipeline: [{$match: {$and: [{"$expr":{"$eq":["$$ttokenId","$tokenId"]}}, {baseToken: baseToken}]}}],
                    as: "token"}
                },
                { $lookup: {from: "pasar_order", localField: "orderId", foreignField: "orderId", as: "order"} },
                { $unwind: "$token"},
                { $unwind: {path: "$order", preserveNullAndEmptyArrays: true}},
                { $project: projectionToken}
            ]).toArray();
            result = result[0];

            if(!result.royalties || result.royalties == 0) {
                collection = client.db(config.dbName).collection('pasar_collection_royalty');
                let royatlies = await collection.findOne({token: result.baseToken});
                if(royatlies && royatlies.royaltyRates && royatlies.royaltyRates.length > 0) {
                    result.royalties = royatlies.royaltyRates[0];
                }
            }
            collection = client.db(config.dbName).collection('pasar_order');
            let orderForMarketRecord = await collection.find(
                {$and: [{tokenId: tokenId}, {baseToken: baseToken}, {buyerAddr: config.burnAddress}, {sellerAddr: result.holder}, {orderState: {$ne: '3'}}]}
            ).sort({'blockNumber': -1}).toArray();
            let priceRecord = await collection.find({$and: [{tokenId: tokenId}, {baseToken: baseToken}]}).sort({'blockNumber': -1}).toArray();
            if(orderForMarketRecord.length > 0) {
                result['DateOnMarket'] = orderForMarketRecord[0]['createTime'];
                result['SaleType'] = orderForMarketRecord[0]['sellerAddr'] == result['royaltyOwner'] ? "Primary Sale": "Secondary Sale";
                result['OrderId'] = orderForMarketRecord[0]['orderId'];
                result['baseToken'] = orderForMarketRecord[0]['baseToken'] ? orderForMarketRecord[0]['baseToken'] : null;
                result['amount'] = orderForMarketRecord[0]['amount'] ? orderForMarketRecord[0]['amount'] : null;
                result['quoteToken'] = orderForMarketRecord[0]['quoteToken'] ? orderForMarketRecord[0]['quoteToken'] : null;
                result['buyoutPrice'] = orderForMarketRecord[0]['buyoutPrice'] ? orderForMarketRecord[0]['buyoutPrice'] : null;
                result['reservePrice'] = orderForMarketRecord[0]['reservePrice'] ? orderForMarketRecord[0]['reservePrice'] : null;
                result['minPrice'] = orderForMarketRecord[0]['minPrice'] ? orderForMarketRecord[0]['minPrice'] : null;
                result['orderState'] = orderForMarketRecord[0]['orderState'] ? orderForMarketRecord[0]['orderState'] : null;
            } else {
                result['DateOnMarket'] = "Not on sale";
                result['SaleType'] = "Not on sale";
            }
            if(priceRecord.length > 0) {
                result['Price'] = priceRecord[0].price;
                result['orderType'] = priceRecord[0].orderType;
            } else
            result['Price'] = 0;
            if(result.type == 'image')
                result.type = "General";
            collection = client.db(config.dbName).collection('pasar_order_event');
            if(result && result.SaleType != 'Not on sale' && result.OrderId) {
                let listBid = await collection.find({orderId: result.OrderId, marketPlace: result.marketPlace, event: 'OrderBid'}).sort({timestamp:-1}) .toArray();
                result.listBid = listBid;
            } else {
                result.listBid = [];
            }
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
            //type 0: total sales, 1: total royalties
            if(type == 1)
                addressCondition.push({"sellerAddr": new RegExp('^' + walletAddr)});
            else
                addressCondition.push({"royaltyOwner": new RegExp('^' + walletAddr)});
            let collection = client.db(config.dbName).collection('pasar_order');
            let rows = [];
            let result = await collection.aggregate([
                { $match: {$and : [{$or :[...addressCondition]}, { 'orderState': '2'}]} },
                { $sort: {updateTime: 1}},
                { $lookup: {from: "pasar_order_platform_fee", localField: "orderId", foreignField: "orderId", as: "platformFee"} },
                { 
                    $lookup: {from: "pasar_order_event",
                    let: {"torderId": "$orderId"},
                    pipeline: [{$match: {$and: [{"$expr":{"$eq":["$$torderId","$orderId"]}}, {event:"OrderFilled"}]}}],
                    as: "royatly"}
                },
                { 
                    $lookup: {from: "pasar_token",
                    let: {"ttokenId": "$tokenId", "tbaseToken": "$baseToken", "tmarketPlace": "$marketPlace"},
                    pipeline: [{$match: {$and: [{"$expr":{"$eq":["$$ttokenId","$tokenId"]}},{"$expr":{"$eq":["$$tbaseToken","$baseToken"]}}, {"$expr":{"$eq":["$tmarketPlace","$marketPlace"]}}]}}],
                    as: "token"}
                },
                {$unwind: "$royatly"},
                {$unwind: "$token"},
                { $project: {"_id": 0, royaltyOwner: 1, sellerAddr: 1, tokenId: 1, orderId: 1, filled: 1, royaltyFee: 1, updateTime: 1, amount: 1, quoteToken: 1, baseToken: 1, marketPlace: 1, platformFee: 1, royatly: 1, royaltyOwner: "$token.royaltyOwner"} },
            ]).toArray();
            result.forEach(x => {
                let platformFee = x.platformFee.length > 0 ? x.platformFee[0].platformFee: 0;
                let royalty = x.royaltyOwner != walletAddr && x.royatly && x.royatly.royaltyFee ? x.royatly.royaltyFee : 0;
                x.value = type == 0 ? (x.sellerAddr == x.royaltyOwner? 0: parseInt(royalty)) : (parseInt(x.filled) - parseInt(royalty)) * parseFloat(x.amount) - parseInt(platformFee);
                rows.push(x);
            });
            let now  = Date.now().toString();
            collection =  client.db(config.dbName).collection('token_temp' + now);
            result = [];
            if(rows.length > 0) {
                await collection.insertMany(rows);
                result = await collection.aggregate([
                    // { $addFields: {onlyDate: {$dateToString: {format: '%Y-%m-%d %H', date: '$time'}}} },
                    { $group: { "_id"  : { onlyDate: "$updateTime", quoteToken: "$quoteToken"}, "value": {$sum: "$value"}} },
                    { $project: {_id: 0, onlyDate: "$_id.onlyDate", quoteToken: "$_id.quoteToken",value:1} },
                    { $sort: {onlyDate: 1} },
                ]).toArray();
                await collection.drop();
            }
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

            let createdNft = await this.getCreatedCollectiblesByAddress(walletAddr, false, '0');
            let assets = 0;
            if(createdNft.code == 200) {
                assets = createdNft.data.length;
            }
            let tokens_burned = await mongoClient.db(config.dbName).collection('pasar_token_event').aggregate([
                { $match: {$and: [{to: config.burnAddress}, {from: walletAddr}]} },
                { $project: {"_id": 0, tokenId: 1} }
            ]).toArray();
            let burn_tokens = [];
            tokens_burned.forEach(ele => {
                burn_tokens.push(ele['tokenId']);
            });
            
            let collection = mongoClient.db(config.dbName).collection('pasar_token_event');
  
            let all_collectibles = await collection.aggregate([
                { $match: {$or: [{from: walletAddr}, {to: walletAddr}]} }
            ]).toArray();

            collection = mongoClient.db(config.dbName).collection('pasar_order_event');

            let soldNft = await this.getSoldCollectiblesByAddress(walletAddr, false, '0');
            let count_sold = 0;
            if(createdNft.code == 200) {
                count_sold = soldNft.data.length;
            }

            let count_purchased = await collection.aggregate([
                { $match: {$and: [{buyerAddr: walletAddr}, {event: 'OrderFilled'}]} }
            ]).toArray();
            let count_transactions = await collection.aggregate([
                { $match: {$or: [{sellerAddr: walletAddr}, {buyerAddr: walletAddr}]} }
            ]).toArray();
            result = {assets: assets, sold: count_sold, purchased: count_purchased.length, transactions: count_transactions.length + all_collectibles.length};
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
                            timestamp: 1, price: 1, tokenId: 1, blockNumber: 1, royaltyFee: 1, orderId: 1, baseToken: 1, marketPlace: 1, v1Event: 1} }
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
                            timestamp: 1, memo: 1, tokenId: 1, blockNumber: 1, royaltyFee: "0", token: 1} }
                      ],
                      "as": "collection2"
                    }}
                  ],
                //   "collection3": [
                //     { $limit: 1 },
                //     { $lookup: {
                //       from: "pasar_approval_event",
                //       pipeline: [
                //         { $match: {owner: walletAddr} },
                //         { $project: {'_id': 0, event: 'SetApprovalForAll', tHash: "$transactionHash", from: '$owner', to: '$operator', gasFee: 1, timestamp: 1} },
                //         { $limit:  1 },
                //         { $match: methodCondition_approval}],
                //       "as": "collection3"
                //     }}
                //   ]
                }},
                { $project: {
                  data: {
                    $concatArrays: [
                      { "$arrayElemAt": ["$collection1.collection1", 0] },
                      { "$arrayElemAt": ["$collection2.collection2", 0] },
                    //   { "$arrayElemAt": ["$collection3.collection3", 0] },
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
                let res  = await collection_token.findOne({$and:[{tokenId: result[i]['tokenId'], marketPlace: result[i]['marketPlace'],$or: [{baseToken: result[i]['baseToken']}, {baseToken: result[i]['token']}]}, {$or: [{name: new RegExp(keyword.toString())}, {royaltyOwner: keyword}, {holder: keyword}, {tokenId: keyword}]}]});
                // if(res != null) {
                //     result[i]['name'] = res['name'];
                //     result[i]['royalties'] = res['royalties'];
                //     result[i]['asset'] = res['asset'];
                //     result[i]['royaltyOwner'] = res['royaltyOwner'];
                //     result[i]['thumbnail'] = res['thumbnail'];
                //     result[i]['quoteToken'] = res['quoteToken'] ? res['quoteToken'] : null;
                //     result[i]['data'] = {...result[i]['data'], ...res['data']};
                //     result[i]['tokenJsonVersion'] = res['tokenJsonVersion'];
                // } 
                result[i]['name'] = res && res['name'] ? res['name'] : null;
                result[i]['royalties'] = res && res['royalties'] ? res['royalties'] : null;
                result[i]['asset'] = res && res['asset'] ? res['asset'] : null;
                result[i]['royaltyOwner'] = res && res['royaltyOwner'] ? res['royaltyOwner'] : null;
                result[i]['thumbnail'] = res && res['thumbnail'] ? res['thumbnail'] : null;
                result[i]['quoteToken'] = res && res['quoteToken'] ? res['quoteToken'] : null;
                result[i]['tokenJsonVersion'] = res && res['tokenJsonVersion'] ? res['tokenJsonVersion'] : null;
                result[i]['data'] = res && res['data'] ? {...result[i]['data'], ...res['data']} : null;

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
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    getLatestBids: async function (tokenId, sellerAddr, baseToken=null) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_order_event');
            let result = await collection.aggregate([
                { $match: { $and: [{sellerAddr: sellerAddr}, {tokenId : new RegExp(tokenId.toString())}, {baseToken: baseToken}, {event: 'OrderBid'} ] } },
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
            return {code: 500, message: 'server error'};
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
            return {code: 500, message: 'server error'};
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
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    getDetailedCollectibles: async function (status, minPrice, maxPrice, collectionType, itemType, adult, order, pageNum, pageSize, keyword, marketPlace, tokenType=null) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        let sort = {};
        let rateEndTime = {};
        switch (order) {
            case '0':
                sort = {marketTime: -1, createTime: -1};
                break;
            case '1':
                sort = {createTime: -1};
                break;
            case '2':
                sort = {marketTime: 1, createTime: -1};
                break;
            case '3':
                sort = {createTime: 1};
                break;
            case '4':
                sort = {priceCalculated: 1};
                break;
            case '5':
                sort = {priceCalculated: -1};
                break;
            case '6':
                sort = {marketTime: -1}
                let start = Date.now();
                let endTime = Math.floor((start + (24 * 60 * 60 * 1000))/1000).toString();
                start = Math.floor(start/1000).toString();
                rateEndTime = {$and: [{endTime: {$gte: start}}, {endTime: {$lte: endTime}}]};
            default:
                sort = {marketTime: -1}
        }
        try {
            await mongoClient.connect();
            let collection  = mongoClient.db(config.dbName).collection('pasar_token');
            let collection_order  = mongoClient.db(config.dbName).collection('pasar_order');
            let status_condition = [];
            let statusArr = status.split(',');
            let tokenTypeCheck = {};
            if(tokenType != null && tokenType != '') {
                let typeArr = tokenType.split(',');
                if(typeArr.indexOf('0x0000000000000000000000000000000000000000') != -1) {
                    typeArr.push(null);
                }
                tokenTypeCheck = {quoteToken: {$in: typeArr}};
            }
            let collectionTypeCheck = {};
            if(collectionType != null && collectionType != '') {
                let collectionTypeArr = collectionType.split(',');
                collectionTypeCheck = {$or: [{tokenJsonVersion: {$in: collectionTypeArr}}, {baseToken: {$in: collectionTypeArr}}]}
            }

            let checkOrder = [{$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}}, {$expr: {$eq: ["$$tmarketPlace", "$marketPlace"]}}];
            for (let i = 0; i < statusArr.length; i++) {
                const ele = statusArr[i];
                if(ele == 'All') {
                    status_condition.push({status: 'MarketAuction'});
                    status_condition.push({status: 'MarketBid'});
                    status_condition.push({status: 'MarketSale'});
                    status_condition.push({status: 'MarketPriceChanged'});
                } else if(ele == 'Buy Now'){
                    status_condition.push({status: 'MarketSale'});
                } else if(ele == 'On Auction') {
                    let current = Date.now();
                    current = Math.floor(current/1000).toString();

                    status_condition.push({$and: [{endTime: {$gt: current}}, {$or: [{status: 'MarketBid'}, {status: 'MarketAuction'}]}]});
                } else if(ele == 'Has Bids') {
                    status_condition.push({status: 'MarketBid'});
                } else if(ele == 'Has Ended') {
                    let current = Date.now();
                    current = Math.floor(current/1000).toString();

                    status_condition.push({$and: [{endTime: {$lte: current}}, {$or: [{status: 'MarketBid'}, {status: 'MarketAuction'}]}]});
                }
            }
            let temp_collection =  mongoClient.db(config.dbName).collection('collectible_temp_' + Date.now().toString());
            let checkMarketPlace;
            if(marketPlace == 0) {
                checkMarketPlace = {marketPlace: {$in: [config.elastos.chainType, config.ethereum.chainType, config.fusion.chainType]}};
            } else {
                checkMarketPlace = {marketPlace : marketPlace}
            }

            if(!(statusArr.length == 1 && statusArr.indexOf('Not Met') != -1)) {

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
                await collection.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});
                await collection_order.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});
                let marketTokens = await collection.aggregate([
                    { $match: {$and: [tokenTypeCheck, collectionTypeCheck, rateEndTime, status_condition, checkMarketPlace, itemType_condition, {adult: adult == "true"}, {$or: [{tokenId: keyword},{tokenIdHex: keyword}, {name: new RegExp(keyword)}, {royaltyOwner: keyword}]}]} },
                    {$addFields: {"currentBid": [{price: "$price"}], createTime: {$toInt:"$createTime"}, updateTime: {$toInt:"$updateTime"}, marketTime: {$toInt:"$marketTime"}}},
                    { $lookup: {
                        from: "pasar_order",
                        let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken", "tmarketPlace": "$marketPlace"},
                        pipeline: [{$match: {$and: checkOrder}}],
                        as: "tokenOrder"}},
                    { $unwind: "$tokenOrder"},
                    { $project: {"_id": 0, blockNumber: 1, tokenIndex: 1, tokenId: 1, quantity:1, royalties:1, royaltyOwner:1, holder: 1,
                    createTime: 1, updateTime: 1, tokenIdHex: 1, tokenJsonVersion: 1, type: 1, name: 1, description: 1, properties: 1,
                    data: 1, asset: 1, adult: 1, price: "$tokenOrder.price", buyoutPrice: "$tokenOrder.buyoutPrice", quoteToken: 1,
                    marketTime:1, status: 1, endTime:1, orderId: 1, orderType: "$tokenOrder.orderType", orderState: "$tokenOrder.orderState", amount: "$tokenOrder.amount",
                    baseToken: 1, marketPlace: 1,reservePrice: "$tokenOrder.reservePrice",currentBid: 1, thumbnail: 1, kind: 1, lastBid: "$tokenOrder.lastBid", v1State: 1},},
                ]).toArray();

                let rates = await this.getPriceRate();
                let listRate_ela = [], listRate_eth = [], listRate_fusion = [];
                for(var i=0; i < rates.length; i++) {
                    if(rates[i].marketPlace == config.elastos.chainType) {
                        listRate_ela[rates[i].type] = rates[i].rate;
                    } else if(rates[i].marketPlace == config.ethereum.chainType) {
                        listRate_eth[rates[i].type] = rates[i].rate;
                    } else if(rates[i].marketPlace == config.fusion.chainType) {
                        listRate_fusion[rates[i].type] = rates[i].rate;
                    }
                }
                
                for(var i = 0; i < marketTokens.length; i++) {
                    let convertToken = marketTokens[i].quoteToken;
                    if(marketTokens[i].quoteToken == config.elastos.diaTokenContract)
                        convertToken = '0x2C8010Ae4121212F836032973919E8AeC9AEaEE5';

                    let rate = 1;
                    switch(marketTokens[i].marketPlace) {
                        case config.elastos.chainType:
                            rate = listRate_ela[convertToken];
                            break;
                        case config.ethereum.chainType:
                            rate = listRate_eth[convertToken];
                            break;
                        case config.fusion.chainType:
                            rate = listRate_fusion[convertToken];
                            break;
                        default:
                            rate = 1;
                            break;
                    }

                    marketTokens[i].priceCalculated = parseInt(marketTokens[i].price) * rate / 10 ** 18;
                }

                if(marketTokens.length > 0)
                    await temp_collection.insertMany(marketTokens);
            }

            let dataNotMet = [], dataBuyNow = [];

            if(statusArr.indexOf('Not Met') != -1) {
                dataNotMet = await this.getNotMetCollectibles(minPrice, maxPrice, collectionType, itemType, adult, keyword, marketPlace,tokenType=null)
            }

            if(statusArr.indexOf('Buy Now') != -1) {
                dataBuyNow = await this.getBuyNowCollectibles(minPrice, maxPrice, collectionType, itemType, adult, keyword, marketPlace,tokenType=null)
            }

            for(var i = 0; i < dataNotMet.length; i++) {
                await temp_collection.updateOne({tokenId: dataNotMet[i].tokenId}, {$set: dataNotMet[i]}, {upsert: true});
            }

            for(var i = 0; i < dataBuyNow.length; i++) {
                await temp_collection.updateOne({tokenId: dataBuyNow[i].tokenId}, {$set: dataBuyNow[i]}, {upsert: true});
            }


            let total = await temp_collection.find({$and: [{priceCalculated: {$gte: minPrice}}, {priceCalculated: {$lte: maxPrice}}]}).count();
            let returnValue = await temp_collection.find({$and: [{priceCalculated: {$gte: minPrice}}, {priceCalculated: {$lte: maxPrice}}]}).sort(sort).skip((pageNum - 1) * pageSize).limit(pageSize).toArray();

            if(total > 0)
                await temp_collection.drop();

            return {code: 200, message: 'success', data: {total: total, result: returnValue}};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    getBuyNowCollectibles: async function (minPrice, maxPrice, collectionType, itemType, adult, keyword, marketPlace, tokenType=null) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});

        try {
            await mongoClient.connect();
            let collection  = mongoClient.db(config.dbName).collection('pasar_token');
            let status_condition = [];
            let tokenTypeCheck = {};
            if(tokenType != null && tokenType != '') {
                let typeArr = tokenType.split(',');
                if(typeArr.indexOf('0x0000000000000000000000000000000000000000') != -1) {
                    typeArr.push(null);
                }
                tokenTypeCheck = {quoteToken: {$in: typeArr}};
            }
            let collectionTypeCheck = {};
            if(collectionType != null && collectionType != '') {
                let collectionTypeArr = collectionType.split(',');
                collectionTypeCheck = {$or: [{tokenJsonVersion: {$in: collectionTypeArr}}, {baseToken: {$in: collectionTypeArr}}]}
            }

            let checkOrder = [{$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}}, {$expr: {$eq: ["$$tmarketPlace", "$marketPlace"]}}];
            checkOrder.push({ $and: [{buyoutPrice: {$ne: null}}, {buyoutPrice: {$ne: "0"}}] });
            let current = Date.now();
            current = Math.floor(current/1000).toString();
            status_condition.push({$and: [{endTime: {$gt: current}}, {$or: [{status: 'MarketBid'}, {status: 'MarketAuction'}]}]});
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
            // if(minPrice) {
            //     checkOrder.push({price: {$gte: minPrice.toString()}});
            // }
            // if(maxPrice) {
            //     checkOrder.push({price: {$lte: maxPrice.toString()}});
            // }

            let checkMarketPlace;
            if(marketPlace == 0) {
                checkMarketPlace = {marketPlace: {$in: [config.elastos.chainType, config.ethereum.chainType, config.fusion.chainType]}};
            } else {
                checkMarketPlace = {marketPlace : marketPlace}
            }

            let market_condition = { $or: [{status: 'MarketSale'}, {status: 'MarketAuction'}, {status: 'MarketBid'}, {status: 'MarketPriceChanged'}] };
            let collection_order  = mongoClient.db(config.dbName).collection('pasar_order');
            await collection.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});
            await collection_order.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});

            let marketTokens = await collection.aggregate([
                { $match: {$and: [{holder: {$ne: burnAddress}}, tokenTypeCheck, collectionTypeCheck, checkMarketPlace, status_condition, itemType_condition, {adult: adult == "true"}, {$or: [{tokenId: keyword},{tokenIdHex: keyword}, {name: new RegExp(keyword)}, {royaltyOwner: keyword}]}]} },
                { $lookup: {
                    from: "pasar_order",
                    let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken", "tmarketPlace": "$marketPlace"},
                    pipeline: [{$match: {$and: checkOrder}}],
                    as: "tokenOrder"}},
                {$addFields: {
                    "currentBid": [{price: "$price"}]
                }},
                { $unwind: "$tokenOrder"},
                { $project: {"_id": 0, blockNumber: 1, tokenIndex: 1, tokenId: 1, quantity:1, royalties:1, royaltyOwner:1, holder: 1,
                createTime: 1, updateTime: 1, tokenIdHex: 1, tokenJsonVersion: 1, type: 1, name: 1, description: 1, properties: 1,
                data: 1, asset: 1, adult: 1, price: "$tokenOrder.price", buyoutPrice: "$tokenOrder.buyoutPrice", quoteToken: 1,
                marketTime:1, status: 1, endTime:1, orderId: 1, orderType: "$tokenOrder.orderType", orderState: "$tokenOrder.orderState", amount: "$tokenOrder.amount",
                baseToken: 1, marketPlace: 1,reservePrice: "$tokenOrder.reservePrice",currentBid: 1, thumbnail: 1, kind: 1, lastBid: "$tokenOrder.lastBid", v1State: 1 },},
            ]).toArray();

            let rates = await this.getPriceRate();
            let listRate_ela = [], listRate_eth = [], listRate_fusion = [];
            for(var i=0; i < rates.length; i++) {
                if(rates[i].marketPlace == config.elastos.chainType) {
                    listRate_ela[rates[i].type] = rates[i].rate;
                } else if(rates[i].marketPlace == config.ethereum.chainType) {
                    listRate_eth[rates[i].type] = rates[i].rate;
                } else if(rates[i].marketPlace == config.fusion.chainType) {
                    listRate_fusion[rates[i].type] = rates[i].rate;
                }
            }

            let marketStatus = ['MarketSale', 'MarketAuction', 'MarketBid', 'MarketPriceChanged'];

            for(var i = 0; i < marketTokens.length; i++) {
                marketTokens[i].createTime = marketTokens[i].createTime ? parseInt(marketTokens[i].createTime) : 0;
                marketTokens[i].updateTime = marketTokens[i].updateTime ? parseInt(marketTokens[i].updateTime) : 0;
                marketTokens[i].marketTime = marketTokens[i].marketTime ? parseInt(marketTokens[i].marketTime) : 0;

                let convertToken = marketTokens[i].quoteToken;
                if(marketTokens[i].quoteToken == config.elastos.diaTokenContract)
                    convertToken = '0x2C8010Ae4121212F836032973919E8AeC9AEaEE5';

                let rate = 1;
                switch(marketTokens[i].marketPlace) {
                    case config.elastos.chainType:
                        rate = listRate_ela[convertToken];
                        break;
                    case config.ethereum.chainType:
                        rate = listRate_eth[convertToken];
                        break;
                    case config.fusion.chainType:
                        rate = listRate_fusion[convertToken];
                        break;
                    default:
                        rate = 1;
                        break;
                }

                marketTokens[i].priceCalculated = parseInt(marketTokens[i].price) * rate / 10 ** 18;

                marketTokens[i].priceCalculated = marketTokens[i].priceCalculated ? marketTokens[i].priceCalculated : 0; 
                if( marketStatus.indexOf(marketTokens[i]['status']) != -1 ) {
                    if(marketTokens[i]['holder'] == marketTokens[i]['royaltyOwner']) {
                        marketTokens[i].saleType = 'Primary Sale';
                    } else {
                        marketTokens[i].saleType = 'Secondary Sale';
                    }
                }else {
                    marketTokens[i].saleType = 'Not on sale';
                    marketTokens[i].priceCalculated = 0;
                }
            }

            return marketTokens;
        } catch (err) {
            logger.error(err);
            return [];
        } finally {
            await mongoClient.close();
        }
    },

    getNotMetCollectibles: async function (minPrice, maxPrice, collectionType, itemType, adult, keyword, marketPlace,tokenType=null) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});

        try {
            await mongoClient.connect();
            let collection  = mongoClient.db(config.dbName).collection('pasar_token');
            let status_condition = [];
            let tokenTypeCheck = {};
            if(tokenType != null && tokenType != '') {
                let typeArr = tokenType.split(',');
                if(typeArr.indexOf('0x0000000000000000000000000000000000000000') != -1) {
                    typeArr.push(null);
                }
                tokenTypeCheck = {quoteToken: {$in: typeArr}};
            }
            let collectionTypeCheck = {};
            if(collectionType != null && collectionType != '') {
                let collectionTypeArr = collectionType.split(',');
                collectionTypeCheck = {$or: [{tokenJsonVersion: {$in: collectionTypeArr}}, {baseToken: {$in: collectionTypeArr}}]}
            }

            let checkOrder = [{$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}}, {$expr: {$eq: ["$$tmarketPlace", "$marketPlace"]}}];
            status_condition.push({status: 'MarketBid'});
            status_condition.push({status: 'MarketAuction'});
            checkOrder.push({ $expr:{ $lt:["$lastBid", "$reservePrice"] } });

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
        
            // if(minPrice) {
            //     checkOrder.push({price: {$gte: minPrice.toString()}});
            // }
            // if(maxPrice) {
            //     checkOrder.push({price: {$lte: maxPrice.toString()}});
            // }
            let checkMarketPlace;
            if(marketPlace == 0) {
                checkMarketPlace = {marketPlace: {$in: [config.elastos.chainType, config.ethereum.chainType, config.fusion.chainType]}};
            } else {
                checkMarketPlace = {marketPlace : marketPlace}
            }

            let market_condition = { $or: [{status: 'MarketSale'}, {status: 'MarketAuction'}, {status: 'MarketBid'}, {status: 'MarketPriceChanged'}] };
            let collection_order  = mongoClient.db(config.dbName).collection('pasar_order');
            await collection.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});
            await collection_order.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});
            let marketTokens = await collection.aggregate([
                { $match: {$and: [{holder: {$ne: burnAddress}}, market_condition, tokenTypeCheck, checkMarketPlace, collectionTypeCheck, status_condition, itemType_condition, {adult: adult == "true"}, {$or: [{tokenId: keyword},{tokenIdHex: keyword}, {name: new RegExp(keyword)}, {royaltyOwner: keyword}]}]} },
                { $lookup: {
                    from: "pasar_order",
                    let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken", "tmarketPlace": "$marketPlace"},
                    pipeline: [{$match: {$and: checkOrder}}],
                    as: "tokenOrder"}},
                {$addFields: {
                    "currentBid": [{price: "$price"}]
                }}, 
                { $unwind: "$tokenOrder"},
                { $project: {"_id": 0, blockNumber: 1, tokenIndex: 1, tokenId: 1, quantity:1, royalties:1, royaltyOwner:1, holder: 1,
                createTime: 1, updateTime: 1, tokenIdHex: 1, tokenJsonVersion: 1, type: 1, name: 1, description: 1, properties: 1,
                data: 1, asset: 1, adult: 1, price: "$tokenOrder.price", buyoutPrice: "$tokenOrder.buyoutPrice", quoteToken: 1,
                marketTime:1, status: 1, endTime:1, orderId: 1, orderType: "$tokenOrder.orderType", orderState: "$tokenOrder.orderState", amount: "$tokenOrder.amount",
                baseToken: 1, marketPlace: 1, reservePrice: "$tokenOrder.reservePrice",currentBid: 1, thumbnail: 1, kind: 1, lastBid: "$tokenOrder.lastBid", v1State: 1 },},
            ]).toArray();
            let rates = await this.getPriceRate();
            let listRate_ela = [], listRate_eth = [], listRate_fusion = [];
            for(var i=0; i < rates.length; i++) {
                if(rates[i].marketPlace == config.elastos.chainType) {
                    listRate_ela[rates[i].type] = rates[i].rate;
                } else if(rates[i].marketPlace == config.ethereum.chainType) {
                    listRate_eth[rates[i].type] = rates[i].rate;
                } else if(rates[i].marketPlace == config.fusion.chainType) {
                    listRate_fusion[rates[i].type] = rates[i].rate;
                }
            }
                
            let marketStatus = ['MarketSale', 'MarketAuction', 'MarketBid', 'MarketPriceChanged'];

            for(var i = 0; i < marketTokens.length; i++) {
                marketTokens[i].createTime = marketTokens[i].createTime ? parseInt(marketTokens[i].createTime) : 0;
                marketTokens[i].updateTime = marketTokens[i].updateTime ? parseInt(marketTokens[i].updateTime) : 0;
                marketTokens[i].marketTime = marketTokens[i].marketTime ? parseInt(marketTokens[i].marketTime) : 0;

                let convertToken = marketTokens[i].quoteToken;
                if(marketTokens[i].quoteToken == config.elastos.diaTokenContract)
                    convertToken = '0x2C8010Ae4121212F836032973919E8AeC9AEaEE5';
                let rate = 1;
                switch(marketTokens[i].marketPlace) {
                    case config.elastos.chainType:
                        rate = listRate_ela[convertToken];
                        break;
                    case config.ethereum.chainType:
                        rate = listRate_eth[convertToken];
                        break;
                    case config.fusion.chainType:
                        rate = listRate_fusion[convertToken];
                        break;
                    default:
                        rate = 1;
                        break;
                }

                marketTokens[i].priceCalculated = parseInt(marketTokens[i].price) * rate / 10 ** 18;

                if( marketStatus.indexOf(marketTokens[i]['status']) != -1 ) {
                    if(marketTokens[i]['holder'] == marketTokens[i]['royaltyOwner']) {
                        marketTokens[i].saleType = 'Primary Sale';
                    } else {
                        marketTokens[i].saleType = 'Secondary Sale';
                    }
                }else {
                    marketTokens[i].saleType = 'Not on sale';
                    marketTokens[i].priceCalculated = 0;
                }
            }

            return marketTokens;
        } catch (err) {
            logger.error(err);
            return [];
        } finally {
            await mongoClient.close();
        }
    },

    getDetailedCollectiblesInCollection: async function (status, minPrice, maxPrice, collectionType, itemType, adult, order, pageNum, pageSize, keyword, attribute, marketPlace,tokenType=null) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        let sort = {};
        let rateEndTime = {};
        switch (order) {
            case 0:
                sort = {marketTime: -1, createTime: -1};
                break;
            case 1:
                sort = {createTime: -1};
                break;
            case 2:
                sort = {marketTime: 1, createTime: -1};
                break;
            case 3:
                sort = {createTime: 1};
                break;
            case 4:
                sort = {priceCalculated: 1};
                break;
            case 5:
                sort = {priceCalculated: -1};
                break;
            case 6:
                sort = {marketTime: -1}
                let start = Date.now();
                let endTime = Math.floor((start + (24 * 60 * 60 * 1000))/1000).toString();
                start = Math.floor(start/1000).toString();
                rateEndTime = {$and: [{endTime: {$gte: start}}, {endTime: {$lte: endTime}}]};
            default:
                sort = {marketTime: -1}
        }
        try {
            await mongoClient.connect();
            let collection  = mongoClient.db(config.dbName).collection('pasar_token');
            let status_condition = [];
            let statusArr = status.split(',');
            let tokenTypeCheck = {};
            if(tokenType != null && tokenType != '') {
                let typeArr = tokenType.split(',');
                if(typeArr.indexOf('0x0000000000000000000000000000000000000000') != -1) {
                    typeArr.push(null);
                }
                tokenTypeCheck = {quoteToken: {$in: typeArr}};
            }
            let collectionTypeCheck = {};
            if(collectionType != null && collectionType != '') {
                let collectionTypeArr = collectionType.split(',');
                collectionTypeCheck = {$or: [{tokenJsonVersion: {$in: collectionTypeArr}}, {baseToken: {$in: collectionTypeArr}}]}
            }

            let checkOrder = [{$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}},  {$expr: {$eq: ["$$tmarketPlace", "$marketPlace"]}}];
            for (let i = 0; i < statusArr.length; i++) {
                const ele = statusArr[i];
                if(ele == 'All') {
                    status_condition.push({status: 'MarketAuction'});
                    status_condition.push({status: 'MarketBid'});
                    status_condition.push({status: 'MarketSale'});
                    status_condition.push({status: 'Not on sale'});
                } else if(ele == 'Buy Now'){
                    status_condition.push({status: 'MarketSale'});
                } else if(ele == 'On Auction') {
                    let current = Date.now();
                    current = Math.floor(current/1000).toString();

                    status_condition.push({$and: [{endTime: {$gt: current}}, {$or: [{status: 'MarketBid'}, {status: 'MarketAuction'}]}]});
                } else if(ele == 'Has Bids') {
                    status_condition.push({status: 'MarketBid'});
                } else if(ele == 'Has Ended') {
                    let current = Date.now();
                    current = Math.floor(current/1000).toString();

                    status_condition.push({$and: [{endTime: {$lte: current}}, {$or: [{status: 'MarketBid'}, {status: 'MarketAuction'}]}]});
                } 
            }

            let temp_collection =  mongoClient.db(config.dbName).collection('collectible_temp_' + Date.now().toString());

            if(!(statusArr.length == 1 && statusArr.indexOf('Not Met') != -1)) {

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
                
                let jsonAttribute = attribute;
                let checkAttribute = {};

                if(attribute) {
                    let listCheckAttribute = [];
                    Object.keys(attribute).forEach(key => {
                        let listValues = jsonAttribute[key];
                        let listValueCheck = [];
                        listValues.forEach(value => {
                            let objValue = {};
                            objValue["attribute." + key] = value;
                            listValueCheck.push(objValue);
                        });

                        listCheckAttribute.push({$or: listValueCheck});
                    });
                    checkAttribute = {$and: listCheckAttribute};
                }
                let checkMarketPlace;
                if(marketPlace == 0) {
                    checkMarketPlace = {marketPlace: {$in: [config.elastos.chainType, config.ethereum.chainType, config.fusion.chainType]}};
                } else {
                    checkMarketPlace = {marketPlace : marketPlace}
                }
                let market_condition = { $or: [{status: 'MarketSale'}, {status: 'MarketAuction'}, {status: 'MarketBid'}, {status: 'MarketPriceChanged'}, {status: 'Not on sale'}] };
                let collection_order  = mongoClient.db(config.dbName).collection('pasar_order');
                await collection.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1});
                await collection_order.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1});

                let marketTokens = await collection.aggregate([
                    { $match: {$and: [{holder: {$ne: burnAddress}}, market_condition, checkMarketPlace, tokenTypeCheck, collectionTypeCheck, rateEndTime, status_condition, checkAttribute, {$or: [{tokenId: keyword},{tokenIdHex: keyword}, {name: new RegExp(keyword)}, {royaltyOwner: keyword}]}]} },
                    { $lookup: {
                        from: "pasar_order",
                        let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken", "tmarketPlace": "$marketPlace"},
                        pipeline: [{$match: {$and: checkOrder}}],
                        as: "tokenOrder"}},
                    {$addFields: {
                        "currentBid": [{price: "$price"}]
                    }},
                    { $unwind: {path: "$tokenOrder", preserveNullAndEmptyArrays: true}},
                    { $project: {"_id": 0, blockNumber: 1, tokenIndex: 1, tokenId: 1, quantity:1, royalties:1, royaltyOwner:1, holder: 1,
                    createTime: 1, updateTime: 1, tokenIdHex: 1, tokenJsonVersion: 1, type: 1, name: 1, description: 1, properties: 1,
                    data: 1, asset: 1, adult: 1, price: "$tokenOrder.price", buyoutPrice: "$tokenOrder.buyoutPrice", quoteToken: 1,
                    marketTime:1, status: 1, endTime:1, orderId: 1, orderType: "$tokenOrder.orderType", orderState: "$tokenOrder.orderState", amount: "$tokenOrder.amount",
                    baseToken: 1, marketPlace: 1, reservePrice: "$tokenOrder.reservePrice",currentBid: 1, thumbnail: 1, kind: 1, attribute: 1, lastBid: "$tokenOrder.lastBid", v1State: 1 },},
                ]).toArray();
                
                let marketStatus = ['MarketSale', 'MarketAuction', 'MarketBid', 'MarketPriceChanged'];
                
                let rates = await this.getPriceRate();
                let listRate_ela = [], listRate_eth = [], listRate_fusion = [];
                for(var i=0; i < rates.length; i++) {
                    if(rates[i].marketPlace == config.elastos.chainType) {
                        listRate_ela[rates[i].type] = rates[i].rate;
                    } else if(rates[i].marketPlace == config.ethereum.chainType) {
                        listRate_eth[rates[i].type] = rates[i].rate;
                    } else if(rates[i].marketPlace == config.fusion.chainType) {
                        listRate_fusion[rates[i].type] = rates[i].rate;
                    } 
                }

                let listRate = [];
                for(var i=0; i < rates.length; i++) {
                    listRate[rates[i].type] = rates[i].rate;
                }

                for (let i = 0; i < marketTokens.length; i++) {
                    marketTokens[i].createTime = marketTokens[i].createTime ? parseInt(marketTokens[i].createTime) : 0;
                    marketTokens[i].updateTime = marketTokens[i].updateTime ? parseInt(marketTokens[i].updateTime) : 0;
                    marketTokens[i].marketTime = marketTokens[i].marketTime ? parseInt(marketTokens[i].marketTime) : 0;
                    
                    let convertToken = marketTokens[i].quoteToken;
                    if(marketTokens[i].quoteToken == config.elastos.diaTokenContract)
                        convertToken = '0x2C8010Ae4121212F836032973919E8AeC9AEaEE5';

                    let rate = 1;
                    switch(marketTokens[i].marketPlace) {
                        case config.elastos.chainType:
                            rate = listRate_ela[convertToken];
                            break;
                        case config.ethereum.chainType:
                            rate = listRate_eth[convertToken];
                            break;
                        case config.fusion.chainType:
                            rate = listRate_fusion[convertToken];
                            break;
                        default:
                            rate = 1;
                            break;
                    }

                    marketTokens[i].priceCalculated = parseInt(marketTokens[i].price) * rate / 10 ** 18;

                    marketTokens[i].priceCalculated = marketTokens[i].priceCalculated ? marketTokens[i].priceCalculated : 0; 
                    if( marketStatus.indexOf(marketTokens[i]['status']) != -1 ) {
                        if(marketTokens[i]['holder'] == marketTokens[i]['royaltyOwner']) {
                            marketTokens[i].saleType = 'Primary Sale';
                        } else {
                            marketTokens[i].saleType = 'Secondary Sale';
                        }
                    }else {
                        marketTokens[i].saleType = 'Not on sale';
                        marketTokens[i].priceCalculated = 0; 
                    }
                }

                if(marketTokens.length > 0)
                    await temp_collection.insertMany(marketTokens);
            }

            let dataNotMet = [], dataBuyNow = [];

            if(statusArr.indexOf('Not Met') != -1) {
                dataNotMet = await this.getNotMetCollectibles(minPrice, maxPrice, collectionType, itemType, adult, keyword, marketPlace, tokenType=null)
            }

            if(statusArr.indexOf('Buy Now') != -1) {
                dataBuyNow = await this.getBuyNowCollectibles(minPrice, maxPrice, collectionType, itemType, adult, keyword, marketPlace, tokenType=null)
            }

            for(var i = 0; i < dataNotMet.length; i++) {
                await temp_collection.updateOne({tokenId: dataNotMet[i].tokenId}, {$set: dataNotMet[i]}, {upsert: true});
            }

            for(var i = 0; i < dataBuyNow.length; i++) {
                await temp_collection.updateOne({tokenId: dataBuyNow[i].tokenId}, {$set: dataBuyNow[i]}, {upsert: true});
            }

            let total = await temp_collection.find({$and: [{priceCalculated: {$gte: minPrice}}, {priceCalculated: {$lte: maxPrice}}]}).count();
            let returnValue = await temp_collection.find({$and: [{priceCalculated: {$gte: minPrice}}, {priceCalculated: {$lte: maxPrice}}]}).sort(sort).skip((pageNum - 1) * pageSize).limit(pageSize).toArray();

            if(total > 0)
                await temp_collection.drop();

            return {code: 200, message: 'success', data: {total: total, result: returnValue}};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    getAttributeOfCollection: async function(token, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try{
            await mongoClient.connect();
            let collectionToken  = mongoClient.db(config.dbName).collection('pasar_token');
            let attributesOfToken = await collectionToken.aggregate([
                {$match: {baseToken: token, marketPlace: marketPlace}},
                {$project: {_id: 0, attribute: 1}}
            ]).toArray();
            let result = {};
            attributesOfToken.forEach(token => {
                Object.keys(token.attribute).forEach(att => {                    
                    if(result[att] && result[att][token.attribute[att]] && result[att][token.attribute[att]] != 0) {
                        result[att][token.attribute[att]] += 1;
                    } else {
                        if(!result[att]) {
                            result[att] = {};
                        }
                        result[att][token.attribute[att]] = 1;
                    }
                })
            })
            
            return {code: 200, message: 'success', data: result};
        } catch(err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
        
    },

    getListedCollectiblesByAddress: async function(address, did, orderType, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token');
            let collection_order  = mongoClient.db(config.dbName).collection('pasar_order');
            let collection_order_event  = mongoClient.db(config.dbName).collection('pasar_order_event');
            
            await collection.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});
            await collection_order.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});
            await collection_order_event.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});
            let checkMarketPlace;
            if(marketPlace == 0) {
                checkMarketPlace = {marketPlace: {$in: [config.elastos.chainType, config.ethereum.chainType, config.fusion.chainType]}};
            } else {
                checkMarketPlace = {marketPlace : marketPlace}
            }

            let sort = {};
            switch (orderType) {
                case '0':
                    sort = {updateTime: -1};
                    break;
                case '1':
                    sort = {updateTime: 1};
                    break;
                case '2':
                    sort = {priceCalculated: -1};
                    break;
                case '3':
                    sort = {priceCalculated: 1};
                    break;
                default:
                    sort = {updateTime: -1}
            }
            let checkAddress = address;
            if(did) {
                let addressList = await this.getAddressListFromDid(address);
                checkAddress = {$in: addressList}
            }

            let market_condition = { $or: [{status: 'MarketSale'}, {status: 'MarketAuction'}, {status: 'MarketBid'}, {status: 'MarketPriceChanged'}] };
            let result = await collection.aggregate([
                { $match: {$and: [{holder: checkAddress}, market_condition, checkMarketPlace]} },
                { $lookup: {
                    from: "pasar_order",
                    let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken"},
                    pipeline: [{$match: {$and: [{$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}}]}}],
                    as: "tokenOrder"}},
                { $lookup: {from: "pasar_order_event",
                    let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken"},
                    pipeline: [{$match: {$and: [{event: "OrderBid"}, {$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}}]}}, {$sort: {timestamp: -1}}],
                    as: "currentBid"}},
                { $unwind: "$tokenOrder"},
                { $project: {"_id": 0, blockNumber: 1, tokenIndex: 1, tokenId: 1, quantity:1, royalties:1, royaltyOwner:1, holder: 1,
                createTime: 1, updateTime: 1, tokenIdHex: 1, tokenJsonVersion: 1, type: 1, name: 1, description: 1, properties: 1,
                data: 1, asset: 1, adult: 1, price: "$tokenOrder.price", buyoutPrice: "$tokenOrder.buyoutPrice", quoteToken: "$tokenOrder.quoteToken",
                marketTime:1, status: 1, endTime:1, orderId: 1, priceCalculated: 1, orderType: "$tokenOrder.orderType", amount: "$tokenOrder.amount",
                baseToken: "$tokenOrder.baseToken", marketPlace: 1, reservePrice: "$tokenOrder.reservePrice",currentBid: 1, thumbnail: 1, kind: 1 },},
            ]).toArray();

            result = await this.getSortCollectibles(result, sort)

            return { code: 200, message: 'sucess', data: result};

        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    getOwnCollectiblesByAddress: async function(address, did, orderType, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();

            const token_collection = mongoClient.db(config.dbName).collection('pasar_token');
            let collection_order  = mongoClient.db(config.dbName).collection('pasar_order');
            let collection_order_event  = mongoClient.db(config.dbName).collection('pasar_order_event');
            await token_collection.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1});
            await collection_order.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1});
            await collection_order_event.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1});
            let checkMarketPlace;
            if(marketPlace == 0) {
                checkMarketPlace = {marketPlace: {$in: [config.elastos.chainType, config.ethereum.chainType, config.fusion.chainType]}};
            } else {
                checkMarketPlace = {marketPlace : marketPlace}
            }

            let sort = {};
            switch (orderType) {
                case '0':
                    sort = {marketTime: -1};
                    break;
                case '1':
                    sort = {marketTime: 1};
                    break;
                case '2':
                    sort = {priceCalculated: -1};
                    break;
                case '3':
                    sort = {priceCalculated: 1};
                    break;
                default:
                    sort = {marketTime: -1}
            }

            let checkAddress = address;
            if(did) {
                let addressList = await this.getAddressListFromDid(address);
                checkAddress = {$in: addressList}
            }

            let tokens = await token_collection.aggregate([
                { $match: {$and: [{holder: checkAddress}, checkMarketPlace]} },
                { $lookup: {
                    from: "pasar_order",
                    let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken"},
                    pipeline: [{$match: {$and: [{$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}}]}}],
                    as: "tokenOrder"}},
                { $lookup: {from: "pasar_order_event",
                    let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken"},
                    pipeline: [{$match: {$and: [{event: "OrderBid"}, {$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}}]}}, {$sort: {timestamp: -1}}],
                    as: "currentBid"}},
                { $unwind: {path: "$tokenOrder", preserveNullAndEmptyArrays: true}},
                { $project: {"_id": 0, blockNumber: 1, tokenIndex: 1, tokenId: 1, quantity:1, royalties:1, royaltyOwner:1, holder: 1,
                createTime: 1, updateTime: 1, tokenIdHex: 1, tokenJsonVersion: 1, type: 1, name: 1, description: 1, properties: 1,
                data: 1, asset: 1, adult: 1, price: "$tokenOrder.price", buyoutPrice: "$tokenOrder.buyoutPrice", quoteToken: "$tokenOrder.quoteToken",
                marketTime:1, status: 1, endTime:1, orderId: 1, priceCalculated: 1, orderType: "$tokenOrder.orderType", amount: "$tokenOrder.amount",
                baseToken: 1, marketPlace: 1,reservePrice: "$tokenOrder.reservePrice",currentBid: 1, thumbnail: 1, kind: 1, v1State: 1 },},
            ]).toArray();

            let result = await this.getSortCollectibles(tokens, sort)

            return { code: 200, message: 'sucess', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    getSoldCollectiblesByAddress: async function(address, did, orderType, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let sort = {};
            switch (orderType) {
                case '0':
                    sort = {marketTime: -1};
                    break;
                case '1':
                    sort = {marketTime: 1};
                    break;
                case '2':
                    sort = {priceCalculated: -1};
                    break;
                case '3':
                    sort = {priceCalculated: 1};
                    break;
                default:
                    sort = {marketTime: -1}
            }

            let checkMarketPlace;
            if(marketPlace == 0) {
                checkMarketPlace = {marketPlace: {$in: [config.elastos.chainType, config.ethereum.chainType, config.fusion.chainType]}};
            } else {
                checkMarketPlace = {marketPlace : marketPlace}
            }

            const order_collection = mongoClient.db(config.dbName).collection('pasar_order');
            const token_collection = mongoClient.db(config.dbName).collection('pasar_token');
            let collection_order_event  = mongoClient.db(config.dbName).collection('pasar_order_event');
            await token_collection.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});
            await order_collection.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});
            await collection_order_event.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});
            
            let checkAddress = address;
            if(did) {
                let addressList = await this.getAddressListFromDid(address);
                checkAddress = {$in: addressList}
            }

            let tokens = await order_collection.aggregate([
                { $match: {$and: [{sellerAddr: checkAddress, orderState: "2"}, checkMarketPlace]} },
                { $lookup: {from: "pasar_token",
                    let: {"ttokenId": "$tokenId", "tbaseToken": "$baseToken", "tmarketPlace": "$marketPlace"},
                    pipeline: [{$match: {$and: [{$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}}, {$expr: {$eq: ["$$tmarketPlace", "$marketPlace"]}}]}}],
                    as: "token"}
                },
                { $lookup: {from: "pasar_order_event",
                    let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken"},
                    pipeline: [{$match: {$and: [{event: "OrderBid"}, {$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}}]}}, {$sort: {timestamp: -1}}],
                    as: "currentBid"}},
                { $unwind: "$token"},
                { $project: {"_id": 0, blockNumber: "$token.blockNumber", tokenIndex: "$token.tokenIndex", tokenId: "$token.tokenId", quantity:"$token.quantity", royalties:"$token.royalties", royaltyOwner:"$token.royaltyOwner", holder: "$token.holder",
                createTime: "$token.createTime", updateTime: "$token.updateTime", tokenIdHex: "$token.tokenIdHex", tokenJsonVersion: "$token.tokenJsonVersion", type: "$token.type", name: "$token.name", description: "$token.description", properties: "$token.properties",
                data: "$token.data", asset: "$token.asset", adult: "$token.adult", price: 1, buyoutPrice: 1, quoteToken: 1,
                marketTime:"$token.marketTime", status: "$token.status", endTime:"$token.endTime", orderId: "$token.orderId", priceCalculated: "$token.priceCalculated", orderType: 1, amount: 1,
                baseToken: "$token.baseToken",  marketPlace:1, reservePrice: 1,currentBid: 1, thumbnail: "$token.thumbnail", kind: "$token.kind" },},
            ]).toArray();
            
            let result = await this.getSortCollectibles(tokens, sort)

            return { code: 200, message: 'sucess', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    getBidCollectiblesByAddress: async function(address, did, orderType, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            
            let sort = {};
            switch (orderType) {
                case '0':
                    sort = {marketTime: -1};
                    break;
                case '1':
                    sort = {marketTime: 1};
                    break;
                case '2':
                    sort = {priceCalculated: -1};
                    break;
                case '3':
                    sort = {priceCalculated: 1};
                    break;
                default:
                    sort = {marketTime: -1}
            }

            const event_collection = mongoClient.db(config.dbName).collection('pasar_order_event');
            const order_collection = mongoClient.db(config.dbName).collection('pasar_order');
            const token_collection = mongoClient.db(config.dbName).collection('pasar_token');
            await token_collection.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1});
            await order_collection.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1});
            await event_collection.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1});

            let checkMarketPlace;
            if(marketPlace == 0) {
                checkMarketPlace = {marketPlace: {$in: [config.elastos.chainType, config.ethereum.chainType, config.fusion.chainType]}};
            } else {
                checkMarketPlace = {marketPlace : marketPlace}
            }

            let checkAddress = address;
            if(did) {
                let addressList = await this.getAddressListFromDid(address);
                checkAddress = {$in: addressList}
            }

            let tokens = await event_collection.aggregate([
                { $match: {$and: [{buyerAddr: checkAddress}, {event : "OrderBid"}, checkMarketPlace]}},
                { $lookup: {
                    from: "pasar_token",
                    let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken"},
                    pipeline: [{$match: {$and: [{$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}}]}}],
                    as: "token"}
                },
                { $lookup: {
                    from: "pasar_order",
                    let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken"},
                    pipeline: [
                        {$match: {$and: [{$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}}, {orderType: "2"}, {orderState: "1"}]} },
                    ],
                    as: "tokenOrder"}
                },
                { $lookup: {from: "pasar_order_event",
                    let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken"},
                    pipeline: [{$match: {$and: [{event: "OrderBid"}, {$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}}]}}, {$sort: {timestamp: -1}}],
                    as: "currentBid"}},
                { $unwind: "$tokenOrder"},
                { $unwind: "$token"},
                { $project: {"_id": 0, blockNumber: "$token.blockNumber", tokenIndex: "$token.tokenIndex", tokenId: "$token.tokenId", quantity:"$token.quantity", royalties:"$token.royalties", royaltyOwner:"$token.royaltyOwner", holder: "$token.holder",
                createTime: "$token.createTime", updateTime: "$token.updateTime", tokenIdHex: "$token.tokenIdHex", tokenJsonVersion: "$token.tokenJsonVersion", type: "$token.type", name: "$token.name", description: "$token.description", properties: "$token.properties",
                data: "$token.data", asset: "$token.asset", adult: "$token.adult", price: "$tokenOrder.price", buyoutPrice: "$tokenOrder.buyoutPrice", quoteToken: "$tokenOrder.quoteToken",
                marketTime:"$token.marketTime", status: "$token.status", endTime:"$token.endTime", orderId: 1, priceCalculated: "$token.priceCalculated", orderType: "$tokenOrder.orderType", amount: "$tokenOrder.amount",
                baseToken: "$tokenOrder.baseToken", marketPlace: 1, reservePrice: "$tokenOrder.reservePrice",currentBid: 1, thumbnail: "$token.thumbnail", kind: "$token.kind" },},
            ]).toArray();

            let result = await this.getSortCollectibles(tokens, sort)

            return { code: 200, message: 'sucess', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    getCreatedCollectiblesByAddress: async function(address, did, orderType, marketPlace) {
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
                    sort = {priceCalculated: -1};
                    break;
                case '3':
                    sort = {priceCalculated: 1};
                    break;
                default:
                    sort = {createTime: -1}
            }
            let checkMarketPlace;
            if(marketPlace == 0) {
                checkMarketPlace = {marketPlace: {$in: [config.elastos.chainType, config.ethereum.chainType, config.fusion.chainType]}};
            } else {
                checkMarketPlace = {marketPlace : marketPlace}
            }

            let checkAddress = address;
            if(did) {
                let addressList = await this.getAddressListFromDid(address);
                checkAddress = {$in: addressList}
            }

            let tokens = await collection.aggregate([
                { $match: {$and: [{royaltyOwner: checkAddress}, {holder: {$ne: config.burnAddress}}, checkMarketPlace]} },
            ]).toArray();

            let result = await this.getSortCollectibles(tokens, sort)
            return { code: 200, message: 'sucess', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    getSortCollectibles: async function(tokens, sort) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        await mongoClient.connect();

        let temp_collection =  mongoClient.db(config.dbName).collection('token_temp_' + Date.now().toString());

        let marketStatus = ['MarketSale', 'MarketAuction', 'MarketBid', 'MarketPriceChanged'];

        for (let i = 0; i < tokens.length; i++) {
            tokens[i].marketTime = tokens[i].marketTime ? parseInt(tokens[i].marketTime) : 0;
            tokens[i].createTime = tokens[i].createTime ? parseInt(tokens[i].createTime) : 0;
            tokens[i].updateTime = tokens[i].createTime ? parseInt(tokens[i].updateTime) : 0;

            let rate = 1;
            if(tokens[i].quoteToken && tokens[i].quoteToken != ELAToken) {
                let convertToken = tokens[i].quoteToken;
                if(tokens[i].quoteToken == config.elastos.diaTokenContract)
                    convertToken = '0x2C8010Ae4121212F836032973919E8AeC9AEaEE5';
                let rateToken = await this.getERC20TokenPrice(convertToken);
                rate = rateToken ? rateToken.token.derivedELA : 1;
            }

            tokens[i].priceCalculated = tokens[i].price ? tokens[i].price * rate / 10 ** 18 : 0;

            if( marketStatus.indexOf(tokens[i]['status']) != -1 ) {
                if(tokens[i]['holder'] == tokens[i]['royaltyOwner']) {
                    tokens[i].saleType = 'Primary Sale';
                } else {
                    tokens[i].saleType = 'Secondary Sale';
                }
            }else {
                tokens[i].saleType = 'Not on sale';
            }
        }
        
        if(tokens.length > 0) {
            for(var i = 0; i < tokens.length; i++) {
                await temp_collection.updateOne({tokenId: tokens[i].tokenId, baseToken: tokens[i].baseToken}, {$set: tokens[i]}, {upsert: true});
            }
        }

        let result = await temp_collection.find().sort(sort).toArray();

        if(tokens.length > 0)
            await temp_collection.drop(tokens);

        return result;
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
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    updateOrder: async function(result, blockNumber, orderId) {
        let web3Rpc = new Web3(config.elastos.rpcUrl);
        try {
            let pasarOrder = {orderId: orderId, orderType: result.orderType, orderState: result.orderState,
                tokenId: result.tokenId, amount: result.amount, price:result.price, priceNumber: parseInt(result.price), startTime: result.startTime, endTime: result.endTime,
                sellerAddr: result.sellerAddr, buyerAddr: result.buyerAddr, bids: result.bids, lastBidder: result.lastBidder,
                lastBid: result.lastBid, filled: result.filled, royaltyOwner: result.royaltyOwner, royaltyFee: result.royaltyFee,
                baseToken: result.baseToken, amount: result.amount, quoteToken: result.quoteToken, buyoutPrice: result.buyoutPrice, reservePrice: result.reservePrice,
                minPrice: result.minPrice, createTime: result.createTime, marketPlace: result.marketPlace, updateTime: result.updateTime, blockNumber}

            await pasarDBService.updateOrInsert(pasarOrder);
        } catch(error) {
            console.log(error);
            console.log(`[OrderForSale] Sync - getOrderById(${orderId}) at ${blockNumber} call error`);
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
            return {code: 500, message: 'server error'};
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
                    { $match: {$and: [{tokenId}, {to: {$ne: config.elastos.pasarContract}}] } },
                    { $sort: {tokenId: 1, blockNumber: -1} },
                    { $limit: 1 }
                ]).toArray();
                await token_collection.updateOne({tokenId}, {$set: {holder: result[0]['to']}});
            }
            return {code: 200, message: 'sucess'};
        } catch(err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },

    updateTokens: async function(){
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const token_event_collection = mongoClient.db(config.dbName).collection('pasar_token_event');
            const token_collection = mongoClient.db(config.dbName).collection('pasar_token');
            const order_event_collection = mongoClient.db(config.dbName).collection('pasar_order_event');
            const order_collection = mongoClient.db(config.dbName).collection('pasar_order');
            let tokens = await token_collection.find({}).toArray();

            for(var i = 0; i < tokens.length; i++) {
                let token = tokens[i];
                let token_event = await token_event_collection.find({$and: [{to: {$ne: config.elastos.pasarContract}}, {tokenId: token['tokenId']}]}).sort({blockNumber: -1}).limit(1).toArray();
                let holder, price = 0, orderId = null, marketTime = null, endTime = null, status = "Not on sale";
                if(token_event.length > 0)
                    holder = token_event[0]['to'];
                else holder = token.royaltyOwner;
                let order_event = await order_event_collection.find({tokenId: token['tokenId']}).sort({blockNumber: -1}).limit(1).toArray();
                // await stickerDBService.updateTokenInfo(result.tokenId, orderEventDetail.price, orderEventDetail.orderId, result.createTime, result.endTime, 'MarketSale');
                if(order_event.length > 0) {
                    order_event = order_event[0];
                    price = parseInt(order_event['price']);
                    orderId = order_event['orderId'];
                    let order = await order_collection.findOne({orderId});
                    if(order) {
                        marketTime = order['createTime'];
                        endTime = order['endTime'];
                    }
                    switch(order_event['event'])
                    {
                        case 'OrderForSale':
                            status = 'MarketSale';
                            break;
                        case 'OrderPriceChanged':
                            status = 'MarketPriceChanged';
                            break;
                        case 'OrderFilled':
                            status = 'Not on sale';
                            break;
                        case 'OrderCanceled':
                            status = 'Not on sale';
                            break;
                        case 'OrderForAuction':
                            status = 'MarketAuction';
                            break;
                        case 'OrderBid':
                            status = 'MarketBid';
                            break;
                    }
                }
                await token_collection.updateOne({ tokenId: token['tokenId']}, {$set: {holder, price, orderId, status, marketTime, endTime}});
            }
            console.log('successull done');
            return {code: 200, message: 'sucess'};
        } catch(err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    collectionEvent: async function(orderEventDetail) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_collection_event');
            await collection.insertOne(orderEventDetail);
        } catch (err) {
            throw new Error();
        } finally {
           await mongoClient.close();
        }
    },
    getLastCollectionEventSyncHeight: async function (event, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_collection_event');
            let doc = await collection.findOne({event, marketPlace}, {sort:{blockNumber:-1}})
            if(doc) {
                return doc.blockNumber
            } else {
                if(marketPlace == config.elastos.chainType) {
                    return config.elastos.pasarRegisterContractDeploy;
                } else if(marketPlace == config.ethereum.chainType) {
                    return config.ethereum.pasarRegisterContractDeploy;
                } else if(marketPlace == config.fusion.chainType) {
                    return config.fusion.pasarRegisterContractDeploy;
                }
                
            }
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },
    getLastRegisterCollectionEvent: async function (token, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_token_event');
            let doc = await collection.find({token, marketPlace}).sort({blockNumber: -1}).limit(1).toArray();
            if(doc && doc.length == 1) {
                return doc[0].blockNumber
            } else {
                return 0;
            }
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },
    registerCollection: async function(token, owner, name, uri, symbol, is721, blockNumber, tokenJson, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const token_collection = mongoClient.db(config.dbName).collection('pasar_collection');

            let data = {
                token,
                owner,
                name,
                uri,
                symbol,
                is721,
                blockNumber,
                tokenJson,
                marketPlace,
                createdTime: (new Date()/1000).toFixed(),
                updatedTime: (new Date()/1000).toFixed()
            }
            await token_collection.insertOne(data);
        } catch(err) {
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    updateCollection: async function(token, name, uri, blockNumber, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const token_collection = mongoClient.db(config.dbName).collection('pasar_collection');

            let data = {
                name,
                uri,
                blockNumber,
                updatedTime: (new Date()/1000).toFixed()
            }
            await token_collection.updateOne({token, marketPlace}, {$set: data});
        } catch(err) {
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    changeCollectionRoyalty: async function(token, royaltyOwners, royaltyRates, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_collection_royalty');
            let data = {
                royaltyOwner: royaltyOwners,
                royaltyRates: royaltyRates
            }

            await collection.updateOne({token, marketPlace}, {$set: data}, { upsert: true });
        } catch(err) {
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    getCollections: async function(sort = 0, marketPlace, category=0) {

        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            let checkMarketPlace;
            if(marketPlace == 0) {
                checkMarketPlace = {marketPlace: {$in: [config.elastos.chainType, config.ethereum.chainType, config.fusion.chainType]}};
            } else {
                checkMarketPlace = {marketPlace : marketPlace}
            }
            
            let listCategories= [null, 'general', 'art', 'collectibles', 'photography', 'trading cards', 'utility', 'domains']
            let checkCategory;
            if(category == 0) {
                checkCategory = {"tokenJson.data.category": {$in: listCategories}};
            } else {
                checkCategory = {"tokenJson.data.category" : listCategories[category]}
            }
            
            await mongoClient.connect();
            const token_collection = await mongoClient.db(config.dbName).collection('pasar_collection');

            let sortData = {}
            switch(sort) {
                case "0":
                    sortData = {diaBalance: -1}
                    break;
                case "1":
                    sortData = {createdTime: -1}
                    break;
                case "2":
                    sortData = {createdTime: 1}
                    break;
                case "3":
                    sortData = {totalUSDPrice: 1}
                    break;
                case "4":
                    sortData = {totalUSDPrice: -1}
                    break;
                case "5":
                    sortData = {totalCount: 1}
                    break;
                case "6":
                    sortData = {totalCount: -1}
                    break;
                case "7":
                    sortData = {floorUSDPrice: 1}
                    break;
                case "8":
                    sortData = {floorUSDPrice: -1}
                    break;
                case "9":
                    sortData = {totalOwner: 1}
                    break;
                case "10":
                    sortData = {totalOwner: -1}
                    break;
                default: 
                    sortData = {createdTime: -1}
                    break;
            }

            let collections = await token_collection.find({ $and: [checkMarketPlace, checkCategory]}).sort(sortData).toArray();
            return {code: 200, message: 'success', data: collections};
        } catch(err) {
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    getCollectionByToken: async function(token, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const token_collection = await mongoClient.db(config.dbName).collection('pasar_collection');
            let result = await token_collection.findOne({token: token, marketPlace: marketPlace});
            return {code: 200, message: 'success', data: result};
        } catch(err) {
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    getCollectionByOwner: async function(owner, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const token_collection = await mongoClient.db(config.dbName).collection('pasar_collection');
            let checkMarketPlace;
            if(marketPlace == 0) {
                checkMarketPlace = {marketPlace: {$in: [config.elastos.chainType, config.ethereum.chainType, config.fusion.chainType]}};
            } else {
                checkMarketPlace = {marketPlace : marketPlace}
            }

            let collections = await token_collection.aggregate([
                { $match: {$and: [{owner: owner}, checkMarketPlace]} },
                { $lookup: {from: "pasar_collection_royalty",
                    let: {"ttoken": "$token", "tmarketPlace": "$marketPlace"},
                    pipeline: [{$match: {$and: [{$expr: {$eq: ["$$ttoken", "$token"]}}, {$expr: {$eq: ["$$tmarketPlace", "$marketPlace"]}}]}}],
                    as: "royalty"}},
                { $unwind: "$royalty"},
                { $project: {"_id": 0, token: 1, owner: 1, name: 1, uri: 1, symbol: 1, is721: 1, tokenJson: 1, marketPlace: 1,createdTime: 1,
                    "owners": "$royalty.royaltyOwner", "feeRates": "$royalty.royaltyRates"},},
            ]).toArray();

            return {code: 200, message: 'success', data: collections};
        } catch(err) {
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    getOwnersOfCollection: async function(token, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const token_collection = await mongoClient.db(config.dbName).collection('pasar_token');
            let listAddress = [];
            let tokens = await token_collection.find({baseToken: token, marketPlace: marketPlace, holder: {$ne: burnAddress}}).toArray();

            tokens.forEach(cell => {
                if(listAddress.indexOf(cell.holder) == -1) {
                    listAddress.push(cell.holder);
                }
            });
            return {code: 200, message: 'success', data: {total: listAddress.length, address: listAddress}};
        } catch(err) {
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    getTotalCountCollectibles: async function(token, marketPlace, onMarket=false) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let checkCondition = [{baseToken: token}, {holder: {$ne: burnAddress}}, {marketPlace: marketPlace}];
            let sort = {createTime: -1}

            if(onMarket) {
                checkCondition.push({status: {$ne: "Not on sale"}})
                sort = {marketTime : -1}
            }
            let condition = {$and: checkCondition};
            const tokenDB = await mongoClient.db(config.dbName).collection('pasar_token');
            let result = await tokenDB.find(condition).sort(sort).toArray();
            return {code: 200, message: 'success', data: {total: result.length, list: result}};
        } catch(err) {
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    getCollection: async function(token) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const tokenDB = await mongoClient.db(config.dbName).collection('pasar_collection');
            let result = await tokenDB.findOne({token});
            return result;
        } catch(err) {
            return null;
        } finally {
            await mongoClient.close();
        }
    },
    updateCollectionAttribute: async function(token, attribute) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();

            const tokenDB = await mongoClient.db(config.dbName).collection('pasar_collection');
            await tokenDB.updateOne({token}, {$set: {attribute}});
            return true;
        } catch(err) {
            return false;
        } finally {
            await mongoClient.close();
        }
    },
    getTotalPriceCollectibles: async function(token, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const token_collection = await mongoClient.db(config.dbName).collection('pasar_order');

            let result = await token_collection.aggregate([
                { $match: {baseToken: token, orderState: "2", marketPlace: marketPlace}},
                { $project: {"_id": 0, filled: 1, quoteToken: 1, marketPlace: 1}},
            ]).toArray();

            let total = 0;

            let rates = await this.getPriceRate();
            let listRate_ela = [], listRate_eth = [], listRate_fusion = [];
            for(var i=0; i < rates.length; i++) {
                if(rates[i].marketPlace == config.elastos.chainType) {
                    listRate_ela[rates[i].type] = rates[i].rate;
                } else if(rates[i].marketPlace == config.ethereum.chainType) {
                    listRate_eth[rates[i].type] = rates[i].rate;
                } else if(rates[i].marketPlace == config.fusion.chainType) {
                    listRate_fusion[rates[i].type] = rates[i].rate;
                }
            }

            for(var i = 0; i < result.length; i++) {

                let convertToken = result[i].quoteToken;
                if(result[i].quoteToken == config.elastos.diaTokenContract)
                    convertToken = '0x2C8010Ae4121212F836032973919E8AeC9AEaEE5';
                
                let rate = 1;
                switch(result[i].marketPlace) {
                    case config.elastos.chainType:
                        rate = listRate_ela[convertToken];
                        break;
                    case config.ethereum.chainType:
                        if(convertToken == config.DefaultToken) {
                            rate = 1;
                        } else {
                            rate = 1/listRate_eth[config.DefaultToken]
                        }
                        break;
                    case config.fusion.chainType:
                        if(convertToken == config.DefaultToken) {
                            rate = 1;
                        } else {
                            rate = 1/listRate_fusion[config.DefaultToken]
                        }
                        break;
                    default:
                        rate = 1;
                        break;
                }

                let price = result[i].filled * rate / 10 ** 18;
                total += price;
            }

            return {code: 200, message: 'success', data: {total}};
        } catch(err) {
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    getFloorPriceCollectibles: async function(token, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const token_collection = await mongoClient.db(config.dbName).collection('pasar_token');
            let collection_order  = mongoClient.db(config.dbName).collection('pasar_order');
            await token_collection.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});
            await collection_order.ensureIndex({ "tokenId": 1, "baseToken": 1, "orderId": 1, "marketPlace": 1});

            let result = await token_collection.aggregate([
                { $match: {baseToken: token, marketPlace: marketPlace, status: {$ne: "Not on sale"}, holder: {$ne: burnAddress}}},
                { $lookup: {
                    from: "pasar_order",
                    let: {"torderId": "$orderId", "ttokenId": "$tokenId", "tbaseToken": "$baseToken", "tmarketPlace": "$marketPlace"},
                    pipeline: [{$match: {$and: [{$expr: {$eq: ["$$torderId", "$orderId"]}}, {$expr: {$eq: ["$$ttokenId", "$tokenId"]}}, {$expr: {$eq: ["$$tbaseToken", "$baseToken"]}},{$expr: {$eq: ["$$tmarketPlace", "$marketPlace"]}}]}}],
                    as: "order"}},
                { $unwind: "$order"},
                { $project: {"_id": 0, price: "$order.price", quoteToken: "$order.quoteToken"}},
            ]).toArray();

            let rates = await this.getPriceRate();
            let listRate_ela = [], listRate_eth = [], listRate_fusion = [];
            for(var i=0; i < rates.length; i++) {
                if(rates[i].marketPlace == config.elastos.chainType) {
                    listRate_ela[rates[i].type] = rates[i].rate;
                } else if(rates[i].marketPlace == config.ethereum.chainType) {
                    listRate_eth[rates[i].type] = rates[i].rate;
                } else if(rates[i].marketPlace == config.fusion.chainType) {
                    listRate_fusion[rates[i].type] = rates[i].rate;
                }
            }

            let listPrice = [];
            for(var i=0; i < result.length; i++) {
                let convertToken = result[i].quoteToken;
                if(result[i].quoteToken == config.elastos.diaTokenContract)
                    convertToken = '0x2C8010Ae4121212F836032973919E8AeC9AEaEE5';
                
                let rate = 1;
                switch(marketPlace) {
                    case config.elastos.chainType:
                        rate = listRate_ela[convertToken];
                        break;
                    case config.ethereum.chainType:
                        if(convertToken == config.DefaultToken) {
                            rate = 1;
                        } else {
                            rate = 1/listRate_eth[config.DefaultToken]
                        }
                        break;
                    case config.fusion.chainType:
                        if(convertToken == config.DefaultToken) {
                            rate = 1;
                        } else {
                            rate = 1/listRate_fusion[config.DefaultToken]
                        }
                        break;
                    default:
                        rate = 1;
                        break;
                }

                let price = result[i].price * rate / 10 ** 18;
                
                if(price != 0) {
                    listPrice.push(price);
                }

            }

            let price = listPrice.length == 0 ? 0 : Math.min(...listPrice);
            return {code: 200, message: 'success', data: {price}};
        } catch(err) {
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    getLastUserToken: async function(token) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = await mongoClient.db(config.dbName).collection('pasar_token_event');
            let doc = await collection.findOne({token}, {sort:{blockNumber: -1}});
            if(doc) {
                return doc.blockNumber
            } else {
                return 0;
            }
        } catch(err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },
    getLastCollectionToken: async function(token) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = await mongoClient.db(config.dbName).collection('pasar_collection_event');
            let doc = await collection.findOne({token}, {sort:{blockNumber: -1}});
            if(doc) {
                return doc.blockNumber
            } else {
                return 0;
            }
        } catch(err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },
    getInstanceSearchResult: async function(keyword) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let condition = {$or: [{name: {$regex: keyword, '$options' : 'i'}}, {tokenId: {$regex: keyword, '$options' : 'i'}} , {tokenIdHex: {$regex: keyword, '$options' : 'i'}}, {description: {$regex: keyword, '$options' : 'i'}},
                {royaltyOwner: {$regex: keyword, '$options' : 'i'}}, {holder: {$regex: keyword, '$options' : 'i'}}, {token: {$regex: keyword, '$options' : 'i'}},
                {address: {$regex: keyword, '$options' : 'i'}}, {"did.name": {$regex: keyword, '$options' : 'i'}}, {"did.description": {$regex: keyword, '$options' : 'i'}}]}
            let collection_token = await mongoClient.db(config.dbName).collection('pasar_token');
            let collection_collection = await mongoClient.db(config.dbName).collection('pasar_collection');
            let collection_account = await mongoClient.db(config.dbName).collection('pasar_address_did');

            let items = await collection_token.find(condition).sort({marketTime: -1}).limit(3).toArray()
            let collections = await collection_collection.find(condition).sort({marketTime: -1}).limit(3).toArray()
            let accounts = await collection_account.find(condition).sort({marketTime: -1}).limit(3).toArray()

            return {code: 200, message: 'success', data: {collections, items, accounts}};

        } catch(err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    getRecentlySold: async function(count) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection = await mongoClient.db(config.dbName).collection('pasar_order');
            
            let fields = {_id: 0, tokenId: 1, saleType: 1, quantity: "$token.quantity", royalties: "$token.royalties", royaltyOwner: "$token.royaltyOwner", holder: "$token.holder",
                createTime: "$token.createTime", updateTime: "$token.updateTime", tokenIdHex: "$token.tokenIdHex", tokenJsonVersion: "$token.tokenJsonVersion", type: "$token.type", name: "$token.name", description: "$token.description", properties: "$token.properties",
                data: "$token.data", asset: "$token.asset", adult: "$token.adult", quoteToken: "$token.quoteToken", price: "$token.price",
                marketTime:"$token.marketTime", status: "$token.status", baseToken: "$token.baseToken", thumbnail: "$token.thumbnail", marketPlace: 1}

            let result = await collection.aggregate([
                { $match: {$and: [{orderState: "2"}]}},
                { $sort: {blockNumber: -1}},
                { $limit :count},
                { $lookup: {
                    from: "pasar_token",
                    let: {"ttokenId": "$tokenId", "tbaseToken": "$baseToken"},
                    pipeline: [
                        {$match: {$and: [{"$expr": {"$eq":["$$ttokenId","$tokenId"]}}, {"$expr": {"$eq":["$$tbaseToken","$baseToken"]}}]} },
                    ],
                    as: "token"}
                },
                { $addFields: {saleType: 'Not on sale'}},
                { $unwind: "$token"},
                { $project: fields},
            ]).toArray();

            return {code: 200, message: 'success', data: result};
        } catch(err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    getTokenInfo: async function(tokenId, orderId, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection = await mongoClient.db(config.dbName).collection('pasar_order');
            let result = await collection.findOne({tokenId, orderId, marketPlace});
            return result;
        } catch(err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    getDiaTokenPrice: async function () {
        let walletConnectWeb3 = new Web3(config.elastos.rpcUrl); 
        let blocknum = await walletConnectWeb3.eth.getBlockNumber();

        const graphQLParams = {
            query: `query tokenPriceData { token(id: "0x2c8010ae4121212f836032973919e8aec9aeaee5", block: {number: ${blocknum}}) { derivedELA } bundle(id: "1", block: {number: ${blocknum}}) { elaPrice } }`,
            variables: null,
            operationName: 'tokenPriceData'
        };
        
        let response = await axios({
            method: 'POST',
            url: 'https://api.glidefinance.io/subgraphs/name/glide/exchange',
            headers: {
              'content-type': 'application/json',
              // "x-rapidapi-host": "reddit-graphql-proxy.p.rapidapi.com",
              // "x-rapidapi-key": process.env.RAPIDAPI_KEY,
              accept: 'application/json'
            },
            data: graphQLParams
        })

        return response.data.data;
    },
    checkV1NFTByWallet: async function(address) {
        let web3Rpc = new Web3(config.elastos.rpcUrl);
        let pasarContract = new web3Rpc.eth.Contract(pasarContractABI, config.elastos.pasarContract);
        let sellerInfo = await pasarContract.methods.getSellerByAddr(address).call();
        
        if(sellerInfo && sellerInfo.openCount != '0') {
            return {code: 200, message: 'success', data: true};
        } else {
            return {code: 200, message: 'success', data: false};
        }
    },
    test: async function(baseToken) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection_token = await mongoClient.db(config.dbName).collection('pasar_token');
            let collection_token_event = await mongoClient.db(config.dbName).collection('pasar_token_event');

            let result = await collection_token.find({baseToken: baseToken}).toArray();
            let result_event = await collection_token_event.find({token: baseToken, from: config.burnAddress}).toArray();

            let tokenIdList = [], duplicatedIds = [], eventIdList = [], duplicatedEventIds = [];

            for(var i = 0; i < result.length; i++) {
                if(tokenIdList.indexOf(result[i].tokenId) == -1) {
                    tokenIdList.push(result[i].tokenId);
                } else {
                    duplicatedIds.push(result[i]._id);
                }
            }
            for(var i = 0; i < result_event.length; i++) {
                if(eventIdList.indexOf(result_event[i].tokenId) == -1) {
                    eventIdList.push(result_event[i].tokenId);
                } else {
                    duplicatedEventIds.push(result_event[i]._id);
                }
            }
            for(var i = 0; i < duplicatedIds.length; i++) {
                await collection_token.deleteMany({_id: ObjectID(duplicatedIds[i])});
            }
            for(var i = 0; i < duplicatedEventIds.length; i++) {
                await collection_token_event.deleteMany({_id: ObjectID(duplicatedEventIds[i])});
            }
            return {code: 200, message: 'success', tokenData: {total: duplicatedIds.length, data: duplicatedIds},eventData: {total: duplicatedEventIds.length, data: duplicatedEventIds}};
        } catch(err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    },
    getERC20TokenPrice: async function(tokenAddress) {
        let walletConnectWeb3 = new Web3(config.elastos.rpcUrl); 
        let blocknum = await walletConnectWeb3.eth.getBlockNumber();
        console.log(tokenAddress);
        const graphQLParams = {
            query: `query tokenPriceData { token(id: "${tokenAddress.toLowerCase()}", block: {number: ${blocknum}}) { derivedELA } bundle(id: "1", block: {number: ${blocknum}}) { elaPrice } }`,
            variables: null,
            operationName: 'tokenPriceData'
        };
        
        let response = await axios({
            method: 'POST',
            url: 'https://api.glidefinance.io/subgraphs/name/glide/exchange',
            headers: {
              'content-type': 'application/json',
              // "x-rapidapi-host": "reddit-graphql-proxy.p.rapidapi.com",
              // "x-rapidapi-key": process.env.RAPIDAPI_KEY,
              accept: 'application/json'
            },
            data: graphQLParams
        })

        return response.data.data;
    },

    updatePriceRate: async function(token, rate, marketPlace) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection = await mongoClient.db(config.dbName).collection('pasar_price_rate');
            await collection.updateOne({type: token, marketPlace}, {$set: {rate: rate}}, {upsert: true});                                   
        } catch(err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    getPriceRate: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection = await mongoClient.db(config.dbName).collection('pasar_price_rate');
            let rates = await collection.find().toArray();                                   
            return rates;
        } catch(err) {
            return null;
        } finally {
            await mongoClient.close();
        }
    },

    saveSyncTemp: async function(data, db) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection = await mongoClient.db(config.dbName).collection(db);
            let count = await collection.find({blockNumber: data.blockNumber, event: data.eventType}).count();
            if(count == 0) {
                await collection.insertOne(data);    
            }
        } catch(err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    deleteSyncTemp: async function(db) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection = await mongoClient.db(config.dbName).collection(db);
            await collection.drop();
        } catch(err) {
            logger.error(err);
            return 0;
        } finally {
            await mongoClient.close();
        }
    },

    getCountSyncTemp: async function(db) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection = await mongoClient.db(config.dbName).collection(db);
            let result = await collection.find().count();
            return result;
        } catch(err) {
            logger.error(err);
            return 0;
        } finally {
            await mongoClient.close();
        }
    },

    getSyncTemp: async function(db, index, size) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection = await mongoClient.db(config.dbName).collection(db);
            let result = await collection.find().sort({blockNumber: 1, createdAt: 1}).skip(index * size).limit(size).toArray();
            return result;
        } catch(err) {
            logger.error(err);
            return null;
        } finally {
            await mongoClient.close();
        }
    },

    getImportedCollection: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection = await mongoClient.db(config.dbName).collection("pasar_collection");
            let result = await collection.find({$and: [{token: {$ne: config.elastos.stickerContract}}, {token: {$ne: config.elastos.stickerV2Contract}}]}).toArray();
            return result;
        } catch(err) {
            logger.error(err);
            return null;
        } finally {
            await mongoClient.close();
        }
    },

    updateCollectionInfo: async function() {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection = await mongoClient.db(config.dbName).collection("pasar_collection");
            let collection_rate = await mongoClient.db(config.dbName).collection("pasar_price_rate");
            let ethRate = await collection_rate.findOne({type: config.DefaultToken, marketPlace: config.ethereum.chainType});

            let collections = await collection.find().toArray();
            let web3 = new Web3(config.elastos.rpcUrl);
            let diaContract = new web3.eth.Contract(diaContractABI, config.elastos.diaTokenContract);

            let response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=elastos,ethereum,fsn&vs_currencies=usd');
            let rateData = await response.json();
            
            let listRate={};
            listRate[config.elastos.chainType] = rateData.elastos.usd;
            listRate[config.ethereum.chainType] = rateData.ethereum.usd;
            listRate[config.fusion.chainType] = rateData.fsn.usd;

            await Promise.all(collections.map(async cell => {
                let totalCount = 0, floorPrice = 0, totalOwner = 0, totalPrice = 0, totalUSDPrice = 0, floorUSDPrice = 0, collectibles = [], collectiblesOnMarket=[];
                let creatorDid = '', creatorName = '', creatorDescription = '';

                let diaBalance = await diaContract.methods.balanceOf(cell.owner).call();
                diaBalance = diaBalance / (10 ** 18);
                let reponse = await this.getTotalCountCollectibles(cell.token, cell.marketPlace);
                
                if(reponse.code == 200 && reponse.data.total) {
                    totalCount = reponse.data.total;
                    let endCount = reponse.data.total > 6 ? 6 : reponse.data.total;
                    for(var i = 0; i < endCount; i++) {
                        collectibles.push(reponse.data.list[i])
                    }
                } else {
                    totalCount = 0;
                }
                
                reponse = await this.getTotalCountCollectibles(cell.token, cell.marketPlace, true);
                
                if(reponse.code == 200 && reponse.data.total) {
                    let endCount = reponse.data.total > 6 ? 6 : reponse.data.total;
                    for(var i = 0; i < endCount; i++) {
                        collectiblesOnMarket.push(reponse.data.list[i])
                    }
                }

                reponse = await this.getFloorPriceCollectibles(cell.token, cell.marketPlace);
                if(reponse.code == 200 && reponse.data.price) {
                    floorPrice = reponse.data.price;
                    floorUSDPrice = reponse.data.price * listRate[cell.marketPlace];
                } else {
                    floorPrice = 0;
                }
                reponse = await this.getOwnersOfCollection(cell.token, cell.marketPlace);
                if(reponse.code == 200 && reponse.data.total) {
                    totalOwner = reponse.data.total;
                } else {
                    totalOwner = 0;
                }
                reponse = await this.getTotalPriceCollectibles(cell.token, cell.marketPlace);
                if(reponse.code == 200 && reponse.data.total) {
                    totalPrice = reponse.data.total;
                    totalUSDPrice = reponse.data.total * listRate[cell.marketPlace];
                } else {
                    totalPrice = 0;
                }
                
                let uriInfo = await jobService.getInfoByIpfsUri(cell.uri);
                
                if(uriInfo && uriInfo.creator) {
                    creatorDid = uriInfo.creator.did ? uriInfo.creator.did : '';
                    creatorName = uriInfo.creator.name ? uriInfo.creator.name : '';;
                    creatorDescription = uriInfo.creator.description ? uriInfo.creator.description : '';;
                }

                await collection.updateOne({_id: ObjectID(cell._id)}, {$set: {totalCount, floorPrice, floorUSDPrice, totalOwner, totalPrice, totalUSDPrice, collectibles, collectiblesOnMarket, diaBalance, creatorDid, creatorName, creatorDescription}})
            }));

        } catch(err) {
            logger.error(err);
            return null;
        } finally {
            await mongoClient.close();
        }
    },

    checkAddress: function (address) {
        let listCheckingAddress = [
          config.elastos.stickerContract,
          config.elastos.pasarContract,
          config.elastos.pasarV2Contract,
          config.ethereum.pasarContract,
          config.fusion.pasarContract,
          null,
        ]
        if(listCheckingAddress.indexOf(address) == -1) {
          return true;
        } else {
          false;
        }
    },

    getAddressListFromDid: async function(did) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            let collection_address_did  = mongoClient.db(config.dbName).collection('pasar_address_did');
            let data = await collection_address_did.find({"did.did": did}).toArray();
            let listAddress = [];
            for(var i = 0; i < data.length; i++) {
                listAddress.push(data[i].address);
            }
            return listAddress;
        } catch(err) {
            logger.error(err);
            return null;
        } finally {
            await mongoClient.close();
        }
    }
}
