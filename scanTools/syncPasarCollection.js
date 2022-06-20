const schedule = require('node-schedule');
let Web3 = require('web3');
let pasarDBService = require('../service/pasarDBService');
let pasarContractABI = require('../contractABI/pasarV2ABI');
let stickerContractABI = require('../contractABI/stickerV2ABI');

let stickerDBService = require('../service/stickerDBService');
let jobService = require('../service/jobService');

const { scanEvents, saveEvent, dealWithNewToken, config, DB_SYNC} = require("./utils");
const burnAddress = '0x0000000000000000000000000000000000000000';

let web3Rpc = new Web3(config.escRpcUrl);
let pasarContract = new web3Rpc.eth.Contract(pasarContractABI, config.pasarV2Contract);
let stickerContract = new web3Rpc.eth.Contract(stickerContractABI, config.stickerV2Contract);


async function transferSingleV2(event) {
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

    let transferEvent = {tokenId, blockNumber, timestamp,txHash, txIndex, from, to, value, gasFee, token: config.stickerV2Contract};

    if(to === burnAddress) {
        await stickerDBService.replaceEvent(transferEvent);
        await stickerDBService.burnToken(tokenId, config.stickerV2Contract);
    } else if(from === burnAddress) {
        await stickerDBService.replaceEvent(transferEvent);
        await dealWithNewToken(stickerContract, blockNumber, tokenId, config.stickerV2Contract)
    } else if(to != config.stickerContract && from != config.stickerContract && to != config.pasarContract && from != pasarContract &&
        to != config.pasarV2Contract && from != config.pasarV2Contract) {
        await stickerDBService.replaceEvent(transferEvent);
        await stickerDBService.updateToken(tokenId, to, timestamp, blockNumber, config.stickerContract);
    }
}

async function transferBatchV2(event) {
    let blockNumber = event.blockNumber;
    let txHash = event.transactionHash;
    let txIndex = event.transactionIndex;
    let from = event.returnValues._from;
    let to = event.returnValues._to;

    let tokenIds = event.returnValues._ids;
    let values = event.returnValues._values;

    let [blockInfo, txInfo] = await jobService.makeBatchRequest([
        {method: web3Rpc.eth.getBlock, params: blockNumber},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
    let timestamp = blockInfo.timestamp;

    for(var i = 0; i < tokenIds.length; i++)
    {
        let tokenId = tokenIds[i];
        let value = values[i];
        let transferEvent = {tokenId, blockNumber, timestamp,txHash, txIndex, from, to, value, gasFee, token: config.stickerV2Contract};

        if(to === burnAddress) {
            await stickerDBService.replaceEvent(transferEvent);
            await stickerDBService.burnToken(tokenId, config.stickerV2Contract);
        } else if(from === burnAddress) {
            await stickerDBService.replaceEvent(transferEvent);
            await dealWithNewToken(stickerContract, blockNumber, tokenId, config.stickerV2Contract)
        } else if(to != config.stickerContract && from != config.stickerContract && to != config.pasarContract && from != pasarContract &&
            to != config.pasarV2Contract && from != config.pasarV2Contract) {
            await stickerDBService.replaceEvent(transferEvent);
            await stickerDBService.updateToken(tokenId, to, timestamp, blockNumber, config.stickerV2Contract);
        }
    }
}

async function royaltyFeeV2(event) {
    let tokenId = event.returnValues._id;
    let fee = event.returnValues._fee;
    
    await stickerDBService.updateRoyaltiesOfToken(tokenId, fee, config.stickerV2Contract);
}

async function orderForSaleV2(event) {
    let orderInfo = event.returnValues;
    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr,
        royaltyFee: result.royaltyFee, tokenId: orderInfo._tokenId, quoteToken:orderInfo._quoteToken, baseToken: orderInfo._baseToken, price: result.price, timestamp: result.updateTime, gasFee}

        result.sellerAddr = orderInfo._seller;
        result.tokenId = orderInfo._tokenId;
        result.amount = orderInfo._amount;
        result.price = orderInfo._price;
        result.quoteToken = orderInfo._quoteToken;
        result.baseToken = orderInfo._baseToken;
        result.reservePrice = 0;
        result.buyoutPrice = 0;
        result.createTime = orderInfo._startTime;
        result.endTime = 0;

        await pasarDBService.insertOrderEvent(orderEventDetail);
        await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
        await stickerDBService.updateTokenInfo(orderInfo._tokenId, orderEventDetail.price, orderEventDetail.orderId, orderInfo._startTime, result.endTime, 'MarketSale', result.sellerAddr, event.blockNumber, orderInfo._quoteToken, orderInfo._baseToken);
}

async function orderPriceChangedV2(event) {
    let orderInfo = event.returnValues;

    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

    console.log(result.tokenId);
    console.log(orderInfo._orderId);

    let token = await stickerDBService.getTokenInfo(result.tokenId, orderInfo._orderId);
    console.log(token);
    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id,
        data: {oldPrice: orderInfo._oldPrice, newPrice: orderInfo._newPrice, oldReservePrice: orderInfo._oldReservePrice, newReservePrice: orderInfo._newReservePrice,
        oldBuyoutPrice: orderInfo._oldBuyoutPrice, newBuyoutPrice: orderInfo._newBuyoutPrice, oldQuoteToken: orderInfo._oldQuoteToken, newQuoteToken: orderInfo._newQuoteToken},
        sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr,
        royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, quoteToken:orderInfo._newQuoteToken, baseToken: token.baseToken,timestamp: result.updateTime, gasFee}

    result.price = orderInfo._newPrice;
    result.reservePrice = orderInfo._newReservePrice;
    result.buyoutPrice = orderInfo._newBuyoutPrice;
    result.price = orderInfo._newPrice;
    result.quoteToken = orderInfo._newQuoteToken;

    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateTokenInfo(result.tokenId, orderEventDetail.price, orderEventDetail.orderId, null, null, null, result.sellerAddr, event.blockNumber, orderEventDetail.quoteToken, token.baseToken);
}

