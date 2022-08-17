/**
    sync the nfts of pasar collection on elastos network
*/

const schedule = require('node-schedule');
let Web3 = require('web3');
let pasarDBService = require('../../service/pasarDBService');
let pasarContractABI = require('../../contractABI/pasarV2ABI');
let stickerContractABI = require('../../contractABI/stickerV2ABI');

let stickerDBService = require('../../service/stickerDBService');
let jobService = require('../../service/jobService');
let authService  = require('../../service/authService')

const { scanEvents, saveEvent, dealWithNewToken, config, DB_SYNC} = require("./utils");
const burnAddress = '0x0000000000000000000000000000000000000000';

let web3Rpc = new Web3(config.elastos.rpcUrl);
let pasarContract = new web3Rpc.eth.Contract(pasarContractABI, config.elastos.pasarV2Contract);
let stickerContract = new web3Rpc.eth.Contract(stickerContractABI, config.elastos.stickerV2Contract);


async function transferSingleV2(event, marketPlace) {
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

    let transferEvent = {tokenId, blockNumber, timestamp,txHash, txIndex, from, to, value, gasFee, token: config.elastos.stickerV2Contract, marketPlace};

    if(to === burnAddress) {
        await stickerDBService.replaceEvent(transferEvent);
        await stickerDBService.burnToken(tokenId, config.elastos.stickerV2Contract, marketPlace);
    } else if(from === burnAddress) {
        await stickerDBService.replaceEvent(transferEvent);
        await dealWithNewToken(stickerContract, web3Rpc, blockNumber, tokenId, config.elastos.stickerV2Contract, marketPlace)
    } else if(stickerDBService.checkAddress(to) && stickerDBService.checkAddress(from)) {
        await stickerDBService.replaceEvent(transferEvent);
        await stickerDBService.updateToken(tokenId, to, timestamp, blockNumber, config.elastos.stickerV2Contract, marketPlace);
    }
}

async function transferBatchV2(event, marketPlace) {
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
        let transferEvent = {tokenId, blockNumber, timestamp,txHash, txIndex, from, to, value, gasFee, token: config.elastos.stickerV2Contract, marketPlace};

        if(to === burnAddress) {
            await stickerDBService.replaceEvent(transferEvent);
            await stickerDBService.burnToken(tokenId, config.elastos.stickerV2Contract, marketPlace);
        } else if(from === burnAddress) {
            await stickerDBService.replaceEvent(transferEvent);
            await dealWithNewToken(stickerContract, web3Rpc, blockNumber, tokenId, config.elastos.stickerV2Contract, marketPlace)
        } else if(stickerDBService.checkAddress(to) && stickerDBService.checkAddress(from)) {
            await stickerDBService.replaceEvent(transferEvent);
            await stickerDBService.updateToken(tokenId, to, timestamp, blockNumber, config.elastos.stickerV2Contract, marketPlace);
        }
    }
}

async function royaltyFeeV2(event, marketPlace) {
    let tokenId = event.returnValues._id;
    let fee = event.returnValues._fee;
    
    await stickerDBService.updateRoyaltiesOfToken(tokenId, fee, config.elastos.stickerV2Contract, marketPlace);
}

async function orderForSaleV2(event, marketPlace) {
    let orderInfo = event.returnValues;
    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr, marketPlace,
        royaltyFee: result.royaltyFee, tokenId: orderInfo._tokenId, quoteToken:orderInfo._quoteToken, baseToken: orderInfo._baseToken, price: result.price, timestamp: result.updateTime, gasFee}

        let updateResult = {...result};

        updateResult.sellerAddr = orderInfo._seller;
        updateResult.tokenId = orderInfo._tokenId;
        updateResult.amount = orderInfo._amount;
        updateResult.price = orderInfo._price;
        updateResult.quoteToken = orderInfo._quoteToken;
        updateResult.baseToken = orderInfo._baseToken;
        updateResult.reservePrice = 0;
        updateResult.buyoutPrice = 0;
        updateResult.createTime = orderInfo._startTime;
        updateResult.endTime = 0;
        updateResult.marketPlace = marketPlace;

        await pasarDBService.insertOrderEvent(orderEventDetail);
        await stickerDBService.updateOrder(updateResult, event.blockNumber, orderInfo._orderId);
        await stickerDBService.updateTokenInfo(orderInfo._tokenId, orderEventDetail.price, orderEventDetail.orderId, orderInfo._startTime, updateResult.endTime, 'MarketSale', updateResult.sellerAddr, event.blockNumber, orderInfo._quoteToken, orderInfo._baseToken, marketPlace);
        await stickerDBService.updateTokenStatus(event.event, orderInfo._tokenId, orderInfo._baseToken, config.elastos.chainType)
}

