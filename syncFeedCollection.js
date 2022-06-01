const schedule = require('node-schedule');
let Web3 = require('web3');
let config = require('./config');
let stickerContractABI = require('./contractABI/stickerABI');
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

let token = '0x020c7303664bc88ae92cE3D380BF361E03B78B81';
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

const step = 20000;
web3Rpc.eth.getBlockNumber().then(currentHeight => {
    console.log(currentHeight);

    async function dealWithNewToken(blockNumber,tokenId) {
        try {
            let [result, extraInfo] = await jobService.makeBatchRequest([
                {method: stickerContract.methods.tokenInfo(tokenId).call, params: {}},
                {method: stickerContract.methods.tokenExtraInfo(tokenId).call, params: {}},
            ], web3Rpc);

            let token = {blockNumber, tokenIndex: result.tokenIndex, tokenId, quantity: result.tokenSupply,
                royalties:result.royaltyFee, royaltyOwner: result.royaltyOwner, holder: result.royaltyOwner,
                createTime: result.createTime, updateTime: result.updateTime}

            token.tokenIdHex = '0x' + BigInt(tokenId).toString(16);
            let data = await jobService.getInfoByIpfsUri(result.tokenUri);
            token.tokenJsonVersion = data.version;
            token.type = data.type;
            token.name = data.name;
            token.description = data.description;
            token.properties = data.properties;
            token.baseToken = config.stickerContract;

            if(extraInfo.didUri !== '') {
                token.didUri = extraInfo.didUri;
                token.did = await jobService.getInfoByIpfsUri(extraInfo.didUri);
                await pasarDBService.replaceDid({address: result.royaltyOwner, did: token.did});
                if(token.did.KYCedProof != undefined) {
                    await authService.verifyKyc(token.did.KYCedProof, token.did.did. result.royaltyOwner);
                }
            }

            if(token.type === 'feeds-channel') {
                token.tippingAddress = data.tippingAddress;
                token.entry = data.entry;
                token.avatar = data.avatar;
                logger.info(`[TokenInfo] New token info: ${JSON.stringify(token)}`)
                await stickerDBService.replaceGalleriaToken(token);
                return;
            }

            if(token.type === 'video' || data.version === "2") {
                token.data = data.data;
            } else {
                token.thumbnail = data.thumbnail;
                token.asset = data.image;
                token.kind = data.kind;
                token.size = data.size;
            }

            token.adult = data.adult ? data.adult : false;
            token.price = 0;
            token.marketTime = null;
            token.status = "Not on sale";
            token.endTime = null;
            token.orderId = null;
            logger.info(`[TokenInfo] New token info: ${JSON.stringify(token)}`)
            await stickerDBService.replaceToken(token);
        } catch (e) {
            logger.info(`[TokenInfo] Sync error at ${blockNumber} ${tokenId}`);
            logger.info(e);
        }
    }

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
                    await dealWithNewToken(blockNumber, tokenId)
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
