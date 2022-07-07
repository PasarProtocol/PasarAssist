/**
    sync the nfts of feeds collection on elastos network
*/

const schedule = require('node-schedule');
let Web3 = require('web3');
let pasarDBService = require('../service/pasarDBService');
let pasarContractABI = require('../contractABI/pasarABI');
let stickerContractABI = require('../contractABI/stickerABI');
let stickerDBService = require('../service/stickerDBService');
let jobService = require('../service/jobService');

const { scanEvents, saveEvent, dealWithNewToken, config, DB_SYNC } = require("./utils");

let token = config.stickerContract;
const burnAddress = '0x0000000000000000000000000000000000000000';
const quoteToken = '0x0000000000000000000000000000000000000000';

let web3Rpc = new Web3(config.escRpcUrl);
let pasarContract = new web3Rpc.eth.Contract(pasarContractABI, config.pasarContract);
let stickerContract = new web3Rpc.eth.Contract(stickerContractABI, config.stickerContract);

async function transferSingleV1(event, marketPlace) {
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

    let transferEvent = {tokenId, blockNumber, timestamp,txHash, txIndex, from, to, value, gasFee, token: config.stickerContract, marketPlace: marketPlace};

    if(to === burnAddress) {
        await stickerDBService.replaceEvent(transferEvent);
        await stickerDBService.burnToken(tokenId, config.stickerContract, marketPlace);
    } else if(from === burnAddress) {
        await stickerDBService.replaceEvent(transferEvent);
        await dealWithNewToken(stickerContract, web3Rpc, blockNumber, tokenId, config.stickerContract, marketPlace)
    } else if(stickerDBService.checkAddress(to) && stickerDBService.checkAddress(from)) {
        await stickerDBService.replaceEvent(transferEvent);
        await stickerDBService.updateToken(tokenId, to, timestamp, blockNumber, config.stickerContract, marketPlace);
    }
}

async function royaltyFeeV1(event, marketPlace) {
    let tokenId = event.returnValues._id;
    let fee = event.returnValues._fee;
    
    await stickerDBService.updateRoyaltiesOfToken(tokenId, fee, config.stickerContract, marketPlace);
}

async function orderForSaleV1(event, marketPlace) {
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
        baseToken: config.stickerContract, quoteToken: quoteToken, v1Event: true, marketPlace: marketPlace}
    
    let resultData = {orderType: result.orderType, orderState: result.orderState,
        tokenId: orderInfo._tokenId, amount: orderInfo._amount, price:orderInfo._price, startTime: result.startTime, endTime: result.endTime,
        sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr, bids: result.bids, lastBidder: result.lastBidder,
        lastBid: result.lastBid, filled: result.filled, royaltyOwner: result.royaltyOwner, royaltyFee: result.royaltyFee,
        baseToken: config.stickerContract, amount: result.amount, quoteToken: quoteToken, buyoutPrice: 0, reservePrice: 0,
        minPrice: result.minPrice, createTime: result.createTime, updateTime: result.updateTime, marketPlace: marketPlace}

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
        marketPlace: marketPlace
    };

    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(resultData, event.blockNumber, orderInfo._orderId);                
    await stickerDBService.updateNormalToken(updateTokenInfo);
}

async function orderPriceChangedV1(event, marketPlace) {
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
        baseToken: config.stickerContract, quoteToken: quoteToken, v1Event: true, marketPlace: marketPlace}
    
    
    let resultData = {orderType: result.orderType, orderState: result.orderState,
        tokenId: result.tokenId, amount: result.amount, price:orderInfo._newPrice, startTime: result.startTime, endTime: result.endTime,
        sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr, bids: result.bids, lastBidder: result.lastBidder,
        lastBid: result.lastBid, filled: result.filled, royaltyOwner: result.royaltyOwner, royaltyFee: result.royaltyFee,
        baseToken: config.stickerContract, amount: result.amount, quoteToken: quoteToken, buyoutPrice: 0, reservePrice: 0,
        minPrice: result.minPrice, createTime: result.createTime, updateTime: result.updateTime, marketPlace: marketPlace}

    let updateTokenInfo = {
        tokenId: result.tokenId,
        price: orderInfo._newPrice,
        baseToken: config.stickerContract,
        marketPlace: marketPlace
    };

    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(resultData, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateNormalToken(updateTokenInfo);
}