async function orderPriceChangedV2(event, marketPlace) {
    let orderInfo = event.returnValues;

    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

    let token = await stickerDBService.getTokenInfo(result.tokenId, orderInfo._orderId, config.elastos.chainType);
    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id,
        data: {oldPrice: orderInfo._oldPrice, newPrice: orderInfo._newPrice, oldReservePrice: orderInfo._oldReservePrice, newReservePrice: orderInfo._newReservePrice,
        oldBuyoutPrice: orderInfo._oldBuyoutPrice, newBuyoutPrice: orderInfo._newBuyoutPrice, oldQuoteToken: orderInfo._oldQuoteToken, newQuoteToken: orderInfo._newQuoteToken},
        sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr, marketPlace,
        royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, quoteToken:orderInfo._newQuoteToken, baseToken: token.baseToken,timestamp: result.updateTime, gasFee}

    let updateResult = {...result};
    
    updateResult.price = orderInfo._newPrice;
    updateResult.reservePrice = orderInfo._newReservePrice;
    updateResult.buyoutPrice = orderInfo._newBuyoutPrice;
    updateResult.price = orderInfo._newPrice;
    updateResult.quoteToken = orderInfo._newQuoteToken;
    updateResult.marketPlace = marketPlace;

    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(updateResult, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateTokenInfo(updateResult.tokenId, orderEventDetail.price, orderEventDetail.orderId, null, null, null, updateResult.sellerAddr, event.blockNumber, orderEventDetail.quoteToken, token.baseToken, marketPlace);
}

async function orderCanceledV2(event, marketPlace) {
    let orderInfo = event.returnValues;

    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

    let token = await stickerDBService.getTokenInfo(result.tokenId, orderInfo._orderId, config.elastos.chainType)

    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr,
        royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, timestamp: result.updateTime, gasFee,
        baseToken: token.baseToken, quoteToken: token.quoteToken, marketPlace};

    let updateResult = {...result};
    updateResult.sellerAddr = orderInfo._seller
    updateResult.marketPlace = marketPlace;

    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(updateResult, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateTokenInfo(updateResult.tokenId, orderEventDetail.price, orderInfo._orderId, updateResult.updateTime, 0, 'Not on sale', updateResult.sellerAddr, event.blockNumber, token.quoteToken, token.baseToken, marketPlace);
    await stickerDBService.updateTokenStatus(event.event, updateResult.tokenId, token.baseToken, config.elastos.chainType)
}

async function orderFilledV2(event, marketPlace) {
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
        baseToken: orderInfo._baseToken, price: orderInfo._price, timestamp: result.updateTime, gasFee, marketPlace}

    let orderEventFeeDetail = {orderId: orderInfo._orderId, blockNumber: event.blockNumber, txHash: event.transactionHash,
        txIndex: event.transactionIndex, platformAddr: orderInfo._platformAddress, platformFee: orderInfo._platformFee, marketPlace};

    let updateResult = {...result};
    updateResult.sellerAddr = orderInfo._seller;
    updateResult.buyerAddr = orderInfo._buyer;
    updateResult.amount = orderInfo._amount;
    updateResult.price = orderInfo._price;
    updateResult.royaltyOwner = orderInfo._royaltyOwner;
    updateResult.royaltyFee = orderInfo._royaltyFee;
    updateResult.quoteToken = orderInfo._quoteToken;
    updateResult.baseToken = orderInfo._baseToken;
    updateResult.marketPlace = marketPlace;

    await pasarDBService.insertOrderEvent(orderEventDetail);
    await pasarDBService.insertOrderPlatformFeeEvent(orderEventFeeDetail);
    await stickerDBService.updateOrder(updateResult, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateTokenInfo(updateResult.tokenId, orderEventDetail.price, null, updateResult.updateTime, null, 'Not on sale', updateResult.buyerAddr, event.blockNumber, orderInfo._quoteToken, orderInfo._baseToken, marketPlace);
    await stickerDBService.updateTokenStatus(event.event, updateResult.tokenId, orderInfo._baseToken, config.elastos.chainType)
}

async function orderForAuctionV2(event, marketPlace) {
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
        quoteToken:orderInfo._quoteToken, reservePrice: orderInfo._reservePrice, marketPlace,
        buyoutPrice: orderInfo._buyoutPrice, startTime: orderInfo._startTime, endTime: orderInfo._endTime, price: orderInfo._minPrice, timestamp: result.updateTime, gasFee}

    let updateResult = {...result};
    updateResult.sellerAddr = orderInfo._seller;
    updateResult.baseToken = orderInfo._baseToken;
    updateResult.tokenId = orderInfo._tokenId;
    updateResult.amount = orderInfo._amount;
    updateResult.quoteToken = orderInfo._quoteToken;
    updateResult.price = orderInfo._minPrice;
    updateResult.reservePrice = orderInfo._reservePrice;
    updateResult.buyoutPrice = orderInfo._buyoutPrice;
    updateResult.createTime = orderInfo._startTime;
    updateResult.endTime = orderInfo._endTime;
    updateResult.marketPlace = marketPlace;

    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(updateResult, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateTokenInfo(updateResult.tokenId, orderEventDetail.price, orderEventDetail.orderId, orderInfo._startTime, orderInfo._endTime, 'MarketAuction', updateResult.sellerAddr, event.blockNumber, orderInfo._quoteToken, orderInfo._baseToken, marketPlace);
    await stickerDBService.updateTokenStatus(event.event, orderInfo._tokenId, orderInfo._baseToken, config.elastos.chainType)
    
}

