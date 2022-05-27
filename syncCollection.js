const schedule = require('node-schedule');
let Web3 = require('web3');
let config = require('./config');
const token1155ABI = require("./contractABI/token1155ABI");
const token721ABI = require("./contractABI/token721ABI");
let pasarContractABI = require('./contractABI/pasarABI');

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

let is721 = false;
let token = '0x020c7303664bc88ae92cE3D380BF361E03B78B81';
let tokenContractWs = new web3Ws.eth.Contract(is721 ? token721ABI : token1155ABI, token);
let tokenContract = new web3Rpc.eth.Contract(is721 ? token721ABI : token1155ABI, token);

let pasarContractWs = new web3Ws.eth.Contract(pasarContractABI, config.pasarContract);
let pasarContract = new web3Rpc.eth.Contract(pasarContractABI, config.pasarContract);

let conllectionJobCurrent = 7744408,
    orderForSaleJobCurrent = config.pasarContractDeploy,
    orderForAuctionJobCurrent = config.pasarContractDeploy,
    orderFilledJobCurrent = config.pasarContractDeploy;

const step = 20000;
web3Rpc.eth.getBlockNumber().then(currentHeight => {
    schedule.scheduleJob({start: new Date(now + 60 * 1000), rule: '0 * * * * *'}, async () => {
        console.log(currentHeight);
        console.log(conllectionJobCurrent);
        if(conllectionJobCurrent > currentHeight) {
            console.log(`[Collection] Sync ${conllectionJobCurrent} finished`)
            return;
        }
        const tempBlockNumber = conllectionJobCurrent + step
        const toBlock = tempBlockNumber > currentHeight ? currentHeight : tempBlockNumber;

        console.log(`[Collection] Sync ${conllectionJobCurrent} ~ ${toBlock} ...`)

        tokenContractWs.getPastEvents('TransferSingle', {
            fromBlock: conllectionJobCurrent, toBlock
        }).then(events => {
            events.forEach(async event => {
                jobService.dealWithUsersToken(event, token, is721, tokenContract, web3Rpc)
            })
            conllectionJobCurrent = toBlock + 1;
        }).catch(error => {
            console.log(error);
            console.log("[Collection] Sync Ending ...")
        })
    });

    schedule.scheduleJob({start: new Date(now + 2 * 60 * 1000), rule: '20 * * * * *'}, async () => {
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

    schedule.scheduleJob({start: new Date(now + 3 * 60 * 1000), rule: '30 * * * * *'}, async () => {
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

    schedule.scheduleJob({start: new Date(now + 6 * 60 * 1000), rule: '50 * * * * *'}, async () => {
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

                await stickerDBService.updateNormalToken(updateTokenInfo);
                await stickerDBService.replaceEvent(tokenEventDetail)
            })

            orderFilledJobCurrent = toBlock + 1;
        }).catch( error => {
            console.log(error);
            console.log("[OrderFilled] Sync Ending ...");
        })
    });
})
