const schedule = require('node-schedule');
let Web3 = require('web3');
let config = require('./config');
let pasarDBService = require('./service/pasarDBService');
let stickerContractABI = require('./contractABI/stickerABI');
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
let web3Ws = new Web3(web3WsProvider);
let web3Rpc = new Web3(config.escRpcUrl);

let now = Date.now();

let token = config.stickerContract;
const burnAddress = '0x0000000000000000000000000000000000000000';
const quoteToken = '0x0000000000000000000000000000000000000000';
let stickerContractWs = new web3Ws.eth.Contract(stickerContractABI, config.stickerContract);
let stickerContract = new web3Rpc.eth.Contract(stickerContractABI, config.stickerContract);

let pasarContractWs = new web3Ws.eth.Contract(pasarContractABI, config.pasarContract);
let pasarContract = new web3Rpc.eth.Contract(pasarContractABI, config.pasarContract);

let transferSingleCurrent = config.stickerContractDeploy,
    royaltiesCurrent = config.stickerContractDeploy,
    orderForSaleJobCurrent = config.pasarContractDeploy,
    priceChangeJobCurrent = config.pasarContractDeploy,
    orderFilledJobCurrent = config.pasarContractDeploy;

const step = 10000;
web3Rpc.eth.getBlockNumber().then(async currentHeight => {
    console.log(currentHeight);
    let stickerCountContract = parseInt(await stickerContract.methods.totalSupply().call());

    console.log("Total Count: " + stickerCountContract);

    schedule.scheduleJob({start: new Date(now + 60 * 1000), rule: '0 * * * * *'}, async () => {
        console.log(currentHeight);
        console.log(transferSingleCurrent);
        if(transferSingleCurrent > currentHeight) {
            console.log(`[Collection] Sync ${transferSingleCurrent} finished`)
            return;
        }
        const tempBlockNumber = transferSingleCurrent + step
        const toBlock = tempBlockNumber > currentHeight ? currentHeight : tempBlockNumber;

        console.log(`[Collection] Sync ${transferSingleCurrent} ~ ${toBlock} ...`)

        stickerContractWs.getPastEvents('TransferSingle', {
            fromBlock: transferSingleCurrent, toBlock
        }).then(events => {
            events.forEach(async event => {
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
            })
            transferSingleCurrent = toBlock + 1;
        }).catch(error => {
            console.log(error);
            console.log("[OrderForSale] Sync Ending ...")
        })
    });

    schedule.scheduleJob({start: new Date(now + 2 * 60 * 1000), rule: '10 * * * * *'}, async () => {
        console.log(currentHeight);
        console.log(royaltiesCurrent);
        if(royaltiesCurrent > currentHeight) {
            console.log(`[Collection] Sync ${royaltiesCurrent} finished`)
            return;
        }
        const tempBlockNumber = royaltiesCurrent + step
        const toBlock = tempBlockNumber > currentHeight ? currentHeight : tempBlockNumber;

        console.log(`[Collection] Sync ${royaltiesCurrent} ~ ${toBlock} ...`)

        stickerContractWs.getPastEvents('RoyaltyFee', {
            fromBlock: royaltiesCurrent, toBlock
        }).then(events => {
            events.forEach(async event => {
                let tokenId = event.returnValues._id;
                let fee = event.returnValues._fee;
                
                console.log("RoayltyFee Event: " + JSON.stringify({tokenId, fee}));
                await stickerDBService.updateRoyaltiesOfToken(tokenId, fee, config.stickerContract);
            });
            royaltiesCurrent = toBlock + 1;
        })
    });

    schedule.scheduleJob({start: new Date(now + 3 * 60 * 1000), rule: '20 * * * * *'}, async () => {
        if(orderForSaleJobCurrent > currentHeight) {
            console.log(`[OrderForSale] Sync ${orderForSaleJobCurrent} finished`)
            return;
        }
        const tempBlockNumber = orderForSaleJobCurrent + step
        const toBlock = tempBlockNumber > currentHeight ? currentHeight : tempBlockNumber;

        console.log(`[OrderForSale] Sync ${orderForSaleJobCurrent} ~ ${toBlock} ...`)

        pasarContractWs.getPastEvents('OrderForSale', {
            fromBlock: orderForSaleJobCurrent, toBlock
        }).then(events => {
            events.forEach(async event => {
                let orderInfo = event.returnValues;
                let [result, txInfo] = await jobService.makeBatchRequest([
                    {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
                    {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
                ], web3Rpc)
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
                let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: result.sellerAddr, buyerAddr: result.buyerAddr,
                    royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, timestamp: result.updateTime, gasFee}

                result.sellerAddr = orderInfo._seller;
                result.tokenId = orderInfo._tokenId;
                result.amount = orderInfo._amount;
                result.price = orderInfo._price;
                result.reservePrice = 0;
                result.buyoutPrice = 0;
                result.baseToken = config.stickerContract;
                result.quoteToken = quoteToken;

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
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);                
                await stickerDBService.updateNormalToken(updateTokenInfo);
            })
            orderForSaleJobCurrent = toBlock + 1;
        }).catch(error => {
            console.log(error);
            console.log("[OrderForSale] Sync Ending ...")
        })
    });

    schedule.scheduleJob({start: new Date(now + 5 * 60 * 1000), rule: '30 * * * * *'}, async () => {
        if(priceChangeJobCurrent > currentHeight) {
            console.log(`[OrderFilled] Sync ${priceChangeJobCurrent} finished`)
            return;
        }

        const tempBlockNumber = priceChangeJobCurrent + step
        const toBlock = tempBlockNumber > currentHeight ? currentHeight : tempBlockNumber;

        console.log(`[OrderFilled] Sync ${priceChangeJobCurrent} ~ ${toBlock} ...`)

        pasarContractWs.getPastEvents('OrderPriceChanged', {
            fromBlock: priceChangeJobCurrent, toBlock
        }).then(events => {
            
            events.forEach(async event => {
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
                    royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, timestamp: result.updateTime, gasFee}
                
                result.sellerAddr = orderInfo._seller;
                result.quoteToken = quoteToken;
                result.baseToken = config.stickerContract;

                let updateTokenInfo = {
                    tokenId: orderInfo._tokenId,
                    price: orderInfo._newPrice,
                    baseToken: config.stickerContract
                };

                logger.info(`[OrderFilled] orderEventDetail: ${JSON.stringify(orderEventDetail)}`)
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateNormalToken(updateTokenInfo);
            })

            priceChangeJobCurrent = toBlock + 1;
        }).catch( error => {
            console.log(error);
            console.log("[OrderFilled] Sync Ending ...");
        })
    });

    schedule.scheduleJob({start: new Date(now + 8 * 60 * 1000), rule: '40 * * * * *'}, async () => {
        if(orderFilledJobCurrent > currentHeight) {
            console.log(`[OrderFilled] Sync ${orderFilledJobCurrent} finished`)
            return;
        }

        const tempBlockNumber = orderFilledJobCurrent + step
        const toBlock = tempBlockNumber > currentHeight ? currentHeight : tempBlockNumber;

        console.log(`[OrderFilled] Sync ${orderFilledJobCurrent} ~ ${toBlock} ...`)

        pasarContractWs.getPastEvents('OrderFilled', {
            fromBlock: orderFilledJobCurrent, toBlock
        }).then(events => {
            
            events.forEach(async event => {
                let orderInfo = event.returnValues;

                let [result, txInfo] = await jobService.makeBatchRequest([
                    {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
                    {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
                ], web3Rpc)
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

                let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: result.sellerAddr, buyerAddr: result.buyerAddr,
                    royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, timestamp: result.updateTime, gasFee, baseToken: config.stickerContract}
                
                result.sellerAddr = orderInfo._seller;
                result.buyerAddr = orderInfo._buyer;
                result.price = orderInfo._price;
                result.royaltyOwner = orderInfo._royaltyOwner;
                result.royaltyFee = orderInfo._royalty;
                result.quoteToken = quoteToken;
                result.baseToken = config.stickerContract;

                let updateTokenInfo = {
                    tokenId: orderInfo._tokenId,
                    price: orderInfo._price,
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
                await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateNormalToken(updateTokenInfo);
            })

            orderFilledJobCurrent = toBlock + 1;
        }).catch( error => {
            console.log(error);
            console.log("[OrderFilled] Sync Ending ...");
        })
    });
})