async function orderCanceledV1(event, marketPlace) {
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
        baseToken: config.stickerContract, quoteToken: quoteToken, v1Event: true, marketPlace: marketPlace}
    
    let resultData = {orderType: result.orderType, orderState: result.orderState,
        tokenId: result.tokenId, amount: result.amount, price:result.price, startTime: result.startTime, endTime: result.endTime,
        sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr, bids: result.bids, lastBidder: result.lastBidder,
        lastBid: result.lastBid, filled: result.filled, royaltyOwner: result.royaltyOwner, royaltyFee: result.royaltyFee,
        baseToken: config.stickerContract, amount: result.amount, quoteToken: quoteToken, buyoutPrice: 0, reservePrice: 0,
        minPrice: result.minPrice, createTime: result.createTime, updateTime: result.updateTime, marketPlace: marketPlace}

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
        marketPlace: marketPlace
    };

    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(resultData, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateNormalToken(updateTokenInfo);
}

async function orderFilledV1(event, marketPlace) {
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
        baseToken: config.stickerContract, quoteToken: quoteToken, v1Event: true, marketPlace: marketPlace}
    

    let resultData = {orderType: result.orderType, orderState: result.orderState,
        tokenId: result.tokenId, amount: result.amount, price:orderInfo._price, 394: parseInt(orderInfo._price), startTime: result.startTime, endTime: result.endTime,
        sellerAddr: orderInfo._seller, buyerAddr: orderInfo._buyer, bids: result.bids, lastBidder: result.lastBidder,
        lastBid: result.lastBid, filled: result.filled, royaltyOwner: orderInfo._royaltyOwner, royaltyFee: orderInfo._royalty,
        baseToken: config.stickerContract, amount: result.amount, quoteToken: quoteToken, buyoutPrice: 0, reservePrice: 0,
        minPrice: result.minPrice, createTime: result.createTime, updateTime: result.updateTime, marketPlace: marketPlace}

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
        marketPlace: marketPlace
    };
    
    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(resultData, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateNormalToken(updateTokenInfo);
}

const getTotalEventsOfSticker = async (startBlock, endBlock) => {
    let getAllEvents = await scanEvents(stickerContract, "TransferSingle", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.stickerContract);
    }
    console.log(`collectible count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(stickerContract, "RoyaltyFee", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.stickerContract);
    }
    console.log(`royalty count: ${getAllEvents.length}`);
};

const getTotalEventsOfFeeds = async (startBlock, endBlock) => {
    let getAllEvents = await scanEvents(pasarContract, "OrderForSale", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.pasarContract);
    }
    console.log(`listed count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderPriceChanged", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.pasarContract);
    }
    console.log(`changed count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderCanceled", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.pasarContract);
    }
    console.log(`canceled count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderFilled", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.pasarContract);
    }
    console.log(`filled count: ${getAllEvents.length}`);
};

const syncFeedCollection = async () => {
    let lastBlock = await web3Rpc.eth.getBlockNumber();
    let startBlock = config.stickerContractDeploy;        
    let stickerCountContract = parseInt(await stickerContract.methods.totalSupply().call());
    console.log("Feeds Collection Count:" + stickerCountContract);
    while(startBlock < lastBlock) {
        await getTotalEventsOfSticker(startBlock, startBlock + 1000000);
        startBlock = startBlock + 1000000;
    };
    
    startBlock = config.pasarContractDeploy;
    while(startBlock < lastBlock) {
        await getTotalEventsOfFeeds(startBlock, startBlock + 1000000);
        startBlock = startBlock + 1000000;
    };
}

module.exports = {
    syncFeedCollection,
    transferSingleV1,
    royaltyFeeV1,
    orderForSaleV1,
    orderFilledV1,
    orderCanceledV1,
    orderPriceChangedV1,
}