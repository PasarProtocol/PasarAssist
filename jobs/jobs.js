const schedule = require('node-schedule');
let Web3 = require('web3');
let pasarDBService = require('../service/pasarDBService');
let stickerDBService = require('../service/stickerDBService');
let config = require('../config');
let pasarContractABI = require('../contractABI/pasarABI');
let stickerContractABI = require('../contractABI/stickerABI');
let jobService = require('../service/jobService');
const config_test = require("../config_test");
config = config.curNetwork == 'testNet'? config_test : config;

module.exports = {
    run: function() {
        const burnAddress = '0x0000000000000000000000000000000000000000';
        const quoteToken = '0x0000000000000000000000000000000000000000';

        let web3WsProvider = new Web3.providers.WebsocketProvider(config.escWsUrl, {
            //timeout: 30000, // ms
            // Useful for credentialed urls, e.g: ws://username:password@localhost:8546
            //headers: {
            //    authorization: 'Basic username:password'
            //},
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
        let pasarContractWs = new web3Ws.eth.Contract(pasarContractABI, config.pasarContract);
        let stickerContractWs = new web3Ws.eth.Contract(stickerContractABI, config.stickerContract);

        let web3Rpc = new Web3(config.escRpcUrl);
        let pasarContract = new web3Rpc.eth.Contract(pasarContractABI, config.pasarContract);
        let stickerContract = new web3Rpc.eth.Contract(stickerContractABI, config.stickerContract);

        let isGetForOrderPriceChangedJobRun = false;
        let isGetForOrderCancelledJobRun = false;
        let isGetForOrderFilledJobRun = false;
        let isGetTokenInfoJobRun = false;
        let isGetApprovalRun = false;
        let now = Date.now();

        let recipients = [];
        recipients.push('lifayi2008@163.com');
        async function dealWithNewToken(blockNumber,tokenId) {
            try {
                let [result, extraInfo] = await jobService.makeBatchRequest([
                    {method: stickerContract.methods.tokenInfo(tokenId).call, params: {}},
                    {method: stickerContract.methods.tokenExtraInfo(tokenId).call, params: {}},
                ], web3Rpc);
    
                let token = {blockNumber, tokenIndex: result.tokenIndex, tokenId, quantity: result.tokenSupply,
                    royalties:result.royaltyFee, royaltyOwner: result.royaltyOwner, holder: result.royaltyOwner,
                    createTime: result.createTime, updateTime: result.updateTime, marketPlace: config.elaChain}
        
                token.tokenIdHex = '0x' + BigInt(tokenId).toString(16);
                let data = await jobService.getInfoByIpfsUri(result.tokenUri);
                token.tokenJsonVersion = data.version ? data.version : 1;
                token.type = data.type ? data.type : 'image';
                token.name = data.name ? data.name : '';
                token.description = data.description ? data.description : '';
                token.properties = data.properties ? data.properties : '';
                token.baseToken = config.stickerContract;
    
                if(token.type === 'feeds-channel') {
                    token.tippingAddress = data.tippingAddress;
                    token.entry = data.entry;
                    token.data = data.avatar;
                    token.avatar = data.avatar;
                }else if(token.type === 'video' || data.version == "2") {
                    token.data = data.data;
                } else {
                    token.thumbnail = data.thumbnail;
                    token.asset = data.image;
                    token.kind = data.kind;
                    token.size = data.size;
                }
        
                token.adult = data.adult ? data.adult : false;
                token.price = 0;
                token.marketTime = result.createTime;
                token.status = "Not on sale";
                token.endTime = null;
                token.orderId = null;
                await stickerDBService.replaceToken(token);
            } catch (e) {
                logger.info(`[TokenInfo] Sync error at ${blockNumber} ${tokenId}`);
                logger.info(e);
            }
        }

        let orderPriceChangedJobId = schedule.scheduleJob(new Date(now + 60 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderPriceChanged', config.elaChain, true);
            isGetForOrderPriceChangedJobRun = true;

            pasarContractWs.events.OrderPriceChanged({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                isGetForOrderPriceChangedJobRun = false;
                logger.info(error);
                logger.info("[OrderPriceChanged] Sync Ending ...");
            }).on("data", async function (event) {
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
                    baseToken: config.stickerContract, quoteToken: quoteToken, v1Event: true, marketPlace: config.elaChain}
                
                let resultData = {orderType: result.orderType, orderState: result.orderState,
                    tokenId: orderInfo._tokenId, amount: result.amount, price:orderInfo._newPrice, startTime: result.startTime, endTime: result.endTime,
                    sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr, bids: result.bids, lastBidder: result.lastBidder,
                    lastBid: result.lastBid, filled: result.filled, royaltyOwner: result.royaltyOwner, royaltyFee: result.royaltyFee,
                    baseToken: config.stickerContract, amount: result.amount, quoteToken: quoteToken, buyoutPrice: 0, reservePrice: 0,
                    minPrice: result.minPrice, createTime: result.createTime, updateTime: result.updateTime, marketPlace: config.elaChain}

                let updateTokenInfo = {
                    tokenId: orderInfo._tokenId,
                    price: orderInfo._newPrice,
                    baseToken: config.stickerContract,
                    marketPlace: config.elaChain,
                };

                logger.info(`[OrderPriceChanged] orderEventDetail: ${JSON.stringify(orderEventDetail)}`)
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(resultData, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateNormalToken(updateTokenInfo);
            })
        });

        let orderFilledJobId = schedule.scheduleJob(new Date(now + 80 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderFilled', config.elaChain, true);
            // if(isGetForOrderFilledJobRun == false) {
            //     //initial state
            //     stickerDBService.removePasarOrderByHeight(lastHeight, 'OrderFilled');
            // } else {
            //     lastHeight += 1;
            // }
            isGetForOrderFilledJobRun = true;

            logger.info(`[OrderFilled] Sync start from height: ${lastHeight + 1}`);

            pasarContractWs.events.OrderFilled({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                isGetForOrderFilledJobRun = false;
                logger.info(error);
                logger.info("[OrderFilled] Sync Ending ...");
            }).on("data", async function (event) {
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
                    baseToken: config.stickerContract, quoteToken: quoteToken, v1Event: true, marketPlace: config.elaChain}
                
                let resultData = {orderType: result.orderType, orderState: result.orderState,
                    tokenId: result.tokenId, amount: result.amount, price:orderInfo._price, startTime: result.startTime, endTime: result.endTime,
                    sellerAddr: orderInfo._seller, buyerAddr: orderInfo._buyer, bids: result.bids, lastBidder: result.lastBidder,
                    lastBid: result.lastBid, filled: result.filled, royaltyOwner: orderInfo._royaltyOwner, royaltyFee: orderInfo._royalty,
                    baseToken: config.stickerContract, amount: result.amount, quoteToken: quoteToken, buyoutPrice: 0, reservePrice: 0,
                    minPrice: result.minPrice, createTime: result.createTime, updateTime: result.updateTime, marketPlace: config.elaChain}

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
                    marketPlace: config.elaChain
                };

                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(resultData, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateNormalToken(updateTokenInfo);
            })
        });

        let orderCanceledJobId = schedule.scheduleJob(new Date(now + 100 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderCanceled', config.elaChain, true);
            // if(isGetForOrderCancelledJobRun == false) {
            //     //initial state
            //     stickerDBService.removePasarOrderByHeight(lastHeight, 'OrderCanceled');
            // } else {
            //     lastHeight += 1;
            // }
            isGetForOrderCancelledJobRun = true;

            logger.info(`[OrderCanceled] Sync start from height: ${lastHeight + 1}`);

            pasarContractWs.events.OrderCanceled({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                isGetForOrderCancelledJobRun = false;
                logger.info(error);
                logger.info("[OrderCanceled] Sync Ending ...");
            }).on("data", async function (event) {
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
                    baseToken: config.stickerContract, quoteToken: quoteToken, v1Event: true, marketPlace: config.elaChain}
                
                let resultData = {orderType: result.orderType, orderState: result.orderState,
                    tokenId: result.tokenId, amount: result.amount, price:result.price, startTime: result.startTime, endTime: result.endTime,
                    sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr, bids: result.bids, lastBidder: result.lastBidder,
                    lastBid: result.lastBid, filled: result.filled, royaltyOwner: result.royaltyOwner, royaltyFee: result.royaltyFee,
                    baseToken: config.stickerContract, amount: result.amount, quoteToken: quoteToken, buyoutPrice: 0, reservePrice: 0,
                    minPrice: result.minPrice, createTime: result.createTime, updateTime: result.updateTime, marketPlace: config.elaChain}

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
                    marketPlace: config.elaChain
                };

                logger.info(`[OrderCanceled] orderEventDetail: ${JSON.stringify(orderEventDetail)}`)
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(resultData, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateNormalToken(updateTokenInfo);
            })
        });



        let approval  = schedule.scheduleJob(new Date(now + 90 * 1000), async()=> {
            let lastHeight = await stickerDBService.getLastApprovalSyncHeight();
            if(isGetApprovalRun == false) {
                //initial state
                stickerDBService.removeApprovalByHeight(lastHeight);
            } else {
                lastHeight += 1;
            }
            isGetApprovalRun = true;
            logger.info(`[approval] Sync Starting ... from block ${lastHeight + 1}`)
            stickerContractWs.events.ApprovalForAll({
                fromBlock: lastHeight
            }).on("error", function(error) {
                logger.info(error);
                logger.info("[approval] Sync Ending ...");
                isGetApprovalRun = false;
            }).on("data", async function (event) {

                let [blockInfo, txInfo] = await jobService.makeBatchRequest([
                    {method: web3Rpc.eth.getBlock, params: event.blockNumber},
                    {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
                ], web3Rpc)
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
                let timestamp = blockInfo.timestamp;

                await stickerDBService.addAprovalForAllEvent(event, gasFee, timestamp);
            });
        });

        let tokenInfoSyncJobId = schedule.scheduleJob(new Date(now + 10 * 1000), async () => {
            let lastHeight = await stickerDBService.getLastStickerSyncHeight(config.stickerContract);
            if(isGetTokenInfoJobRun == false) {
                //initial state
                stickerDBService.removeTokenInfoByHeight(lastHeight);
            } else {
                lastHeight += 1;
            }
            isGetTokenInfoJobRun = true;
            logger.info(`[TokenInfo] Sync Starting ... from block ${lastHeight + 1}`)

            stickerContractWs.events.TransferSingle({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[TokenInfo] Sync Ending ...");
                isGetTokenInfoJobRun = false
            }).on("data", async function (event) {
                let blockNumber = event.blockNumber;
                let txHash = event.transactionHash;
                let txIndex = event.transactionIndex;
                let from = event.returnValues._from;
                let to = event.returnValues._to;

                //After contract upgrade, this job just deal Mint and Burn event
                // if(from !== burnAddress && to !== burnAddress && blockNumber > config.upgradeBlock) {
                //     return;
                // }

                let tokenId = event.returnValues._id;
                let value = event.returnValues._value;

                let [blockInfo, txInfo] = await jobService.makeBatchRequest([
                    {method: web3Rpc.eth.getBlock, params: blockNumber},
                    {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
                ], web3Rpc)
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
                let timestamp = blockInfo.timestamp;

                let transferEvent = {tokenId, blockNumber, timestamp,txHash, txIndex, from, to, value, gasFee, token: config.stickerContract, marketPlace: config.elaChain};
                logger.info(`[TokenInfo] tokenEvent: ${JSON.stringify(transferEvent)}`)

                if(to === burnAddress) {
                    await stickerDBService.replaceEvent(transferEvent);
                    await stickerDBService.burnToken(tokenId, config.stickerContract, config.elaChain);
                } else if(from === burnAddress) {
                    await stickerDBService.replaceEvent(transferEvent);
                    await dealWithNewToken(blockNumber, tokenId)
                } else if(stickerDBService.checkAddress(to) && stickerDBService.checkAddress(from)) {
                    await stickerDBService.replaceEvent(transferEvent);
                    await stickerDBService.updateToken(tokenId, to, timestamp, blockNumber, config.stickerContract, config.elaChain);
                }
            })
        });

        schedule.scheduleJob({start: new Date(now + 61 * 1000), rule: '0 */2 * * * *'}, () => {
            let now = Date.now();
            if(!isGetForOrderPriceChangedJobRun)
                orderPriceChangedJobId.reschedule(new Date(now + 20 * 1000));
            if(!isGetForOrderFilledJobRun)
                orderFilledJobId.reschedule(new Date(now + 30 * 1000));
            if(!isGetForOrderCancelledJobRun)
                orderCanceledJobId.reschedule(new Date(now + 40 * 1000));
            if(!isGetTokenInfoJobRun) {
                tokenInfoSyncJobId.reschedule(new Date(now + 50 * 1000))
            }
            if(!isGetApprovalRun)
                approval.reschedule(new Date(now + 70 * 1000))
        });
    }
}
