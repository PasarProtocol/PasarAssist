const schedule = require('node-schedule');
let Web3 = require('web3');
let pasarDBService = require('./service/pasarDBService');
let stickerDBService = require('./service/stickerDBService');
let indexDBService = require('./service/indexDBService');
let config = require('./config');
let pasarContractABI = require('./contractABI/pasarV2ABI');
let stickerContractABI = require('./contractABI/stickerV2ABI');
let pasarRegisterABI = require('./contractABI/pasarRegisterABI');
let token721ABI = require('./contractABI/token721ABI');
let token1155ABI = require('./contractABI/token1155ABI');
let jobService = require('./service/jobService');
let authService  = require('./service/authService')
let sendMail = require('./send_mail');
const config_test = require("./config_test");
config = config.curNetwork == 'testNet'? config_test : config;

module.exports = {
    run: function() {
        logger.info("========= Pasar Assist Service start =============")

        const burnAddress = '0x0000000000000000000000000000000000000000';

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
        let pasarContractWs = new web3Ws.eth.Contract(pasarContractABI, config.pasarV2Contract);
        let stickerContractWs = new web3Ws.eth.Contract(stickerContractABI, config.stickerV2Contract);
        let pasarRegisterWs = new web3Ws.eth.Contract(pasarRegisterABI, config.pasarRegisterContract)

        let web3Rpc = new Web3(config.escRpcUrl);
        let pasarContract = new web3Rpc.eth.Contract(pasarContractABI, config.pasarV2Contract);
        let stickerContract = new web3Rpc.eth.Contract(stickerContractABI, config.stickerV2Contract);

        let isGetForSaleOrderJobRun = false;
        let isGetForOrderPriceChangedJobRun = false;
        let isGetForOrderCancelledJobRun = false;
        let isGetForOrderFilledJobRun = false;
        let isGetTokenInfoJobRun = false;
        let isGetTokenInfoWithMemoJobRun = false;
        let isGetApprovalRun = false;
        let isGetOrderForAuctionJobRun = false;
        let isGetOrderBidJobRun = false;
        let isOrderDidURIJobRun = false;
        let isTokenTransferBatchJobRun = false;
        let isGetTokenInfoWithBatchMemoJobRun = false;
        let isTokenRegisteredJobRun = false;
        let isRoyaltyChangedJobRun = false;
        let isTokenInfoUpdatedJobRun = false;
        let now = Date.now();
        
        let recipients = [];
        recipients.push('lifayi2008@163.com');
        
        async function dealWithNewToken(blockNumber,tokenId) {
            try {
                let [result] = await jobService.makeBatchRequest([
                    {method: stickerContract.methods.tokenInfo(tokenId).call, params: {}},
                ], web3Rpc);

                let token = {blockNumber, tokenIndex: result.tokenIndex, tokenId, quantity: result.tokenSupply,
                    royalties:result.royaltyFee, royaltyOwner: result.royaltyOwner, holder: result.royaltyOwner,
                    createTime: result.createTime, updateTime: result.updateTime, marketTime: result.updateTime}
                
                token.tokenIdHex = '0x' + BigInt(tokenId).toString(16);
                let data = await jobService.getInfoByIpfsUri(result.tokenUri);
                token.tokenJsonVersion = data.version;
                token.type = data.type;
                token.name = data.name;
                token.description = data.description;
                token.properties = data.properties;

                if(token.type === 'feeds-channel') {
                    token.tippingAddress = data.tippingAddress;
                    token.entry = data.entry;
                    token.avatar = data.avatar;
                    logger.info(`[TokenInfo2] New token info: ${JSON.stringify(token)}`)
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
                token.status = "Not on sale";
                token.endTime = null;
                token.orderId = null;
                token.baseToken = config.stickerV2Contract;

                let creator = data.creator ? data.creator : null;
                if(creator) {
                    await pasarDBService.updateDid({address: result.royaltyOwner, did: creator});
                }

                logger.info(`[TokenInfo] New token info: ${JSON.stringify(token)}`)
                await stickerDBService.replaceToken(token);
            } catch (e) {
                logger.info(`[TokenInfo2] Sync error at ${blockNumber} ${tokenId}`);
                logger.info(e);
            }
        }

        async function dealWithNewTokenBatch(blockNumber,tokenIds) {
            try {
                let [results] = await jobService.tokenInfoBatch([
                    {method: stickerContract.methods.tokenInfoBatch(tokenIds).call, params: {}},
                ], web3Rpc);

                let tokens = [];
                results.map(async result => {
                    let token = {blockNumber, tokenIndex: result.tokenIndex, tokenId, quantity: result.tokenSupply,
                        royalties:result.royaltyFee, royaltyOwner: result.royaltyOwner, holder: result.royaltyOwner,
                        createTime: result.createTime, updateTime: result.updateTime, marketTime: result.updateTime}
                    token.tokenIdHex = '0x' + BigInt(tokenId).toString(16);
                    let data = await jobService.getInfoByIpfsUri(result.tokenUri);
                    token.tokenJsonVersion = data.version;
                    token.type = data.type;
                    token.name = data.name;
                    token.description = data.description;
                    token.properties = data.properties;

                    if(token.type === 'feeds-channel') {
                        token.tippingAddress = data.tippingAddress;
                        token.entry = data.entry;
                        token.avatar = data.avatar;
                        logger.info(`[TokenInfo2] New token info: ${JSON.stringify(token)}`)
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
                    token.status = "Not on sale";
                    token.endTime = null;
                    token.orderId = null;
                    token.baseToken = config.stickerV2Contract;
                    tokens.push(token);
                    logger.info(`[TokenInfo] New token info: ${JSON.stringify(token)}`)
                    await stickerDBService.replaceToken(tokens);
                })
            } catch (e) {
                logger.info(`[TokenInfo2] Sync error at ${blockNumber} ${tokenIds}`);
                logger.info(e);
            }
        }

        let orderDidURIJobId = schedule.scheduleJob(new Date(now + 40 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderDIDURI');

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
                let token = {orderId: orderInfo._orderId}
                token.didUri = orderInfo._sellerUri;
                token.did = await jobService.getInfoByIpfsUri(orderInfo._sellerUri);
                await pasarDBService.replaceDid({address: orderInfo._seller, did: orderInfo._sellerUri});
                if(token.did.KYCedProof != undefined) {
                    await authService.verifyKyc(token.did.KYCedProof, token.did.did, orderInfo._seller);
                }
                logger.info("[OrderDidURI2] " + JSON.stringify(token));
                // await stickerDBService.replaceToken(token);
            })
        });

        let orderForSaleJobId = schedule.scheduleJob(new Date(now + 40 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderForSale');
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

                logger.info(`[OrderForSale2] orderEventDetail: ${JSON.stringify(orderEventDetail)}`)
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateTokenInfo(orderInfo._tokenId, orderEventDetail.price, orderEventDetail.orderId, result.createTime, result.endTime, 'MarketSale', result.sellerAddr, event.blockNumber, orderInfo._quoteToken);
            })
        });

        let orderPriceChangedJobId = schedule.scheduleJob(new Date(now + 60 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderPriceChanged');
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
                let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id,
                    price: {oldPrice: orderInfo._oldPrice, newPrice: orderInfo._newPrice}, reservePrice: {oldPrice: orderInfo._oldReservePrice, _newReservePrice: orderInfo._newPrice},
                    buyoutPrice: {oldPrice: orderInfo._oldBuyoutPrice, newPrice: orderInfo._newBuyoutPrice}, sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr,
                    royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, quoteToken:orderInfo._newQuoteToken, timestamp: result.updateTime, gasFee}

                result.price = orderInfo._newPrice;
                result.reservePrice = orderInfo._newReservePrice;
                result.buyoutPrice = orderInfo._newBuyoutPrice;
                result.price = orderInfo._newPrice;
                result.quoteToken = orderInfo._newQuoteToken;

                logger.info(`[OrderPriceChanged2] orderEventDetail: ${JSON.stringify(orderEventDetail)}`)
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateTokenInfo(result.tokenId, orderEventDetail.price, orderEventDetail.orderId, null, null, null, result.sellerAddr, event.blockNumber, orderEventDetail.quoteToken);
            })
        });

        let orderFilledJobId = schedule.scheduleJob(new Date(now + 80 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderFilled');
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

                logger.info(`[OrderFilled2] orderEventDetail: ${JSON.stringify(orderEventDetail)}`)
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await pasarDBService.insertOrderPlatformFeeEvent(orderEventFeeDetail);
                await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateTokenInfo(result.tokenId, orderEventDetail.price, null, result.updateTime, null, 'Not on sale', result.buyerAddr, event.blockNumber, orderInfo._quoteToken, orderInfo._baseToken);
            })
        });

        let orderCanceledJobId = schedule.scheduleJob(new Date(now + 100 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderCanceled');
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
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
                let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: result.buyerAddr,
                    royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: result.price, timestamp: result.updateTime, gasFee};

                result.sellerAddr = orderInfo._seller

                logger.info(`[OrderCanceled2] orderEventDetail: ${JSON.stringify(orderEventDetail)}`)
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateTokenInfo(result.tokenId, orderEventDetail.price, null, result.updateTime, 0, 'Not on sale', result.sellerAddr, event.blockNumber);
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
            logger.info(`[approval2] Sync Starting ... from block ${lastHeight + 1}`)
            stickerContractWs.events.ApprovalForAll({
                fromBlock: lastHeight
            }).on("error", function(error) {
                logger.info(error);
                logger.info("[approval2] Sync Ending ...");
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
            let lastHeight = await stickerDBService.getLastStickerSyncHeight();
            // if(isGetTokenInfoJobRun == false) {
            //     //initial state
            //     stickerDBService.removeTokenInfoByHeight(lastHeight);
            // } else {
            //     lastHeight += 1;
            // }
            isGetTokenInfoJobRun = true;
            logger.info(`[TokenInfo2] Sync Starting ... from block ${lastHeight + 1}`)

            stickerContractWs.events.TransferSingle({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[TokenInfo2] Sync Ending ...");
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

                let transferEvent = {tokenId, blockNumber, timestamp,txHash, txIndex, from, to, value, gasFee};
                logger.info(`[TokenInfo2] tokenEvent: ${JSON.stringify(transferEvent)}`)
                if(transferEvent.to != config.pasarV2Contract && transferEvent.to != config.pasarContract && transferEvent.to != null
                    && transferEvent.from != config.pasarV2Contract && transferEvent.from != config.pasarContract && transferEvent.from != null) {
                    await stickerDBService.replaceEvent(transferEvent);
                }

                if(to === burnAddress) {
                    await stickerDBService.burnToken(tokenId);
                } else if(from === burnAddress) {
                    await dealWithNewToken(blockNumber, tokenId)
                } else {
                    await stickerDBService.updateToken(tokenId, to, timestamp, blockNumber);
                }
            })
        });

        let tokenTransferBatchSyncJobId = schedule.scheduleJob(new Date(now + 10 * 1000), async () => {
            let lastHeight = await stickerDBService.getLastStickerSyncHeight();
            isTokenTransferBatchJobRun = true;
            logger.info(`[TransferBatch] Sync Starting ... from block ${lastHeight + 1}`)

            stickerContractWs.events.TransferBatch({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[TransferBatch] Sync Ending ...");
                isTokenTransferBatchJobRun = false
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

                let tokenIds = event.returnValues._ids;
                let values = event.returnValues._values;

                let [blockInfo, txInfo] = await jobService.makeBatchRequest([
                    {method: web3Rpc.eth.getBlock, params: blockNumber},
                    {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
                ], web3Rpc)
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
                let timestamp = blockInfo.timestamp;

                for(var i = 0; i < tokenIds.length; i++) {
                    let tokenId = tokenIds[i];
                    let value = values[i];
                    let transferEvent = {tokenId, blockNumber, timestamp,txHash, txIndex, from, to, value, gasFee};
                    logger.info(`[TransferBatch] tokenEvent: ${JSON.stringify(transferEvent)}`)
                    await stickerDBService.replaceEvent(transferEvent);
                }


                if(to === burnAddress) {
                    await stickerDBService.burnTokenBatch(tokenIds);
                } else if(from === burnAddress) {
                    await dealWithNewTokenBatch(blockNumber, tokenIds)
                } else {
                    // await stickerDBService.updateToken(tokenId, to, timestamp, blockNumber);
                }
            })
        });

        let tokenInfoWithMemoSyncJobId = schedule.scheduleJob(new Date(now + 20 * 1000), async () => {
            let lastHeight = await stickerDBService.getLastStickerSyncHeight();
            // if(isGetTokenInfoWithMemoJobRun == false) {
            //     //initial state
            //     stickerDBService.removeTokenInfoByHeight(lastHeight);
            // } else {
            //     lastHeight += 1;
            // }
            isGetTokenInfoWithMemoJobRun = true;
            logger.info(`[TokenInfoWithMemo2] Sync Starting ... from block ${lastHeight + 1}`)

            stickerContractWs.events.TransferSingleWithMemo({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[TokenInfoWithMemo2] Sync Ending ...");
                isGetTokenInfoWithMemoJobRun = false
            }).on("data", async function (event) {
                let from = event.returnValues._from;
                let to = event.returnValues._to;
                let tokenId = event.returnValues._id;
                let value = event.returnValues._value;
                let memo = event.returnValues._memo ? event.returnValues._memo : "";
                let blockNumber = event.blockNumber;
                let txHash = event.transactionHash;
                let txIndex = event.transactionIndex;

                let [blockInfo, txInfo] = await jobService.makeBatchRequest([
                    {method: web3Rpc.eth.getBlock, params: blockNumber},
                    {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
                ], web3Rpc)
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
                let timestamp = blockInfo.timestamp;

                let transferEvent = {tokenId, blockNumber, timestamp, txHash, txIndex, from, to, value, memo, gasFee};
                logger.info(`[TokenInfoWithMemo2] transferToken: ${JSON.stringify(transferEvent)}`)
                // await stickerDBService.addEvent(transferEvent);
                // await stickerDBService.updateToken(tokenId, to, timestamp, blockNumber);
            })
        });

        let tokenInfoWithBatchMemoSyncJobId = schedule.scheduleJob(new Date(now + 20 * 1000), async () => {
            let lastHeight = await stickerDBService.getLastStickerSyncHeight();
            // if(isGetTokenInfoWithMemoJobRun == false) {
            //     //initial state
            //     stickerDBService.removeTokenInfoByHeight(lastHeight);
            // } else {
            //     lastHeight += 1;
            // }
            isGetTokenInfoWithBatchMemoJobRun = true;
            logger.info(`[TokenInfoWithBatchMemo2] Sync Starting ... from block ${lastHeight + 1}`)

            stickerContractWs.events.TransferBatchWithMemo({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[TokenInfoWithBatchMemo2] Sync Ending ...");
                isGetTokenInfoWithBatchMemoJobRun = false
            }).on("data", async function (event) {
                let from = event.returnValues._from;
                let to = event.returnValues._to;
                let tokenIds = event.returnValues._ids;
                let values = event.returnValues._values;
                let memo = event.returnValues._memo ? event.returnValues._memo : "";
                let blockNumber = event.blockNumber;
                let txHash = event.transactionHash;
                let txIndex = event.transactionIndex;

                let [blockInfo, txInfo] = await jobService.makeBatchRequest([
                    {method: web3Rpc.eth.getBlock, params: blockNumber},
                    {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
                ], web3Rpc)
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
                let timestamp = blockInfo.timestamp;

                let transferEvents = [];

                for(var i = 0; i < tokenIds.length; i++) {
                    let value = values[i];
                    let tokenId = tokenIds[i];
                    transferEvents.push({tokenId, blockNumber, timestamp, txHash, txIndex, from, to, value, memo, gasFee});
                    logger.info(`[TokenInfoWithBatchMemo2] transferToken: ${JSON.stringify({tokenId, blockNumber, timestamp, txHash, txIndex, from, to, value, memo, gasFee})}`)
                }
                // await stickerDBService.replaceEvent(transferEvents);

                // await stickerDBService.updateToken(tokenId, to, timestamp, blockNumber);
            })
        });

        let orderForAuctionJobId = schedule.scheduleJob(new Date(now + 100 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderForAuction');
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

                logger.info(`[OrderForAuction2] orderEventDetail: ${JSON.stringify(orderEventDetail)}`)
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateTokenInfo(result.tokenId, orderEventDetail.price, orderEventDetail.orderId, orderInfo._startTime, orderInfo._endTime, 'MarketAuction', result.sellerAddr, event.blockNumber, orderInfo._quoteToken, orderInfo._baseToken);
            })
        });

        let orderBidJobId = schedule.scheduleJob(new Date(now + 110 * 1000), async () => {
            let lastHeight = await pasarDBService.getLastPasarOrderSyncHeight('OrderBid');
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
                console.log('OrderBid event data is ', event);

                let [result, txInfo] = await jobService.makeBatchRequest([
                    {method: pasarContract.methods.getOrderById(orderInfo._orderId).call, params: {}},
                    {method: web3Rpc.eth.getTransaction, params: event.transactionHash}
                ], web3Rpc)
                let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

                let resultData = await stickerDBService.search(result.tokenId);
                let token = resultData.code == 200 && resultData.data && resultData.data.result && resultData.data.result.length  > 0 ? resultData.data.result[0] : null;

                let orderEventDetail = {orderId: orderInfo._orderId, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id, sellerAddr: orderInfo._seller, buyerAddr: orderInfo._buyer,
                    royaltyFee: result.royaltyFee, tokenId: result.tokenId, price: orderInfo._price, 
                    quoteToken: token.quoteToken, baseToken: token.baseToken, timestamp: result.updateTime, gasFee}
                
                logger.info(`[OrderForBid2] orderEventDetail: ${JSON.stringify(orderEventDetail)}`)
                await pasarDBService.insertOrderEvent(orderEventDetail);
                await stickerDBService.updateOrder(result, event.blockNumber, orderInfo._orderId);
                await stickerDBService.updateTokenInfo(result.tokenId, orderInfo._price, orderEventDetail.orderId, null, result.endTime, 'MarketBid', result.sellerAddr, event.blockNumber);
            })
        });

        let tokenRegisteredJobId = schedule.scheduleJob(new Date(now + 40 * 1000), async () => {
            let lastHeight = await stickerDBService.getLastCollectionEventSyncHeight('TokenRegistered');

            isTokenRegisteredJobRun = true;

            logger.info(`[tokenRegistered] Sync start from height: ${config.pasarRegisterContractDeploy}`);

            pasarRegisterWs.events.TokenRegistered({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[tokenRegistered] Sync Ending ...")
                isTokenRegisteredJobRun = false;
            }).on("data", async function (event) {
                let registeredTokenInfo = event.returnValues;
                logger.info(`[TokenRegistered] : ${JSON.stringify(registeredTokenInfo)}`);

                let registeredTokenDetail = {token: registeredTokenInfo._token, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id}

                let tokenContract = new web3Ws.eth.Contract(token721ABI, registeredTokenInfo._token);
                let [is721, is1155, symbol] = await jobService.makeBatchRequest([
                    {method: tokenContract.methods.supportsInterface('0x80ac58cd').call, params: {}},
                    {method: tokenContract.methods.supportsInterface('0xd9b67a26').call, params: {}},
                    {method: tokenContract.methods.symbol().call, params: {}}
                ], web3Ws)

                let data = await jobService.getInfoByIpfsUri(registeredTokenInfo._uri)
                
                let check721;
                let lastHeight = await stickerDBService.getLastRegisterCollectionEvent(registeredTokenInfo._token);
                if(is721){
                    check721 = true;

                    tokenContract.events.Transfer({
                        fromBlock: lastHeight
                    }).on("error", function (error) {
                        logger.info(error);
                        logger.info("[Contract721] Sync Ending ...")
                    }).on("data", async function (event) {
                        console.log("[Contract721] Data: " + JSON.stringify(event))
                        await jobService.dealWithUsersToken(event,registeredTokenInfo._token, check721, tokenContract, web3Rpc)
                    })
                } else if(is1155) {
                    check721 = false;
                    
                    tokenContract = new web3Ws.eth.Contract(token1155ABI, registeredTokenInfo._token);
                    tokenContract.events.TransferSingle({
                        fromBlock: lastHeight
                    }).on("error", function (error) {
                        logger.info(error);
                        logger.info("[Contract1155] Sync Ending ...")
                    }).on("data", async function (event) {
                        console.log("[Contract1155] Data: " + JSON.stringify(event));
                        await jobService.dealWithUsersToken(event, registeredTokenInfo._token, check721, tokenContract, web3Rpc)
                    })
                } else {
                    logger.error("unknown token type");
                    return;
                }

                let creator = data.creator ? data.creator : null;
                
                if(creator) {
                    await pasarDBService.updateDid({address: registeredTokenInfo._owner, did: creator});
                }

                await stickerDBService.collectionEvent(registeredTokenDetail);
                await stickerDBService.registerCollection(registeredTokenInfo._token, registeredTokenInfo._owner,
                    registeredTokenInfo._name, registeredTokenInfo._uri, symbol, check721, event.blockNumber, data);
            })
        });

        let royaltyChangedJobRun = schedule.scheduleJob(new Date(now + 40 * 1000), async () => {
            let lastHeight = await stickerDBService.getLastCollectionEventSyncHeight('TokenRoyaltyChanged');

            isRoyaltyChangedJobRun = true;

            logger.info(`[TokenRoyaltyChanged] Sync start from height: ${config.pasarRegisterContractDeploy}`);

            pasarRegisterWs.events.TokenRoyaltyChanged({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[TokenRoyaltyChanged] Sync Ending ...")
                isRoyaltyChangedJobRun = false;

            }).on("data", async function (event) {
                let orderInfo = event.returnValues;
                logger.info(`[TokenRoyaltyChanged] : ${JSON.stringify(orderInfo)}`);

                let orderEventDetail = {token: orderInfo._token, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id}

                await stickerDBService.collectionEvent(orderEventDetail);
                await stickerDBService.changeCollectionRoyalty(orderInfo._token, orderInfo._royaltyOwners, orderInfo._royaltyRates);
            })
        });

        let tokenInfoUpdatedJobRun = schedule.scheduleJob(new Date(now + 40 * 1000), async () => {
            let lastHeight = await stickerDBService.getLastCollectionEventSyncHeight('TokenInfoUpdated');

            isTokenInfoUpdatedJobRun = true;

            logger.info(`[TokenInfoUpdated] Sync start from height: ${config.pasarRegisterContractDeploy}`);

            pasarRegisterWs.events.TokenInfoUpdated({
                fromBlock: lastHeight + 1
            }).on("error", function (error) {
                logger.info(error);
                logger.info("[tokenRegistered] Sync Ending ...")
                isTokenInfoUpdatedJobRun = false;

            }).on("data", async function (event) {
                let updatedTokenInfo = event.returnValues;
                logger.info(`[TokenRegistered] : ${JSON.stringify(updatedTokenInfo)}`);

                let updatedTokenDetail = {token: updatedTokenInfo._token, event: event.event, blockNumber: event.blockNumber,
                    tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
                    logIndex: event.logIndex, removed: event.removed, id: event.id}

                await stickerDBService.collectionEvent(updatedTokenDetail);
                await stickerDBService.updateCollection(updatedTokenInfo._token, updatedTokenInfo._name, updatedTokenInfo._uri, event.blockNumber);
            })
        });

        schedule.scheduleJob({start: new Date(now + 61 * 1000), rule: '0 */2 * * * *'}, () => {
            let now = Date.now();

            if(!isGetForSaleOrderJobRun) {
                orderForSaleJobId.reschedule(new Date(now + 10 * 1000));

                if(config.galleriaContract !== '' && config.galleriaContractDeploy !== 0) {
                    // panelCreatedSyncJobId.reschedule(new Date(now + 4 * 60 * 1000));
                    // panelRemovedSyncJobId.reschedule(new Date(now + 4 * 60 * 1000));
                }
            }
            if(!isGetForOrderPriceChangedJobRun)
                orderPriceChangedJobId.reschedule(new Date(now + 20 * 1000));
            if(!isGetForOrderFilledJobRun)
                orderFilledJobId.reschedule(new Date(now + 30 * 1000));
            if(!isGetForOrderCancelledJobRun)
                orderCanceledJobId.reschedule(new Date(now + 40 * 1000));
            if(!isGetTokenInfoJobRun) {
                tokenInfoSyncJobId.reschedule(new Date(now + 50 * 1000))
            }
            if(!isGetTokenInfoWithMemoJobRun) {
                tokenInfoWithMemoSyncJobId.reschedule(new Date(now + 60 * 1000))
            }
            if(!isGetApprovalRun)
                approval.reschedule(new Date(now + 70 * 1000))
            if(!isGetOrderForAuctionJobRun)
                orderForAuctionJobId.reschedule(new Date(now + 100 * 1000))
            if(!isGetOrderBidJobRun)
                orderBidJobId.reschedule(new Date(now + 110 * 1000))
            if(!isOrderDidURIJobRun)
                orderDidURIJobId.reschedule(new Date(now + 110 * 1000))
            if(!isTokenTransferBatchJobRun)
                tokenTransferBatchSyncJobId.reschedule(new Date(now + 60 * 1000))
            if(!isGetTokenInfoWithBatchMemoJobRun)
                tokenInfoWithBatchMemoSyncJobId.reschedule(new Date(now + 60 * 1000))
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
         *  Sticker volume sync check
         */
        schedule.scheduleJob({start: new Date(now + 60 * 1000), rule: '*/2 * * * *'}, async () => {
            let stickerCount = await stickerDBService.stickerCount();
            let stickerGalleriaCount = await stickerDBService.stickerGalleriaCount();
            let stickerCountContract = parseInt(await stickerContract.methods.totalSupply().call());

            let totalDbCount = stickerCount + stickerGalleriaCount;
            logger.info(`[Token Count Check] DbCount: ${totalDbCount}   ContractCount: ${stickerCountContract}`)
            if(stickerCountContract !== totalDbCount) {
                await sendMail(`Sticker Sync [${config.serviceName}]`,
                    `pasar assist sync service sync failed!\nDbCount: ${totalDbCount}   ContractCount: ${stickerCountContract}`,
                    recipients.join());
            }
        });

        /**
         *  Pasar order event volume check
         */
        let pasarOrderEventCheckBlockNumber = config.pasarContractDeploy;
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

        /**
         *  Sticker transfer event volume check
         */
        let stickerEventCheckBlockNumber = config.stickerContractDeploy;
        schedule.scheduleJob({start: new Date(now + 60 * 1000), rule: '*/2 * * * *'}, async () => {
            let nowBlock = await web3Rpc.eth.getBlockNumber();
            let fromBlock = stickerEventCheckBlockNumber;
            let tempBlock = stickerEventCheckBlockNumber + 20000
            let toBlock =  tempBlock > nowBlock ? nowBlock : tempBlock;
            let stickerEventCountDB = await stickerDBService.stickerOrderEventCount(fromBlock, toBlock);

            let stickerEvent = await stickerContract.getPastEvents('TransferSingle', {fromBlock, toBlock});
            let stickerEventCount = stickerEvent.length;

            if(stickerEventCountDB !== stickerEventCount) {
                logger.info(`Sticker Event Count Check: StartBlock: ${fromBlock}    EndBlock: ${toBlock}`);
                logger.info(`Sticker Event Count Check: DBEventCount: ${stickerEventCountDB}    ContractEventCount: ${stickerEventCount}`);
                await sendMail(`Pasar Order Sync [${config.serviceName}]`,
                    `pasar assist sync service sync failed!\nDbEventCount: ${stickerEventCountDB}   ContractEventCount: ${stickerEventCount}`,
                    recipients.join());
            }

            stickerEventCheckBlockNumber = toBlock + 1;
        });

        /**
         *  Get ELA price from CoinMarketCap
         */
        let coins = {"BTC": 1, "BNB": 1839, "HT": 2502, "AVAX": 5805, "ETH": 1027, "FTM": 3513, "MATIC": 3890};
        let coins2 = {"FSN": 2530, "ELA": 2492, "TLOS": 4660}
        if(config.cmcApiKeys.length > 0) {
            schedule.scheduleJob('*/4 * * * *', async () => {
                let x = Math.floor(Math.random() * config.cmcApiKeys.length);
                let headers = {'Content-Type': 'application/json', 'X-CMC_PRO_API_KEY': config.cmcApiKeys[x]}
                let res = await fetch('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=100', {method: 'get', headers})
                let result = await res.json();

                let record = {timestamp: Date.parse(result.status.timestamp)}
                result.data.forEach(item => {
                    if(coins[item.symbol] === item.id) {
                        record[item.symbol] = item.quote.USD.price;
                    }
                })

                for(let i in coins2) {
                    let resOther = await fetch(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=1&convert_id=${coins2[i]}`, {method: 'get', headers})
                    let resultOther = await resOther.json();

                    if(resultOther.data[0].id === 1) {
                        let priceAtBTC = resultOther.data[0].quote[coins2[i]].price;
                        record[i] = record['BTC'] / priceAtBTC;
                    } else {
                        logger.error(`[Get CMC PRICE] the base coin changed`);
                    }
                }

                logger.info(`[Get CMC PRICE] Price: ${JSON.stringify(record)}`);
                await indexDBService.insertCoinsPrice(record);
                await indexDBService.removeOldPriceRecords(record.timestamp - 30 * 24 * 60 * 60 * 1000)
            })
        }

        schedule.scheduleJob('0 */10 * * * *', async () => {
            /**
                *  Start to listen all user's contract events
            */
            jobService.startupUsersContractEvents(web3Ws, web3Rpc);
        })

        
    }
}
