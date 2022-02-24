const { VerifiableCredential, VerifiablePresentation }  = require("@elastosfoundation/did-js-sdk");
const bs58 = require('bs58');
const { MongoClient } = require("mongodb");
let config = require("../config");
const config_test = require("../config_test");
config = config.curNetwork == 'testNet'? config_test : config;
module.exports = {
    verifyKyc: async function(enc_presentation, authenticatedDID, address) {
        let buffer_presentation = bs58.decode(enc_presentation);
        let enc = new TextDecoder("utf-8");
        let presentation = enc.decode(buffer_presentation);
        let vp = VerifiablePresentation.parse(presentation);
        // let valid = await vp.isValid();
        // if (!valid) {
        //     return;
        // }
        // Get the presentation holder
        let presentationDID = vp.getHolder().toString();
        if (!presentationDID) {
            return;
        }
        // Make sure the holder of this presentation is the currently authentified user
        if (authenticatedDID !== presentationDID) {
            return;
        }
        let credentials = vp.getCredentials();
        if(credentials.length == 0)
            return;
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_kyc');
            await collection.updateOne({address}, {$set: {credentials}}, {upsert: true});
        } catch (err) {
            logger.error(err);
            throw new Error();
        } finally {
            await mongoClient.close();
        }
    },

    getCredentials: async function(address) {
        let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
        try {
            await mongoClient.connect();
            const collection = mongoClient.db(config.dbName).collection('pasar_kyc');
            let result = await collection.findOne({address});
            return {code: 200, message: 'sucess', data: result};
        } catch (err) {
            logger.error(err);
            return {code: 500, message: 'server error'};
        } finally {
            await mongoClient.close();
        }
    }
}