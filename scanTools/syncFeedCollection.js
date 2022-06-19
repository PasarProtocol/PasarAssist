const schedule = require('node-schedule');
let Web3 = require('web3');
let config = require('../config');
let pasarDBService = require('../service/pasarDBService');
let pasarContractABI = require('../contractABI/pasarABI');
let stickerContractABI = require('../contractABI/stickerABI');

let stickerDBService = require('../service/stickerDBService');

let jobService = require('../service/jobService');

const { scanEvents, saveEvent, dealWithNewToken } = require("./utils");
const config_test = require("../config_test");

config = config.curNetwork == 'testNet'? config_test : config;
let token = config.stickerContract;
const burnAddress = '0x0000000000000000000000000000000000000000';
const quoteToken = '0x0000000000000000000000000000000000000000';

let web3Rpc = new Web3(config.escRpcUrl);
let pasarContract = new web3Rpc.eth.Contract(pasarContractABI, config.pasarContract);
let stickerContract = new web3Rpc.eth.Contract(stickerContractABI, config.stickerContract);

const step = 100;
let currentStep = 0;
const db = 'pasar_sync_temp1';

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

    if(to === burnAddress) {
        await stickerDBService.replaceEvent(transferEvent);
        await stickerDBService.burnToken(tokenId, config.stickerContract);
    } else if(from === burnAddress) {
        await stickerDBService.replaceEvent(transferEvent);
        await dealWithNewToken(stickerContract, blockNumber, tokenId, config.stickerContract)
    } else if(to != config.stickerContract && from != config.stickerContract && to != config.pasarContract && from != pasarContract &&
        to != config.pasarV2Contract && from != config.pasarV2Contract) {
        await stickerDBService.replaceEvent(transferEvent);
        await stickerDBService.updateToken(tokenId, to, timestamp, blockNumber, config.stickerContract);
    }
}

async function royaltyFee(event) {
    let tokenId = event.returnValues._id;
    let fee = event.returnValues._fee;
    
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
    
    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(resultData, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateNormalToken(updateTokenInfo);
}

async function importFeeds() {
    let totalCount = await stickerDBService.getCountSyncTemp(db);
    console.log(totalCount);

    let totalStep = Math.ceil(totalCount/100);
    console.log(totalStep);
    try {
        while(currentStep < totalStep) {
            let listDoc = await stickerDBService.getSyncTemp(db, currentStep, step);
            for(var i = 0; i < listDoc.length; i++) {   
                switch(listDoc[i].eventType) {
                    case "TransferSingle":
                        await transferSingle(listDoc[i].eventData);
                        break;
                    case "RoyaltyFee":
                        await royaltyFee(listDoc[i].eventData);
                        break;
                    case "OrderForSale":
                        await orderForSale(listDoc[i].eventData);
                        break;
                    case "OrderPriceChanged":
                        await orderPriceChanged(listDoc[i].eventData);
                        break;
                    case "OrderCanceled":
                        await orderCanceled(listDoc[i].eventData);
                        break;
                    case "OrderFilled":
                        await orderFilled(listDoc[i].eventData);
                        break;
                } 
            }
            currentStep++;
        }
    } catch(err) {
        console.log(err);
    }
}

const getTotalEventsOfSticker = async (startBlock, endBlock) => {
    let getAllEvents = await scanEvents(stickerContract, "TransferSingle", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, db);
    }
    console.log(`collectible count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(stickerContract, "RoyaltyFee", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, db);
    }
    console.log(`royalty count: ${getAllEvents.length}`);
};

const getTotalEventsOfPasar = async (startBlock, endBlock) => {
    let getAllEvents = await scanEvents(pasarContract, "OrderForSale", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, db);
    }
    console.log(`listed count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderPriceChanged", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, db);
    }
    console.log(`changed count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderCanceled", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, db);
    }
    console.log(`canceled count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderFilled", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, db);
    }
    console.log(`filled count: ${getAllEvents.length}`);

};

if (require.main == module) {
    web3Rpc.eth.getBlockNumber().then(async lastBlock => {
        let startBlock = config.stickerContractDeploy;
        
        let stickerCountContract = parseInt(await stickerContract.methods.totalSupply().call());
        console.log(stickerCountContract);

        while(startBlock < lastBlock) {
            await getTotalEventsOfSticker(startBlock, startBlock + 1000000);
            startBlock = startBlock + 1000000;
        };
        
        startBlock = config.pasarContractDeploy;
        while(startBlock < lastBlock) {
            await getTotalEventsOfPasar(startBlock, startBlock + 1000000);
            startBlock = startBlock + 1000000;
        };

        await importFeeds()
    });
}