async function orderBidV2(event, marketPlace) {
    let orderInfo = event.returnValues;

    let [result, txInfo] = await jobService.makeBatchRequest([
        {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
        {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
    ], web3Rpc)
    let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
    
    let token = await stickerDBService.getTokenInfo(result.tokenId, orderInfo._orderId, config.elastos.chainType)

    let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: orderInfo._buyer,
        royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: orderInfo._price, marketPlace,
        quoteToken: token.quoteToken, baseToken: token.baseToken, timestamp: result.updateTime, gasFee}

    let updateResult = {...result}
    updateResult.marketPlace = marketPlace;

    await pasarDBService.insertOrderEvent(orderEventDetail);
    await stickerDBService.updateOrder(updateResult, event.blockNumber, orderInfo._orderId);
    await stickerDBService.updateTokenInfo(updateResult.tokenId, orderInfo._price, orderEventDetail.orderId, null, updateResult.endTime, 'MarketBid', null, event.blockNumber, token.quoteToken, token.baseToken, marketPlace);
    
}

const getTotalEventsOfSticker = async (startBlock, endBlock) => {
    let getAllEvents = await scanEvents(stickerContract, "TransferSingle", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.elastos.stickerV2Contract);
    }
    console.log(`collectible count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(stickerContract, "TransferBatch", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.elastos.stickerV2Contract);
    }
    console.log(`collectible batch count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(stickerContract, "RoyaltyFee", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.elastos.stickerV2Contract);
    }
    console.log(`royalty count: ${getAllEvents.length}`);
};

async function orderDIDURI(event, marketPlace) {
    let orderInfo = event.returnValues;
    let token = {orderId: orderInfo._orderId}
    token.didUri = orderInfo._sellerUri;
    token.did = await jobService.getInfoByIpfsUri(orderInfo._sellerUri);
    await pasarDBService.updateDid({address: orderInfo._seller, did: token.did});
    if(token.did.KYCedProof != undefined) {
        await authService.verifyKyc(token.did.KYCedProof, token.did.did, orderInfo._seller);
    }
    
    let updateResult = {};
    updateResult.orderId = orderInfo._orderId;
    updateResult.sellerAddr = orderInfo._seller;
    updateResult.buyerAddr = orderInfo._buyer;
    updateResult.event = event.event;
    updateResult.blockNumber = event.blockNumber;
    updateResult.tHash = event.transactionHash;
    updateResult.blockHash = event.blockHash;
    updateResult.v1Event = false;
    updateResult.marketPlace = marketPlace;

    await pasarDBService.insertOrderEvent(updateResult);
}

const getTotalEventsOfPasar = async (startBlock, endBlock) => {
    let getAllEvents = await scanEvents(pasarContract, "OrderForSale", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.elastos.pasarV2Contract);
    }
    console.log(`listed count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderForAuction", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.elastos.pasarV2Contract);
    }
    console.log(`auction count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderPriceChanged", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.elastos.pasarV2Contract);
    }
    console.log(`changed count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderBid", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.elastos.pasarV2Contract);
    }
    console.log(`bid count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderCanceled", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.elastos.pasarV2Contract);
    }
    console.log(`canceled count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderFilled", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.elastos.pasarV2Contract);
    }
    console.log(`filled count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarContract, "OrderDIDURI", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_SYNC, config.elastos.pasarV2Contract);
    }
    console.log(`did uri count: ${getAllEvents.length}`);
};

const syncPasarCollection = async () => {
    let lastBlock = await web3Rpc.eth.getBlockNumber();
    let startBlock = config.elastos.stickerV2ContractDeploy;
    let stickerCountContract = parseInt(await stickerContract.methods.totalSupply().call());
    console.log("Total Pasar Collection: " + stickerCountContract);
    while(startBlock < lastBlock) {
        await getTotalEventsOfSticker(startBlock, startBlock + 1000000);
        startBlock = startBlock + 1000000;
    };
    
    startBlock = config.elastos.pasarV2ContractDeploy;
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
    orderFilledV2,
    orderDIDURI
}