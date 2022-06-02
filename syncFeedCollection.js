const schedule = require('node-schedule');
let Web3 = require('web3');
let config = require('./config');
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

let stickerContractWs = new web3Ws.eth.Contract(stickerContractABI, config.stickerContract);
let stickerContract = new web3Rpc.eth.Contract(stickerContractABI, config.stickerContract);

let pasarContractWs = new web3Ws.eth.Contract(pasarContractABI, config.pasarContract);
let pasarContract = new web3Rpc.eth.Contract(pasarContractABI, config.pasarContract);

let transferSingleCurrent = config.stickerContractDeploy,
    royaltiesCurrent = config.stickerContractDeploy,
    orderForSaleJobCurrent = config.pasarContractDeploy,
    orderForAuctionJobCurrent = config.pasarContractDeploy,
    orderFilledJobCurrent = config.pasarContractDeploy;

const step = 10000;
web3Rpc.eth.getBlockNumber().then(async currentHeight => {
    console.log(currentHeight);
    let stickerCountContract = parseInt(await stickerContract.methods.totalSupply().call());
    let stickerCountContract1 = parseInt(await stickerContract.methods.tokenSupply('9959445386171081097567086144420016528863170236411580689097210615340840644524').call());
    let stickerCountContract2 = parseInt(await stickerContract.methods.tokenSupply('44265190402317202241816486831785618932300113835833157177555403685205569224657').call());

    console.log("Total Count: " + stickerCountContract);
    console.log("Total Count1: " + stickerCountContract1);
    console.log("Total Count2: " + stickerCountContract2);

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

    schedule.scheduleJob({start: new Date(now + 2 * 60 * 1000), rule: '0 * * * * *'}, async () => {
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

    schedule.scheduleJob({start: new Date(now + 3 * 60 * 1000), rule: '0 * * * * *'}, async () => {
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
                let updateTokenInfo = {
                    tokenId: orderInfo._tokenId,
                    blockNumber: event.blockNumber,
                    updateTime: event.updateTime,
                    baseToken: token,
                    v1State: 'listed'
                };
                console.log("OrderForSale Event: " + JSON.stringify(updateTokenInfo))
                await stickerDBService.updateNormalToken(updateTokenInfo);
            })
            orderForSaleJobCurrent = toBlock + 1;
        }).catch(error => {
            console.log(error);
            console.log("[OrderForSale] Sync Ending ...")
        })
    });

    schedule.scheduleJob({start: new Date(now + 4 * 60 * 1000), rule: '0 * * * * *'}, async () => {
        if(orderForAuctionJobCurrent > currentHeight) {
            console.log(`[OrderForAcution] Sync ${orderForAuctionJobCurrent} finished`)
            return;
        }

        const tempBlockNumber = orderForAuctionJobCurrent + step
        const toBlock = tempBlockNumber > currentHeight ? currentHeight : tempBlockNumber;

        console.log(`[OrderForAuction] Sync ${orderForAuctionJobCurrent} ~ ${toBlock} ...`)

        pasarContractWs.getPastEvents('OrderForAuction', {
            fromBlock: orderForAuctionJobCurrent, toBlock
        }).then(events => {
            events.forEach(async event => {
                let orderInfo = event.returnValues;
                let updateTokenInfo = {
                    tokenId: orderInfo._tokenId,
                    blockNumber: event.blockNumber,
                    updateTime: event.updateTime,
                    baseToken: token,
                    v1State: 'listed'
                };
                console.log("OrderForAuction Event: " + JSON.stringify(updateTokenInfo))
                await stickerDBService.updateNormalToken(updateTokenInfo);
            })
            orderForAuctionJobCurrent = toBlock + 1;
        }).catch( error => {
            console.log(error);
            console.log("[OrderForAuction] Sync Ending ...");
        })
    });

    schedule.scheduleJob({start: new Date(now + 6 * 60 * 1000), rule: '0 * * * * *'}, async () => {
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

                let updateTokenInfo = {
                    tokenId: result.tokenId,
                    blockNumber: event.blockNumber,
                    updateTime: result.updateTime,
                    baseToken: token,
                    holder: orderInfo._buyer,
                    v1State: null
                };
                let tokenEventDetail = {
                    tokenId: result.tokenId,
                    blockNumber: event.blockNumber,
                    timestamp: result.updateTime,
                    txHash: event.transactionHash,
                    txIndex: event.transactionIndex,
                    from: orderInfo._seller,
                    to: orderInfo._buyer,
                    value: 1,
                    gasFee,
                    token
                };

                console.log("OrderFilled Event: " + JSON.stringify(updateTokenInfo))

                await stickerDBService.replaceEvent(tokenEventDetail)
                await stickerDBService.updateNormalToken(updateTokenInfo);
            })

            orderFilledJobCurrent = toBlock + 1;
        }).catch( error => {
            console.log(error);
            console.log("[OrderFilled] Sync Ending ...");
        })
    });
})
