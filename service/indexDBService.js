let MongoClient = require('mongodb').MongoClient;
let config = require('../config');
const Web3 = require("web3");
const diaContractABI = require('../contractABI/diaTokenABI');
let redisService = require('../service/redisService');
const config_test = require("../config_test");
config = config.curNetwork == 'testNet'? config_test : config;

module.exports = {
    insertCoinsPrice: async function (record) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_cmc_price');
            await collection.insertOne(record);
            redisService.clearKey('price');
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    removeOldPriceRecords: async function (time) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_cmc_price');
            await collection.deleteMany({timestamp: {$lt: time}})
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    getLatestPrice: async function () {
        const key = 'price';

        try {
            let cachedResult = await redisService.get(key);
            if(cachedResult) {
                return JSON.parse(cachedResult);
            }
        } catch (err) {
            logger.error(err);
        }

        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_cmc_price');
            let result = await collection.findOne({},{sort:{timestamp: -1}});
            redisService.set(key, JSON.stringify(result));
            return result;
        } catch (err) {
            logger.error(err);
        } finally {
            await mongoClient.close();
        }
    },

    diaBalance: async function(addresses) {
        let web3 = new Web3(config.escRpcUrl);
        let diaContract = new web3.eth.Contract(diaContractABI, config.diaTokenContract);

        let promises = [];
        addresses.forEach(address => {
            promises.push(diaContract.methods.balanceOf(address).call());
        })

        let balances = await Promise.all(promises);
        let result = {};
        addresses.forEach((address, index) => {
            result[address] = balances[index];
        })

        return result;
    }
}
