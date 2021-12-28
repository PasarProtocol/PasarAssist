const {MongoClient} = require("mongodb");
const config = require("../config");
const sendMail = require("../send_mail");

async function checkOrderPrice() {
    let mongoClient = new MongoClient(config.mongodb, {useNewUrlParser: true, useUnifiedTopology: true});
    try {
        await mongoClient.connect();
        const collection = mongoClient.db(config.dbName).collection('pasar_order');
        let result = await collection.find({}).sort({blockNumber: -1}).project({"_id": 0, orderId: 1, price: 1}).toArray();

        const collection2 = mongoClient.db(config.dbName).collection('pasar_order_event');
        let result2 = await collection2.aggregate([
            { $sort: {blockNumber: -1}},
            { $match: {event: {$in: ["OrderPriceChanged"]}}},
            { $group: {_id: "$orderId", doc: {$first: "$$ROOT"}}},
            { $replaceRoot: { newRoot: "$doc"}},
        ]).toArray();

        let orderEvents = new Map();
        result2.forEach(item => {
            let price = item.data.newPrice
            orderEvents.set(item.orderId, price);
        })

        let i = 0;
        result.forEach(item => {
            let price = orderEvents.get(item.orderId);
            if(price === undefined) {
                return
            }
            if(item.price !== price) {
                console.log(`${item.orderId}:  pasar_order price: ${item.price} <==> pasar_event_order price: ${price}`)
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

checkOrderPrice().then(async result => {
    let recipients = [];
    recipients.push('lifayi2008@163.com');

    if(result > 0) {
        await sendMail(`Pasar Order Price Check [${config.serviceName}]`,
            `there are ${result} pasar order price not match`,
            recipients.join());
    }
})

