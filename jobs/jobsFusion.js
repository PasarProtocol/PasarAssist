/**
    Gets and processes the events on fusion network
*/
const schedule = require('node-schedule');
let Web3 = require('web3');
let pasarDBService = require('../service/pasarDBService');
let stickerDBService = require('../service/stickerDBService');
let indexDBService = require('../service/indexDBService');
let config = require('../config');
let pasarContractABI = require('../contractABI/pasarV2ABI');
let pasarRegisterABI = require('../contractABI/pasarRegisterABI');
let token721ABI = require('../contractABI/token721ABI');
let token1155ABI = require('../contractABI/token1155ABI');
let jobService = require('../service/jobService');
let authService  = require('../service/authService')
let sendMail = require('../send_mail');
const config_test = require("../config_test");
config = config.curNetwork == 'testNet'? config_test : config;

module.exports = {
    run: function() {
        logger.info("========= Pasar Assist Fusion Service start =============")

        const burnAddress = '0x0000000000000000000000000000000000000000';

        let web3WsProvider = new Web3.providers.WebsocketProvider(config.fusion.wsUrl, {
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
        let pasarContractWs = new web3Ws.eth.Contract(pasarContractABI, config.fusion.pasarContract);
        let pasarRegisterWs = new web3Ws.eth.Contract(pasarRegisterABI, config.fusion.pasarRegisterContract)

        let web3Rpc = new Web3(config.fusion.rpcUrl);
        let pasarContract = new web3Rpc.eth.Contract(pasarContractABI, config.fusion.pasarContract);

        let isGetForSaleOrderJobRun = false;
        let isGetForOrderPriceChangedJobRun = false;
        let isGetForOrderCancelledJobRun = false;
        let isGetForOrderFilledJobRun = false;
        let isGetOrderForAuctionJobRun = false;
        let isGetOrderBidJobRun = false;
        let isOrderDidURIJobRun = false;
        let isTokenRegisteredJobRun = false;
        let isRoyaltyChangedJobRun = false;
        let isTokenInfoUpdatedJobRun = false;
        let isSyncCollectionEventJobRun = false;
        let now = Date.now();
        
        let recipients = [];
        recipients.push('lifayi2008@163.com');

        let orderDidURIJobId = schedule.scheduleJob(new Date(now + 40 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderDIDURI', config.fusion.chainType);

            isOrderDidURIJobRun = true;

            logger.info(`[OrderDidURI2] Sync start from height: ${lastHeight + 1}`);

            pasarContractWs.events.OrderDIDURI({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[OrderDidURI2] Sync Ending ...")
                isOrderDidURIJobRun = false;

            }).on("data", async function (event) {
                let orderInfo = event.returnValues;

                let updateResult = {};
                updateResult.orderId = orderInfo._orderId;
                updateResult.sellerAddr = orderInfo._seller;
                updateResult.buyerAddr = orderInfo._buyer;
                updateResult.event = event.event;
                updateResult.blockNumber = event.blockNumber;
                updateResult.tHash = event.transactionHash;
                updateResult.blockHash = event.blockHash;
                updateResult.v1Event = false;
                updateResult.marketPlace = config.fusion.chainType;

                await pasarDBService.insertOrderEvent(updateResult);

                let token = {orderId: orderInfo._orderId}
                token.didUri = orderInfo._sellerUri;
                token.did = await jobService.getInfoByIpfsUri(orderInfo._sellerUri);
                await pasarDBService.updateDid({address: orderInfo._seller, did: token.did});
                if(token.did.KYCedProof != undefined) {
                    await authService.verifyKyc(token.did.KYCedProof, token.did.did, orderInfo._seller);
                }  
            })
        });

        let orderForSaleJobId = schedule.scheduleJob(new Date(now + 40 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderForSale', config.fusion.chainType);
            // if(isGetForSaleOrderJobRun == false) {
            //     //initial state
            //     stickerDBService.removePasarOrderByHeight(lastHeight, 'OrderForSale');
            // } else {
            //     lastHeight += 1;
            // }
            isGetForSaleOrderJobRun = true;

            logger.info(`[OrderForSale2] Sync start from height: ${lastHeight + 1}`);

            pasarContractWs.events.OrderForSale({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[OrderForSale2] Sync Ending ...")
                isGetForSaleOrderJobRun = false;
            }).on("data", async function (event) {
                let orderInfo = event.returnValues;

                let [result, txInfo] = await jobService.makeBatchRequest([
                    {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
                    {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
                ], web3Rpc)
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
                let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr,
                    royaltyFee: result.royaltyFee, tokenId: orderInfo._tokenId, quoteToken:orderInfo._quoteToken, baseToken: orderInfo._baseToken,
                    price: result.price, timestamp: result.updateTime, gasFee, marketPlace: config.fusion.chainType}

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
                updateResult.marketPlace = config.fusion.chainType;
        
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(updateResult, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateTokenInfo(orderInfo._tokenId, orderEventDetail.price, orderEventDetail.orderId, orderInfo._startTime, updateResult.endTime, 'MarketSale', updateResult.sellerAddr, event.blockNumber, orderInfo._quoteToken, orderInfo._baseToken, config.fusion.chainType);
                await stickerDBService.updateTokenStatus(event.event, result.tokenId, orderInfo._baseToken, config.fusion.chainType)
            })
        });

        let orderPriceChangedJobId = schedule.scheduleJob(new Date(now + 60 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderPriceChanged', config.fusion.chainType);
            // if(isGetForOrderPriceChangedJobRun == false) {
            //     //initial state
            //     stickerDBService.removePasarOrderByHeight(lastHeight, 'OrderPriceChanged');
            // } else {
            //     lastHeight += 1;
            // }
            isGetForOrderPriceChangedJobRun = true;

            logger.info(`[OrderPriceChanged2] Sync start from height: ${lastHeight + 1}`);

            pasarContractWs.events.OrderPriceChanged({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                isGetForOrderPriceChangedJobRun = false;
                logger.info(error);
                logger.info("[OrderPriceChanged2] Sync Ending ...");
            }).on("data", async function (event) {
                let orderInfo = event.returnValues;
                let [result, txInfo] = await jobService.makeBatchRequest([
                    {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
                    {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
                ], web3Rpc)
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

                let token = await stickerDBService.getTokenInfo(result.tokenId, orderInfo._orderId, config.fusion.chainType);

                let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id,
                    data: {oldPrice: orderInfo._oldPrice, newPrice: orderInfo._newPrice, oldReservePrice: orderInfo._oldReservePrice, newReservePrice: orderInfo._newReservePrice,
                    oldBuyoutPrice: orderInfo._oldBuyoutPrice, newBuyoutPrice: orderInfo._newBuyoutPrice, oldQuoteToken: orderInfo._oldQuoteToken, newQuoteToken: orderInfo._newQuoteToken},
                    sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr, marketPlace: config.fusion.chainType,
                    royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, quoteToken:orderInfo._newQuoteToken, baseToken: token.baseToken,timestamp: result.updateTime, gasFee}

                let updateResult = {...result};

                updateResult.price = orderInfo._newPrice;
                updateResult.reservePrice = orderInfo._newReservePrice;
                updateResult.buyoutPrice = orderInfo._newBuyoutPrice;
                updateResult.price = orderInfo._newPrice;
                updateResult.quoteToken = orderInfo._newQuoteToken;
                updateResult.marketPlace = config.fusion.chainType;
            
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(updateResult, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateTokenInfo(updateResult.tokenId, orderEventDetail.price, orderEventDetail.orderId, null, null, null, updateResult.sellerAddr, event.blockNumber, orderEventDetail.quoteToken, token.baseToken, config.fusion.chainType);
            })
        });

        let orderFilledJobId = schedule.scheduleJob(new Date(now + 80 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderFilled', config.fusion.chainType);
            // if(isGetForOrderFilledJobRun == false) {
            //     //initial state
            //     stickerDBService.removePasarOrderByHeight(lastHeight, 'OrderFilled');
            // } else {
            //     lastHeight += 1;
            // }
            isGetForOrderFilledJobRun = true;

            logger.info(`[OrderFilled2] Sync start from height: ${lastHeight + 1}`);

            pasarContractWs.events.OrderFilled({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                isGetForOrderFilledJobRun = false;
                logger.info(error);
                logger.info("[OrderFilled2] Sync Ending ...");
            }).on("data", async function (event) {
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
                    baseToken: orderInfo._baseToken, price: orderInfo._price, timestamp: result.updateTime, gasFee, marketPlace: config.fusion.chainType}

                let orderEventFeeDetail = {orderId: orderInfo._orderId, blockNumber: event.blockNumber, txHash: event.transactionHash,
                    txIndex: event.transactionIndex, platformAddr: orderInfo._platformAddress, platformFee: orderInfo._platformFee, marketPlace: config.fusion.chainType};

                let updateResult = {...result};
                updateResult.sellerAddr = orderInfo._seller;
                updateResult.buyerAddr = orderInfo._buyer;
                updateResult.amount = orderInfo._amount;
                updateResult.price = orderInfo._price;
                updateResult.royaltyOwner = orderInfo._royaltyOwner;
                updateResult.royaltyFee = orderInfo._royaltyFee;
                updateResult.quoteToken = orderInfo._quoteToken;
                updateResult.baseToken = orderInfo._baseToken;
                updateResult.marketPlace = config.fusion.chainType;
            
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await pasarDBService.insertOrderPlatformFeeEvent(orderEventFeeDetail);
                await stickerDBService.updateOrder(updateResult, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateTokenInfo(updateResult.tokenId, orderEventDetail.price, null, updateResult.updateTime, null, 'Not on sale', updateResult.buyerAddr, event.blockNumber, orderInfo._quoteToken, orderInfo._baseToken, config.fusion.chainType);
                await stickerDBService.updateTokenStatus(event.event, result.tokenId, orderInfo._baseToken, config.fusion.chainType);
            })
        });

        let orderCanceledJobId = schedule.scheduleJob(new Date(now + 100 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderCanceled', config.fusion.chainType);
            // if(isGetForOrderCancelledJobRun == false) {
            //     //initial state
            //     stickerDBService.removePasarOrderByHeight(lastHeight, 'OrderCanceled');
            // } else {
            //     lastHeight += 1;
            // }
            isGetForOrderCancelledJobRun = true;

            logger.info(`[OrderCanceled2] Sync start from height: ${lastHeight + 1}`);

            pasarContractWs.events.OrderCanceled({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                isGetForOrderCancelledJobRun = false;
                logger.info(error);
                logger.info("[OrderCanceled2] Sync Ending ...");
            }).on("data", async function (event) {
                let orderInfo = event.returnValues;
                let [result, txInfo] = await jobService.makeBatchRequest([
                    {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
                    {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
                ], web3Rpc)

                let token = await stickerDBService.getTokenInfo(result.tokenId, orderInfo._orderId, config.fusion.chainType);
                
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
                let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr,
                    royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, timestamp: result.updateTime, gasFee,
                    baseToken: token.baseToken, quoteToken: token.quoteToken, marketPlace: config.fusion.chainType};

                let updateResult = {...result};
                updateResult.sellerAddr = orderInfo._seller
                updateResult.marketPlace = config.fusion.chainType;
            
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(updateResult, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateTokenInfo(updateResult.tokenId, orderEventDetail.price, orderInfo._orderId, updateResult.updateTime, 0, 'Not on sale', updateResult.sellerAddr, event.blockNumber, token.quoteToken, token.baseToken, config.fusion.chainType);
                await stickerDBService.updateTokenStatus(event.event, result.tokenId, token.baseToken, config.fusion.chainType)
            })
        });

        let orderForAuctionJobId = schedule.scheduleJob(new Date(now + 100 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderForAuction', config.fusion.chainType);
            // if(isGetOrderForAuctionJobRun == false) {
            //     //initial state
            //     stickerDBService.removePasarOrderByHeight(lastHeight, 'OrderForAuction');
            // } else {
            //     lastHeight += 1;
            // }
            isGetOrderForAuctionJobRun = true;

            logger.info(`[OrderForAuction2] Sync start from height: ${lastHeight + 1}`);

            pasarContractWs.events.OrderForAuction({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[OrderForAuction2] Sync Ending ...")
                isGetOrderForAuctionJobRun = false;
            }).on("data", async function (event) {
                let orderInfo = event.returnValues;
                console.log('OrderForAuction event data is ', event)

                let [result, txInfo] = await jobService.makeBatchRequest([
                    {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
                    {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
                ], web3Rpc)
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

                let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr,
                    royaltyFee: result.royaltyFee, tokenId: orderInfo._tokenId, baseToken: orderInfo._baseToken, amount: orderInfo._amount,
                    quoteToken:orderInfo._quoteToken, reservePrice: orderInfo._reservePrice, marketPlace: config.fusion.chainType,
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
                updateResult.marketPlace = config.fusion.chainType;
            
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(updateResult, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateTokenInfo(updateResult.tokenId, orderEventDetail.price, orderEventDetail.orderId, orderInfo._startTime, orderInfo._endTime, 'MarketAuction', updateResult.sellerAddr, event.blockNumber, orderInfo._quoteToken, orderInfo._baseToken, config.fusion.chainType);
                await stickerDBService.updateTokenStatus(event.event, orderInfo._tokenId, orderInfo._baseToken, config.fusion.chainType)
            })
        });

        let orderBidJobId = schedule.scheduleJob(new Date(now + 110 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderBid', config.fusion.chainType);
            // if(isGetOrderBidJobRun == false) {
            //     //initial state
            //     stickerDBService.removePasarOrderByHeight(lastHeight, 'OrderBid');
            // } else {
            //     lastHeight += 1;
            // }
            isGetOrderBidJobRun = true;

            logger.info(`[OrderBid2] Sync start from height: ${lastHeight + 1}`);

            pasarContractWs.events.OrderBid({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[OrderBid2] Sync Ending ...")
                isGetOrderBidJobRun = false;
            }).on("data", async function (event) {
                let orderInfo = event.returnValues;

                let [result, txInfo] = await jobService.makeBatchRequest([
                    {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
                    {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
                ], web3Rpc)
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

                let token = await stickerDBService.getTokenInfo(result.tokenId, orderInfo._orderId, config.fusion.chainType)

                let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: orderInfo._buyer,
                    royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: orderInfo._price, marketPlace: config.fusion.chainType,
                    quoteToken: token.quoteToken, baseToken: token.baseToken, timestamp: result.updateTime, gasFee}
                
                let updateResult = {...result}
                updateResult.marketPlace = config.fusion.chainType;
            
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(updateResult, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateTokenInfo(updateResult.tokenId, orderInfo._price, orderEventDetail.orderId, null, updateResult.endTime, 'MarketBid', null, event.blockNumber, token.quoteToken, token.baseToken, config.fusion.chainType);
            })
        });

        let tokenRegisteredJobId = schedule.scheduleJob(new Date(now + 40 * 1000), async () => {
            let lastHeight = await stickerDBService.getLastCollectionEventSyncHeight('TokenRegistered', config.fusion.chainType);

            isTokenRegisteredJobRun = true;

            logger.info(`[tokenRegistered] Sync start from height: ${config.fusion.pasarRegisterContractDeploy}`);

            pasarRegisterWs.events.TokenRegistered({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[tokenRegistered] Sync Ending ...")
                isTokenRegisteredJobRun = false;
            }).on("data", async function (event) {
                let registeredTokenInfo = event.returnValues;

                let registeredTokenDetail = {token: registeredTokenInfo._token, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id, marketPlace: config.fusion.chainType}

                let tokenContract = new web3Rpc.eth.Contract(token721ABI, registeredTokenInfo._token);

                let [is721, is1155, symbol] = await jobService.makeBatchRequest([
                    {method: tokenContract.methods.supportsInterface('0x80ac58cd').call, params: {}},
                    {method: tokenContract.methods.supportsInterface('0xd9b67a26').call, params: {}},
                    {method: tokenContract.methods.symbol().call, params: {}}
                ], web3Rpc)

                let data = await jobService.getInfoByIpfsUri(registeredTokenInfo._uri)
                
                let check721 = is721 ? true : false;

                let creator = data && data.creator ? data.creator : null;
                
                if(creator) {
                    await pasarDBService.updateDid({address: registeredTokenInfo._owner, did: creator});
                }

                await stickerDBService.collectionEvent(registeredTokenDetail);
                await stickerDBService.registerCollection(registeredTokenInfo._token, registeredTokenInfo._owner,
                    registeredTokenInfo._name, registeredTokenInfo._uri, symbol, check721, event.blockNumber, data, config.fusion.chainType);

                if(!isSyncCollectionEventJobRun) {
                    isSyncCollectionEventJobRun = true;
                    await jobService.startupUsersContractEvents(web3Rpc, config.fusion.chainType);
                    isSyncCollectionEventJobRun = false;
                }
                
            })
        });

        let royaltyChangedJobRun = schedule.scheduleJob(new Date(now + 40 * 1000), async () => {
            let lastHeight = await stickerDBService.getLastCollectionEventSyncHeight('TokenRoyaltyChanged', config.fusion.chainType);

            isRoyaltyChangedJobRun = true;

            logger.info(`[TokenRoyaltyChanged3] Sync start from height: ${config.fusion.pasarContractDeploy}`);

            pasarRegisterWs.events.TokenRoyaltyChanged({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[TokenRoyaltyChanged] Sync Ending ...")
                isRoyaltyChangedJobRun = false;

            }).on("data", async function (event) {
                let orderInfo = event.returnValues;

                let orderEventDetail = {token: orderInfo._token, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id, marketPlace: config.fusion.chainType}

                await stickerDBService.collectionEvent(orderEventDetail);
                await stickerDBService.changeCollectionRoyalty(orderInfo._token, orderInfo._royaltyOwners, orderInfo._royaltyRates, config.fusion.chainType);
            })
        });

        let tokenInfoUpdatedJobRun = schedule.scheduleJob(new Date(now + 40 * 1000), async () => {
            let lastHeight = await stickerDBService.getLastCollectionEventSyncHeight('TokenInfoUpdated', config.fusion.chainType);

            isTokenInfoUpdatedJobRun = true;

            logger.info(`[TokenInfoUpdated] Sync start from height: ${config.fusion.pasarRegisterContractDeploy}`);

            pasarRegisterWs.events.TokenInfoUpdated({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[tokenRegistered] Sync Ending ...")
                isTokenInfoUpdatedJobRun = false;

            }).on("data", async function (event) {
                let updatedTokenInfo = event.returnValues;

                let updatedTokenDetail = {token: updatedTokenInfo._token, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id, marketPlace: config.fusion.chainType}

                await stickerDBService.collectionEvent(updatedTokenDetail);
                await stickerDBService.updateCollection(updatedTokenInfo._token, updatedTokenInfo._name, updatedTokenInfo._uri, event.blockNumber, config.fusion.chainType);
            })
        });

        schedule.scheduleJob({start: new Date(now + 61 * 1000), rule: '0 */2 * * * *'}, () => {
            let now = Date.now();

            if(!isGetForSaleOrderJobRun) {
                orderForSaleJobId.reschedule(new Date(now + 10 * 1000));
            }
            if(!isGetForOrderPriceChangedJobRun)
                orderPriceChangedJobId.reschedule(new Date(now + 20 * 1000));
            if(!isGetForOrderFilledJobRun)
                orderFilledJobId.reschedule(new Date(now + 30 * 1000));
            if(!isGetForOrderCancelledJobRun)
                orderCanceledJobId.reschedule(new Date(now + 40 * 1000));
            if(!isGetOrderForAuctionJobRun)
                orderForAuctionJobId.reschedule(new Date(now + 100 * 1000))
            if(!isGetOrderBidJobRun)
                orderBidJobId.reschedule(new Date(now + 110 * 1000))
            if(!isOrderDidURIJobRun)
                orderDidURIJobId.reschedule(new Date(now + 110 * 1000))
            if(!isTokenRegisteredJobRun)
                tokenRegisteredJobId.reschedule(new Date(now + 60 * 1000))
            if(!isRoyaltyChangedJobRun)
                royaltyChangedJobRun.reschedule(new Date(now + 60 * 1000))
            if(!isTokenInfoUpdatedJobRun)
                tokenInfoUpdatedJobRun.reschedule(new Date(now + 60 * 1000))
        });

        /**
         *  Pasar order volume sync check
         */
        schedule.scheduleJob({start: new Date(now + 60 * 1000), rule: '*/2 * * * *'}, async () => {
            let orderCount = await pasarDBService.pasarOrderCount();
            let orderCountContract = parseInt(await pasarContract.methods.getOrderCount().call());
            logger.info(`[Order Count Check] DbCount: ${orderCount}   ContractCount: ${orderCountContract}`)
            if(orderCountContract !== orderCount) {
                await sendMail(`Pasar Order Sync [${config.serviceName}]`,
                    `pasar assist sync service sync failed!\nDbCount: ${orderCount}   ContractCount: ${orderCountContract}`,
                    recipients.join());
            }
        });

        /**
         *  Pasar order event volume check
         */
        let pasarOrderEventCheckBlockNumber = config.fusion.pasarContractDeploy;
        schedule.scheduleJob({start: new Date(now + 60 * 1000), rule: '*/2 * * * *'}, async () => {
            let nowBlock = await web3Rpc.eth.getBlockNumber();
            let fromBlock = pasarOrderEventCheckBlockNumber;
            let tempBlock = pasarOrderEventCheckBlockNumber + 20000
            let toBlock =  tempBlock > nowBlock ? nowBlock : tempBlock;
            let orderCount = await pasarDBService.pasarOrderEventCount(fromBlock, toBlock);

            let orderForSaleEvent = await pasarContract.getPastEvents('OrderForSale', {fromBlock, toBlock});
            let orderFilledEvent = await pasarContract.getPastEvents('OrderFilled', {fromBlock, toBlock});
            let orderCanceled = await pasarContract.getPastEvents('OrderCanceled', {fromBlock, toBlock});
            let orderPriceChanged = await pasarContract.getPastEvents('OrderPriceChanged', {fromBlock, toBlock});
            let contractOrderCount = orderForSaleEvent.length + orderFilledEvent.length + orderCanceled.length + orderPriceChanged.length;

            if(orderCount !== contractOrderCount) {
                logger.info(`Order Event Count Check: StartBlock: ${fromBlock}    EndBlock: ${toBlock}`);
                logger.info(`Order Event Count Check: DBEventCount: ${orderCount}    ContractEventCount: ${contractOrderCount}`);
                await sendMail(`Pasar Order Sync [${config.serviceName}]`,
                    `pasar assist sync service sync failed!\nDbEventCount: ${orderCount}   ContractEventCount: ${contractOrderCount}`,
                    recipients.join());
            }

            pasarOrderEventCheckBlockNumber = toBlock + 1;
        });

        schedule.scheduleJob('0 */2 * * * *', async () => {
            /**
                *  Start to listen all user's contract events
            */
            if(!isSyncCollectionEventJobRun) {
                isSyncCollectionEventJobRun = true;
                await jobService.startupUsersContractEvents(web3Rpc, config.fusion.chainType);
                isSyncCollectionEventJobRun = false;
            }
        })

        schedule.scheduleJob('0 * * * * *', async () => {
            /**
                *  Get the rate of token for ela
            */
            let response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=elastos,fsn&vs_currencies=usd');
            let jsonData = await response.json();
            
            let rate = jsonData.fsn.usd / jsonData.elastos.usd;
            stickerDBService.updatePriceRate(config.fusion.ELAToken, 1, config.fusion.chainType)
            stickerDBService.updatePriceRate(config.DefaultToken, rate, config.fusion.chainType)
        })
    }
}
