const schedule = require('node-schedule');
let Web3 = require('web3');
let config = require('./config');
let pasarDBService = require('./service/pasarDBService');
let pasarContractABI = require('./contractABI/pasarABI');
let syncFeedNewToken = require('./syncFeedNewToken');
let jobService = require('./service/jobService');

const config_test = require("./config_test");
const stickerDBService = require('./service/stickerDBService');
config = config.curNetwork == 'testNet'? config_test : config;
global.fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
let log4js = require('log4js');
log4js.configure({
    appenders: {
        file: { type: 'dateFile', filename: 'logs/pasar.log', pattern: ".yyyy-MM-dd.log", compress: true, },
        console: { type: 'stdout'}
    },
    categories: { default: { appenders: ['file', 'console'], level: 'info' } },
    pm2: true,
    pm2InstanceVar: 'INSTANCE_ID'
});
global.logger = log4js.getLogger('default');

let web3WsProvider = new Web3.providers.WebsocketProvider(config.escWsUrl, {
    clientConfig: {
        // Useful if requests are large
        maxReceivedFrameSize: 100000000,   // bytes - default: 1MiB
        maxReceivedMessageSize: 100000000, // bytes - default: 8MiB
        keepalive: true, // Useful to keep a connection alive
        keepaliveInterval: 60000 // ms
    },
    reconnect: {
        auto: true,
        delay: 5000,
        maxAttempts: 5,
        onTimeout: false,
    },
})
let web3Rpc = new Web3(config.escRpcUrl);


let token = config.stickerContract;
const burnAddress = '0x0000000000000000000000000000000000000000';
const quoteToken = '0x0000000000000000000000000000000000000000';

let pasarContract = new web3Rpc.eth.Contract(pasarContractABI, config.pasarContract);

const step = 100;
let currentStep = 0;
let runningSyncFunction = false;

