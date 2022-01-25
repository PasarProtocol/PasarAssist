let {MongoClient} = require("mongodb");
let config = require("../config");
let client = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
const config_test = require("../config_test");
config = config.curNetwork == 'testNet'? config_test : config;
module.exports = {

    findUserByDID: async function(did) {
        try {
            const collection = this.client.db(config.dbName).collection('met_users');
            return (await collection.find({ did }).project({ '_id': 0 }).limit(1).toArray())[0];
        } catch (err) {
            logger.error(err);
            return null;
        }
    },

    addUser: async function (user) {
        try {
            const collection = this.client.db(config.dbName).collection('met_users');
            const docs = await collection.find({ did: user.did }).toArray();
            if (docs.length === 0) {
                await collection.insertOne(user);
                return { code: 200, message: 'success' };
            } else {
                return { code: 400, message: 'DID or Telegram exists' }
            }
        } catch (err) {
            logger.error(err);
            return { code: 500, message: 'server error' };
        }
    },

    updateUser: async function(did, name, email) {
        try {
            const collection = client.db(config.dbName).collection('met_users');
            let result = await collection.updateOne({ did }, { $set: { name, email } });
            return result.matchedCount;
        } catch (err) {
            logger.error(err);
            return -1;
        }
    },
    
    removeUser: async function(did) {
        try {
            const collection = this.client.db(config.dbName).collection('met_users');
            let result = await collection.deleteOne({ did });
            if (result.deletedCount === 1) {
                return { code: 200, message: 'success' };
            } else {
                return { code: 400, message: 'DID not exists' }
            }
        } catch (err) {
            logger.error(err);
            return { code: 500, message: 'server error' };
        }
    },

    addUserWallet: async function (targetDid, walletAddress) {
        console.log(`Binding wallet address ${walletAddress} to user ${targetDid}`);

        try {
            const collection = this.client.db(config.dbName).collection('met_users');

            await collection.updateOne({ did: targetDid }, { $push: { wallets: walletAddress } });

            return { code: 200, message: 'success' };
        } catch (err) {
            logger.error(err);
            return { code: 500, message: 'server error' };
        }
    }
}