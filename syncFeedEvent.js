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

let stickerContractWs = new web3Ws.eth.Contract(stickerContractABI, config.stickerContract);
let stickerContract = new web3Rpc.eth.Contract(stickerContractABI, config.stickerContract);

let pasarContractWs = new web3Ws.eth.Contract(pasarContractABI, config.pasarContract);

let transferSingleCurrent = config.stickerContractDeploy,
    royaltiesCurrent = config.stickerContractDeploy,
    orderForSaleJobCurrent = config.pasarContractDeploy,
    priceChangeJobCurrent = config.pasarContractDeploy,
    orderFilledJobCurrent = config.pasarContractDeploy;
    orderCanceledJobCurrent =  config.pasarContractDeploy;

const step = 10000;

web3Rpc.eth.getBlockNumber().then(async currentHeight => {
    console.log(currentHeight);
    let stickerCountContract = parseInt(await stickerContract.methods.totalSupply().call());

    console.log("Total Count: " + stickerCountContract);

    schedule.scheduleJob({start: new Date(now + 60 * 1000), rule: '0 * * * * *'}, async () => {
        console.log(currentHeight);
        console.log(transferSingleCurrent);
        if(transferSingleCurrent > currentHeight) {
            console.log(`[TokenInfo] Sync ${transferSingleCurrent} finished`)
            return;
        }
        const tempBlockNumber = transferSingleCurrent + step
        const toBlock = tempBlockNumber > currentHeight ? currentHeight : tempBlockNumber;

        console.log(`[TokenInfo] Sync ${transferSingleCurrent} ~ ${toBlock} ...`)

        stickerContractWs.getPastEvents('TransferSingle', {
            fromBlock: transferSingleCurrent, toBlock
        }).then(events => {
            events.forEach(async event => {
                let blockNumber = event.blockNumber;
                let eventType = event.event;
                let info = event.returnValues;

                let data = {
                    blockNumber,
                    eventType,
                    info,
                    eventData: event,
                    createdAt: new Date()
                }

                await stickerDBService.saveSyncTemp(data);
            })
            transferSingleCurrent = toBlock + 1;
        }).catch(error => {
            console.log(error);
            console.log("[TokenInfo] Sync Ending ...")
        })
    });

    schedule.scheduleJob({start: new Date(now + 2 * 60 * 1000), rule: '20 * * * * *'}, async () => {
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
                let blockNumber = event.blockNumber;
                let eventType = event.event;
                let info = event.returnValues;

                let data = {
                    blockNumber,
                    eventType,
                    info,
                    eventData: event,
                    createdAt: new Date()
                }

                await stickerDBService.saveSyncTemp(data);
            });
            royaltiesCurrent = toBlock + 1;
        })
    });

    schedule.scheduleJob({start: new Date(now + 3 * 60 * 1000), rule: '30 * * * * *'}, async () => {
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
                let blockNumber = event.blockNumber;
                let eventType = event.event;
                let info = event.returnValues;

                let data = {
                    blockNumber,
                    eventType,
                    info,
                    eventData: event,
                    createdAt: new Date()
                }

                await stickerDBService.saveSyncTemp(data);
            })
            orderForSaleJobCurrent = toBlock + 1;
        }).catch(error => {
            console.log(error);
            console.log("[OrderForSale] Sync Ending ...")
        })
    });

    schedule.scheduleJob({start: new Date(now + 4 * 60 * 1000), rule: '40 * * * * *'}, async () => {
        if(priceChangeJobCurrent > currentHeight) {
            console.log(`[OrderPriceChanged] Sync ${priceChangeJobCurrent} finished`)
            return;
        }

        const tempBlockNumber = priceChangeJobCurrent + step
        const toBlock = tempBlockNumber > currentHeight ? currentHeight : tempBlockNumber;

        console.log(`[OrderPriceChanged] Sync ${priceChangeJobCurrent} ~ ${toBlock} ...`)

        pasarContractWs.getPastEvents('OrderPriceChanged', {
            fromBlock: priceChangeJobCurrent, toBlock
        }).then(events => {
            
            events.forEach(async event => {
                let blockNumber = event.blockNumber;
                let eventType = event.event;
                let info = event.returnValues;

                let data = {
                    blockNumber,
                    eventType,
                    info,
                    eventData: event,
                    createdAt: new Date()
                }

                await stickerDBService.saveSyncTemp(data);
            })

            priceChangeJobCurrent = toBlock + 1;
        }).catch( error => {
            console.log(error);
            console.log("[OrderPriceChanged] Sync Ending ...");
        })
    });

    schedule.scheduleJob({start: new Date(now + 5 * 60 * 1000), rule: '50 * * * * *'}, async () => {
        if(orderCanceledJobCurrent > currentHeight) {
            console.log(`[OrderCanceled] Sync ${orderCanceledJobCurrent} finished`)
            return;
        }

        const tempBlockNumber = orderCanceledJobCurrent + step
        const toBlock = tempBlockNumber > currentHeight ? currentHeight : tempBlockNumber;

        console.log(`[OrderCanceled] Sync ${orderCanceledJobCurrent} ~ ${toBlock} ...`)

        pasarContractWs.getPastEvents('OrderCanceled', {
            fromBlock: orderCanceledJobCurrent, toBlock
        }).then(events => {
            
            events.forEach(async event => {
                let blockNumber = event.blockNumber;
                let eventType = event.event;
                let info = event.returnValues;

                let data = {
                    blockNumber,
                    eventType,
                    info,
                    eventData: event,
                    createdAt: new Date()
                }

                await stickerDBService.saveSyncTemp(data);
            })

            orderCanceledJobCurrent = toBlock + 1;
        }).catch( error => {
            console.log(error);
            console.log("[OrderCanceled] Sync Ending ...");
        })
    });

    schedule.scheduleJob({start: new Date(now + 5 * 60 * 1000), rule: '50 * * * * *'}, async () => {
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
                let blockNumber = event.blockNumber;
                let eventType = event.event;
                let info = event.returnValues;

                let data = {
                    blockNumber,
                    eventType,
                    info,
                    eventData: event,
                    createdAt: new Date()
                }

                await stickerDBService.saveSyncTemp(data);
            })

            orderFilledJobCurrent = toBlock + 1;
        }).catch( error => {
            console.log(error);
            console.log("[OrderFilled] Sync Ending ...");
        })
    });
})