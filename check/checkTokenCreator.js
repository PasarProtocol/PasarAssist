const {MongoClient} = require("mongodb");
const config = require("../config");
const sendMail = require("../send_mail");

let burnAddress = '0x0000000000000000000000000000000000000000';

async function checkTokenHolder() {
    let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
    try {
        await mongoClient.connect();
        const collection = mongoClient.db(config.dbName).collection('pasar_token');
        let result = await collection.find({}).sort({blockNumber: -1}).project({"_id": 0, tokenId: 1, royaltyOwner: 1}).toArray();

        let tokens = new Map();
        result.forEach(item => {
            tokens.set(item.tokenId, item.royaltyOwner);
        })

        const collection2 = mongoClient.db(config.dbName).collection('pasar_token_event');
        let result2 = await collection2.find({ $or: [{from: burnAddress}, {to: burnAddress}]})
            .project({"_id": 0,tokenId:1, from: 1, to: 1, blockNumber: 1}).sort({blockNumber: 1}).toArray();

        let tokenEvents = new Map();
        result2.forEach(item => {
            if(!tokenEvents.has(item.tokenId)) {
                tokenEvents.set(item.tokenId, item.to);
            }
        })

        console.log(`Pasar token: ${tokens.size}   Pasar token event: ${tokenEvents.size}`);
        let i = 0;
        tokenEvents.forEach((value, key) => {
            if(value !== tokens.get(key)) {
                console.log(`${key}:  ${tokens.get(key)} <==> ${value}`)
                i++;
            }
        })
        return i;
    } catch (err) {
        console.log(err);
    } finally {
        await mongoClient.close();
    }
}

checkTokenHolder().then(async result => {
    let recipients = [];
    recipients.push('lifayi2008@163.com');

    if(result > 0) {
        await sendMail(`Pasar Token Creator Check [${config.serviceName}]`,
            `there are ${result} pasar token creator not match`,
            recipients.join());
    }
})