async function orderCanceledV2(event) {
    let orderInfo = event.returnValues;

    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

    let token = await stickerDBService.getTokenInfo(result.tokenId, orderInfo._orderId)

    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr,
        royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, timestamp: result.updateTime, gasFee,
        baseToken: token.baseToken, quoteToken: token.quoteToken};

    result.sellerAddr = orderInfo._seller

    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateTokenInfo(result.tokenId, orderEventDetail.price, orderInfo._orderId, result.updateTime, 0, 'Not on sale', result.sellerAddr, event.blockNumber, token.quoteToken, token.baseToken);
}

async function orderFilledV2(event) {
    let orderInfo = event.returnValues;

    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: orderInfo._buyer,
        royaltyFee: orderInfo._royaltyFee, royaltyOwner:orderInfo._royaltyOwner, tokenId: result.tokenId, quoteToken:orderInfo._quoteToken,
        baseToken: orderInfo._baseToken, price: orderInfo._price, timestamp: result.updateTime, gasFee}

    let orderEventFeeDetail = {orderId: orderInfo._orderId, blockNumber: event.blockNumber, txHash: event.transactionHash,
        txIndex: event.transactionIndex, platformAddr: orderInfo._platformAddress, platformFee: orderInfo._platformFee};

    result.sellerAddr = orderInfo._seller;
    result.buyerAddr = orderInfo._buyer;
    result.amount = orderInfo._amount;
    result.price = orderInfo._price;
    result.royaltyOwner = orderInfo._royaltyOwner;
    result.royaltyFee = orderInfo._royaltyFee;
    result.quoteToken = orderInfo._quoteToken;
    result.baseToken = orderInfo._baseToken;

    await pasarDBService.insertOrderEvent(orderEventDetail);
    await pasarDBService.insertOrderPlatformFeeEvent(orderEventFeeDetail);
    await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateTokenInfo(result.tokenId, orderEventDetail.price, null, result.updateTime, null, 'Not on sale', result.buyerAddr, event.blockNumber, orderInfo._quoteToken, orderInfo._baseToken);
}

