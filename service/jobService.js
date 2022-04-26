let config = require("../config");
const config_test = require("../config_test");
const token1155ABI = require("../contractABI/token1155ABI");
const token721ABI = require("../contractABI/token721ABI");
config = config.curNetwork == 'testNet'? config_test : config;

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const burnAddress = '0x0000000000000000000000000000000000000000';

module.exports = {

    getInfoByIpfsUri: async function(uri) {
        console.log(uri, 'this is ipfs method')
        let tokenCID = uri.split(":")[2];
        if(tokenCID) {
            let response = await fetch(config.ipfsNodeUrl + tokenCID);
            return await response.json();
        } else {
            return null;
        }
    },

    makeBatchRequest: function (calls, web3) {
        let batch = new web3.BatchRequest();
        let promises = calls.map(call => {
            return new Promise((res, rej) => {
                let req = call["method"].request(call["params"], (err, data) => {
                    if(err) rej(err);
                    else res(data)
                });
                batch.add(req)
            })
        })
        batch.execute()
        return Promise.all(promises)
    },

    dealWithUsersToken: async function(event, token, check721, tokenContract, web3Rpc) {
        let tokenInfo = event.returnValues;
        let tokenId = check721 ? tokenInfo._tokenId : tokenInfo._id;
        
        console.log("Register Info: " + JSON.stringify(tokenInfo));
        let [result, txInfo, blockInfo] = await this.makeBatchRequest([
            {method: check721 ? tokenContract.methods.tokenURI(tokenId).call : tokenContract.methods.uri(tokenId).call, params: {}},
            {method: web3Rpc.eth.getTransaction, params: event.transactionHash},
            {method: web3Rpc.eth.getBlock, params: event.blockNumber}
        ], web3Rpc)
        console.log("Register URL: " + result)

        let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
        let data;
        if(result.indexOf("pasar:json") != -1) {
            let jsonData = await this.getInfoByIpfsUri(result);
            data = this.parsePasar(jsonData);
        } else if(result.indexOf("Solana") != -1) {
            if(result.indexOf("https://") == -1) {
                result = "https://gateway.pinata.cloud/ipfs/" + result;
            }

            fetch('https://cloudflare-ipfs.com/ipfs/QmU7FNsvsN4x9J4hKU81V67vUjvK3iz7Z4aa4xJrR2i9Z6/Solana_Data_7.json')
            .then(res => res.text())
            .then(data => {
                console.log(222222222222);
                console.log(data);
            })
        }

        
    },

    parseData: async function(result, gasFee, blockInfo, tokenInfo, tokenId, event, token) {
        if(result.indexOf("pasar:json") != -1) {
            let jsonData = await this.getInfoByIpfsUri(result);
            let data = this.parsePasar(jsonData);
            this.updateTokenInfo(result, gasFee, blockInfo, tokenInfo, tokenId, event, token, data)
        } else if(result.indexOf("Solana") != -1) {
            if(result.indexOf("https://") == -1) {
                result = "https://gateway.pinata.cloud/ipfs/" + result;
            }

            fetch(result)
            .then(res => res.text())
            .then(data => {
                this.updateTokenInfo(result, gasFee, blockInfo, tokenInfo, tokenId, event, token, data)
            })
        }
    },

    updateTokenInfo: async function(gasFee, blockInfo, tokenInfo, tokenId, event, token, data) {
        let tokenEventDetail = {
            tokenId: tokenId,
            blockNumber: event.blockNumber,
            timestamp: blockInfo.timestamp,
            txHash: event.transactionHash,
            txIndex: event.transactionIndex,
            from: tokenInfo._from,
            to: tokenInfo._to,
            value: check721 ? 1 : parseInt(tokenInfo._value),
            gasFee,
            token
        };
        logger.info(`[Contract721] : ${JSON.stringify(tokenEventDetail)}`);
        const stickerDBService = require("./stickerDBService");
        await stickerDBService.addEvent(tokenEventDetail)

        let tokenDetail = {
            tokenId: tokenId,
            blockNumber: event.blockNumber,
            royalties: 0,
            updateTime: blockInfo.timestamp,
            price: 0,
            marketTime: 0,
            endTime: 0,
            orderId: ""
        }
        
        if(tokenInfo._from == burnAddress) {
            tokenDetail.status = "Not on sale";
            tokenDetail.royaltyOwner = tokenInfo._to;
            tokenDetail.holder = tokenInfo._to;
            tokenDetail.createTime = blockInfo.timestamp;
            tokenDetail.quantity = check721 ? 1 : parseInt(tokenInfo._value);
            tokenDetail.tokenIdHex = '0x' + BigInt(tokenId).toString(16);
            tokenDetail.tokenJsonVersion = data.version;
            tokenDetail.type = data.type;
            tokenDetail.name = data.name;
            tokenDetail.description = data.description;
            tokenDetail.thumbnail = data.thumbnail;
            tokenDetail.asset = data.asset;
            tokenDetail.kind = data.kind;
            tokenDetail.size = data.size;
            tokenDetail.adult = data.adult;
            tokenDetail.baseToken = token;

            console.log("Register Token: " + token + " : " +JSON.stringify(tokenDetail));
            await stickerDBService.replaceToken(tokenDetail);
        }
    },

    startupUsersContractEvents: async function (web3Ws, web3Rpc) {
        const stickerDBService = require("./stickerDBService");
        let data = (await stickerDBService.getCollections()).data;

        for(let x of data) {
            let tokenContract = new web3Ws.eth.Contract(x.is721 ? token721ABI : token1155ABI, x.token);

            let result = await stickerDBService.getLastUserToken(x.token);
            let fromBlock = result === 0 ? x.blockNumber : result + 1;

            if(x.is721){
                tokenContract.events.Transfer({
                    fromBlock
                }).on("error", function (error) {
                    logger.info(error);
                    logger.error(`[User Contract] ${x.token} Sync Starting ...`);
                }).on("connected", function () {
                    logger.info(`[User Contract] ${x.token} Sync Starting ...`)
                }).on("data", async function (event) {
                    await this.dealWithUsersToken(event,x.token, x.is721, tokenContract, web3Rpc)
                })
            } else {
                tokenContract.events.TransferSingle({
                    fromBlock
                }).on("error", function (error) {
                    logger.info(error);
                    logger.error(`[User Contract] ${x.token} Sync Starting ...`);
                }).on("connected", function () {
                    logger.info(`[User Contract] ${x.token} Sync Starting ...`);
                }).on("data", async function (event) {
                    await this.dealWithUsersToken(event, x.token, x.is721, tokenContract, web3Rpc)
                })
            }
        }
    },

    parsePasar: function(data) {
        let returnValue = {};
        returnValue.tokenJsonVersion = data.version;
        returnValue.type = data.type;
        returnValue.name = data.name;
        returnValue.description = data.description;
        returnValue.thumbnail = data.data.thumbnail;
        returnValue.asset = data.data.image;
        returnValue.kind = data.data.kind;
        returnValue.size = data.data.size;
        returnValue.adult = data.adult;
        return returnValue;
    },

    parseSolana: function(data) {
        let returnValue = {};
        console.log("SolanaData: " + JSON.stringify(data));
        returnValue.tokenJsonVersion = 1;
        returnValue.type = data.properties.files[0].type;
        returnValue.name = data.name;
        returnValue.description = data.description;
        returnValue.thumbnail = data.image;
        returnValue.asset = data.image;
        returnValue.kind = data.properties.files[0].type;
        returnValue.size = null;
        returnValue.adult = false;
        return returnValue;
    },
}
