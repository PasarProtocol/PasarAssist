const {MongoClient} = require("mongodb");
const config = require("../config");
const sendMail = require("../send_mail");

async function checkOrderState() {
    let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
    try {
        await mongoClient.connect();
        const collection = mongoClient.db(config.dbName).collection('pasar_order');
        let result = await collection.find({}).sort({blockNumber: -1}).project({"_id": 0, orderId: 1, orderState: 1}).toArray();

        const collection2 = mongoClient.db(config.dbName).collection('pasar_order_event');
        let result2 = await collection2.aggregate([
            { $sort: {blockNumber: -1}},
            { $match: {event: {$in: ["OrderCanceled", "OrderFilled", "OrderForSale"]}}},
            { $group: {_id: "$orderId", doc: {$first: "$$ROOT"}}},
            { $replaceRoot: { newRoot: "$doc"}},
        ]).toArray();

        let orderEvents = new Map();
        result2.forEach(item => {
            let state = item.event === "OrderForSale" ? "1" : item.event === "OrderFilled" ? "2" : item.event === "OrderCanceled" ? "3" : "0"
            orderEvents.set(item.orderId, state);
        })

        let i = 0;
        result.forEach(item => {
            if(item.orderState !== orderEvents.get(item.orderId)) {
                console.log(`${item.orderId}:  pasar_order state: ${item.orderState} <==> pasar_event_order state: ${orderEvents.get(item.orderId)}`)
                i++
            }
        })

        return i;
    } catch (err) {
        console.log(err);
    } finally {
        await mongoClient.close();
    }
}

checkOrderState().then(async result => {
    let recipients = [];
    recipients.push('lifayi2008@163.com');

    if(result > 0) {
        await sendMail(`Pasar Order State Check [${config.serviceName}]`,
            `there are ${result} pasar order state not match`,
            recipients.join());
    }
})