async function orderForAuctionV2(event) {
    let orderInfo = event.returnValues;

    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr,
        royaltyFee: result.royaltyFee, tokenId: orderInfo._tokenId, baseToken: orderInfo._baseToken, amount: orderInfo._amount,
        quoteToken:orderInfo._quoteToken, reservePrice: orderInfo._reservePrice,
        buyoutPrice: orderInfo._buyoutPrice, startTime: orderInfo._startTime, endTime: orderInfo._endTime, price: orderInfo._minPrice, timestamp: result.updateTime, gasFee}

    result.sellerAddr = orderInfo._seller;
    result.baseToken = orderInfo._baseToken;
    result.tokenId = orderInfo._tokenId;
    result.amount = orderInfo._amount;
    result.quoteToken = orderInfo._quoteToken;
    result.price = orderInfo._minPrice;
    result.reservePrice = orderInfo._reservePrice;
    result.buyoutPrice = orderInfo._buyoutPrice;
    result.createTime = orderInfo._startTime;
    result.endTime = orderInfo._endTime;

    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateTokenInfo(result.tokenId, orderEventDetail.price, orderEventDetail.orderId, orderInfo._startTime, orderInfo._endTime, 'MarketAuction', result.sellerAddr, event.blockNumber, orderInfo._quoteToken, orderInfo._baseToken);
}

async function orderBidV2(event) {
    let orderInfo = event.returnValues;

    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

    let token = await stickerDBService.getTokenInfo(result.tokenId, orderInfo._orderId)

    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: orderInfo._buyer,
        royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: orderInfo._price, 
        quoteToken: token.quoteToken, baseToken: token.baseToken, timestamp: result.updateTime, gasFee}
    
    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateTokenInfo(result.tokenId, orderInfo._price, orderEventDetail.orderId, null, result.endTime, 'MarketBid', null, event.blockNumber, token.quoteToken, token.baseToken);
}

const getTotalEventsOfSticker = async (startBlock, endBlock) => {
    let getAllEvents = await scanEvents(stickerContract, "TransferSingle", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.stickerV2Contract);
    }
    console.log(`collectible count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(stickerContract, "TransferBatch", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.stickerV2Contract);
    }
    console.log(`collectible batch count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(stickerContract, "RoyaltyFee", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.stickerV2Contract);
    }
    console.log(`royalty count: ${getAllEvents.length}`);
};

const getTotalEventsOfPasar = async (startBlock, endBlock) => {
    let getAllEvents = await scanEvents(pasarContract, "OrderForSale", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.pasarV2Contract);
    }
    console.log(`listed count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderForAuction", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.pasarV2Contract);
    }
    console.log(`auction count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderPriceChanged", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.pasarV2Contract);
    }
    console.log(`changed count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderBid", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.pasarV2Contract);
    }
    console.log(`bid count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderCanceled", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.pasarV2Contract);
    }
    console.log(`canceled count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderFilled", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.pasarV2Contract);
    }
    console.log(`filled count: ${getAllEvents.length}`);
};

const syncPasarCollection = async () => {
    let lastBlock = await web3Rpc.eth.getBlockNumber();
    let startBlock = config.stickerV2ContractDeploy;
    let stickerCountContract = parseInt(await stickerContract.methods.totalSupply().call());
    console.log("Total Pasar Collection: " + stickerCountContract);
    while(startBlock < lastBlock) {
        await getTotalEventsOfSticker(startBlock, startBlock + 1000000);
        startBlock = startBlock + 1000000;
    };
    
    startBlock = config.pasarV2ContractDeploy;
    while(startBlock < lastBlock) {
        await getTotalEventsOfPasar(startBlock, startBlock + 1000000);
        startBlock = startBlock + 1000000;
    };
}

module.exports = {
    syncPasarCollection,
    transferSingleV2,
    transferBatchV2,
    royaltyFeeV2,
    orderForSaleV2,
    orderForAuctionV2,
    orderBidV2,
    orderPriceChangedV2,
    orderCanceledV2,
    orderFilledV2
}