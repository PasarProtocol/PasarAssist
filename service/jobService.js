const { json } = require("body-parser");
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
        
        this.parseData(result, gasFee, blockInfo, tokenInfo, tokenId, event, token, check721);
        
    },

    parseData: async function(result, gasFee, blockInfo, tokenInfo, tokenId, event, token, check721) {
        if(result.indexOf("pasar:json") != -1 || result.indexOf("feeds:json") != -1) {
            let jsonData = await this.getInfoByIpfsUri(result);
            jsonData = this.parsePasar(jsonData);
            console.log("Pasar Data: " + JSON.stringify(jsonData));
            this.updateTokenInfo(gasFee, blockInfo, tokenInfo, tokenId, event, token, check721, jsonData)
        } else if(result.indexOf("Solana") != -1) {
            result = result.replace("https://gateway.pinata.cloud", "https://cloudflare-ipfs.com");
            fetch(result)
            .then(res => res.text())
            .then(async data => {
                let jsonData = await JSON.parse(data);
                let returnData = await this.parseSolana(jsonData, token);

                this.updateTokenInfo(gasFee, blockInfo, tokenInfo, tokenId, event, token, check721, returnData)
            })
        }
    },

    updateTokenInfo: async function(gasFee, blockInfo, tokenInfo, tokenId, event, token, check721, data) {
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
        let stickerDBService = require("./stickerDBService");

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
            tokenDetail.attribute = data.attribute ? data.attribute : null;
            console.log("Register Token: " + token + " : " +JSON.stringify(tokenDetail));
            await stickerDBService.insertToken(tokenDetail);

            let response = await stickerDBService.getEvents(tokenId);

            if(response.code == 200) {
                await Promise.all(response.data.map(async event => {
                    if(event.from != burnAddress) {
                        let updateTokenInfo = {
                            tokenId: tokenId,
                            blockNumber: event.blockNumber,
                            updateTime: event.updateTime,
                            holder: event.to,
                        };
                        await stickerDBService.updateNormalToken(updateTokenInfo);
                    }
                }))
            }

        } else {
            console.log("Transer: " + data.name + " : " + tokenInfo._to);
            tokenDetail.holder = tokenInfo._to;
            await stickerDBService.updateNormalToken(tokenDetail);
        }
        await stickerDBService.addEvent(tokenEventDetail)

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
                    let jobService = require('./jobService.js');
                    jobService.dealWithUsersToken(event, x.token, x.is721, tokenContract, web3Rpc)
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
                    let jobService = require('./jobService.js');
                    jobService.dealWithUsersToken(event, x.token, x.is721, tokenContract, web3Rpc)
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
        console.log("Paser Data: " + JSON.parse(data));
        return returnValue;
    },

    

    parseSolana: async function(data, token) {
        let returnValue = {};

        returnValue.tokenJsonVersion = 1;
        returnValue.type = data.properties.files[0].type;
        returnValue.name = data.name;
        returnValue.description = data.description;
        returnValue.thumbnail = data.image.replace("https://gateway.pinata.cloud", "https://cloudflare-ipfs.com");
        returnValue.asset = data.image.replace("https://gateway.pinata.cloud", "https://cloudflare-ipfs.com");
        returnValue.kind = data.properties.files[0].type;
        returnValue.size = 0;
        returnValue.adult = false;
        returnValue.attribute={};
        let listAttributes = data.attributes;

        let stickerDBService = require("./stickerDBService");
        let collection = await stickerDBService.getCollection(token);
        let attributeOfCollection = {};
        if(collection && collection.attribute) {
            attributeOfCollection = collection.attribute;
        }

        listAttributes.forEach(element => {
            let type = element.trait_type;
            let value = element.value;
            returnValue.attribute[type] = value;
            if(attributeOfCollection[type]) {
                let listParams = attributeOfCollection[type];
                if(listParams.indexOf(value) == -1) {
                    attributeOfCollection[type].push(value);
                }
            } else {
                attributeOfCollection[type] = [value];
            }
        });
        if(attributeOfCollection) {
            await stickerDBService.updateCollectionAttribute(token, attributeOfCollection);
        }
        console.log("SolanaData: " + JSON.stringify(returnValue));

        return returnValue;
    },
}