async function transferSingle(event) {
    let blockNumber = event.blockNumber;
    let txHash = event.transactionHash;
    let txIndex = event.transactionIndex;
    let from = event.returnValues._from;
    let to = event.returnValues._to;

    let tokenId = event.returnValues._id;
    let value = event.returnValues._value;

    let [blockInfo, txInfo] = await jobService.makeBatchRequest([
        {method: web3Rpc.eth.getBlock, params: blockNumber},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
    let timestamp = blockInfo.timestamp;

    let transferEvent = {tokenId, blockNumber, timestamp,txHash, txIndex, from, to, value, gasFee, token: config.stickerContract};
    logger.info(`[TokenInfo] tokenEvent: ${JSON.stringify(transferEvent)}`)

    if(to === burnAddress) {
        await stickerDBService.replaceEvent(transferEvent);
        await stickerDBService.burnToken(tokenId, config.stickerContract);
    } else if(from === burnAddress) {
        await stickerDBService.replaceEvent(transferEvent);
        await syncFeedNewToken.dealWithNewToken(blockNumber, tokenId)
    } else if(to != config.stickerContract && from != config.stickerContract){
        await stickerDBService.replaceEvent(transferEvent);
        await stickerDBService.updateToken(tokenId, to, timestamp, blockNumber, config.stickerContract);
    }
}

async function royaltyFee(event) {
    let tokenId = event.returnValues._id;
    let fee = event.returnValues._fee;
    
    console.log("RoayltyFee Event: " + JSON.stringify({tokenId, fee}));
    await stickerDBService.updateRoyaltiesOfToken(tokenId, fee, config.stickerContract);
}

async function orderForSale(event) {
    let orderInfo = event.returnValues;
    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: result.sellerAddr, buyerAddr: result.buyerAddr,
        royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, timestamp: result.updateTime, gasFee,
        baseToken: config.stickerContract, quoteToken: quoteToken, v1Event: true}
    
    let resultData = {orderType: result.orderType, orderState: result.orderState,
        tokenId: orderInfo._tokenId, amount: orderInfo._amount, price:orderInfo._price, priceNumber: parseInt(orderInfo._price), startTime: result.startTime, endTime: result.endTime,
        sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr, bids: result.bids, lastBidder: result.lastBidder,
        lastBid: result.lastBid, filled: result.filled, royaltyOwner: result.royaltyOwner, royaltyFee: result.royaltyFee,
        baseToken: config.stickerContract, amount: result.amount, quoteToken: quoteToken, buyoutPrice: 0, reservePrice: 0,
        minPrice: result.minPrice, createTime: result.createTime, updateTime: result.updateTime}

    let updateTokenInfo = {
        tokenId: orderInfo._tokenId,
        price: orderInfo._price,
        orderId: orderInfo._orderId,
        marketTime: result.updateTime,
        endTime: result.endTime,
        status: 'MarketSale',
        blockNumber: event.blockNumber,
        updateTime: event.updateTime,
        baseToken: token,
        quoteToken: quoteToken,
        v1State: true,
    };

    logger.info(`[OrderForSale] orderEventDetail: ${JSON.stringify(orderEventDetail)}`)
    logger.info(`[OrderForSale] updateTokenDetail: ${JSON.stringify(updateTokenInfo)}`)
    logger.info(`[OrderForSale] result: ${JSON.stringify(resultData)}`)
    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(resultData, event.blockNumber, orderInfo._orderId);                
    await stickerDBService.updateNormalToken(updateTokenInfo);
}

async function orderPriceChanged(event) {
    let orderInfo = event.returnValues;

    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id,
        data: {oldPrice: orderInfo._oldPrice, newPrice: orderInfo._newPrice}, sellerAddr: result.sellerAddr, buyerAddr: result.buyerAddr,
        royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, timestamp: result.updateTime, gasFee,
        baseToken: config.stickerContract, quoteToken: quoteToken, v1Event: true}
    
    
    let resultData = {orderType: result.orderType, orderState: result.orderState,
        tokenId: result.tokenId, amount: result.amount, price:orderInfo._newPrice, priceNumber: parseInt(orderInfo._newPrice), startTime: result.startTime, endTime: result.endTime,
        sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr, bids: result.bids, lastBidder: result.lastBidder,
        lastBid: result.lastBid, filled: result.filled, royaltyOwner: result.royaltyOwner, royaltyFee: result.royaltyFee,
        baseToken: config.stickerContract, amount: result.amount, quoteToken: quoteToken, buyoutPrice: 0, reservePrice: 0,
        minPrice: result.minPrice, createTime: result.createTime, updateTime: result.updateTime}

    let updateTokenInfo = {
        tokenId: result.tokenId,
        price: orderInfo._newPrice,
        baseToken: config.stickerContract
    };

    logger.info(`[OrderPriceChanged] orderEventDetail: ${JSON.stringify(orderEventDetail)}`)
    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(resultData, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateNormalToken(updateTokenInfo);
}

async function orderCanceled(event) {
    let orderInfo = event.returnValues;

    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: result.sellerAddr, buyerAddr: result.buyerAddr,
        royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, timestamp: result.updateTime, gasFee,
        baseToken: config.stickerContract, quoteToken: quoteToken, v1Event: true}
    
    let resultData = {orderType: result.orderType, orderState: result.orderState,
        tokenId: result.tokenId, amount: result.amount, price:result.price, priceNumber: parseInt(result.price), startTime: result.startTime, endTime: result.endTime,
        sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr, bids: result.bids, lastBidder: result.lastBidder,
        lastBid: result.lastBid, filled: result.filled, royaltyOwner: result.royaltyOwner, royaltyFee: result.royaltyFee,
        baseToken: config.stickerContract, amount: result.amount, quoteToken: quoteToken, buyoutPrice: 0, reservePrice: 0,
        minPrice: result.minPrice, createTime: result.createTime, updateTime: result.updateTime}

    let updateTokenInfo = {
        tokenId: result.tokenId,
        orderId: null,
        marketTime: result.updateTime,
        endTime: null,
        status: 'Not on sale',
        blockNumber: event.blockNumber,
        updateTime: event.updateTime,
        baseToken: config.stickerContract,
        v1State: false,
    };

    logger.info(`[OrderCanceled] orderEventDetail: ${JSON.stringify(orderEventDetail)}`)
    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(resultData, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateNormalToken(updateTokenInfo);
}

async function orderFilled(event) {
    let orderInfo = event.returnValues;

    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: result.sellerAddr, buyerAddr: result.buyerAddr,
        royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, timestamp: result.updateTime, gasFee,
        baseToken: config.stickerContract, quoteToken: quoteToken, v1Event: true}
    

    let resultData = {orderType: result.orderType, orderState: result.orderState,
        tokenId: result.tokenId, amount: result.amount, price:orderInfo._price, priceNumber: parseInt(orderInfo._price), startTime: result.startTime, endTime: result.endTime,
        sellerAddr: orderInfo._seller, buyerAddr: orderInfo._buyer, bids: result.bids, lastBidder: result.lastBidder,
        lastBid: result.lastBid, filled: result.filled, royaltyOwner: orderInfo._royaltyOwner, royaltyFee: orderInfo._royalty,
        baseToken: config.stickerContract, amount: result.amount, quoteToken: quoteToken, buyoutPrice: 0, reservePrice: 0,
        minPrice: result.minPrice, createTime: result.createTime, updateTime: result.updateTime}

    let updateTokenInfo = {
        tokenId: result.tokenId,
        price: orderInfo._price,
        holder: orderInfo._buyer,
        orderId: null,
        marketTime: result.updateTime,
        endTime: null,
        status: 'Not on sale',
        blockNumber: event.blockNumber,
        updateTime: event.updateTime,
        baseToken: config.stickerContract,
        v1State: false,
    };

    logger.info(`[OrderFilled] orderEventDetail: ${JSON.stringify(orderEventDetail)}`)
    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(resultData, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateNormalToken(updateTokenInfo);
}

async function importFeeds() {
    let totalCount = await stickerDBService.getCountSyncTemp();
    console.log(totalCount);

    let totalStep = Math.ceil(totalCount/100);
    try {
        runningSyncFunction = true;
        while(currentStep < totalStep) {
            let listDoc = await stickerDBService.getSyncTemp(currentStep, step);
            if(listDoc == null) {
                continue;
            }
            for(var i = 0; i < listDoc.length; i++) {
                let cell = listDoc[i];
                switch(cell.event) {
                    case "TransferSingle":
                        await transferSingle(cell.eventData);
                        break;
                    case "RoyaltyFee":
                        await royaltyFee(cell.eventData);
                        break;
                    case "OrderForSale":
                        await orderForSale(cell.eventData);
                        break;
                    case "OrderPriceChanged":
                        await orderPriceChanged(cell.eventData);
                        break;
                    case "OrderCanceled":
                        await orderCanceled(cell.eventData);
                        break;
                    case "OrderFilled":
                        await orderFilled(cell.eventData);
                        break;
                } 
            }
            currentStep++;
        }
    } catch(err) {
        console.log(err);
        runningSyncFunction = false;
    }
}

schedule.scheduleJob('0 * * * * *', () => {
    if(!runningSyncFunction) {
        importFeeds();
    }
})