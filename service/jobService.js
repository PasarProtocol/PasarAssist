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

    dealWithUsersToken: async function(event, token, check721, tokenContract, web3Rpc, marketPlace) {
        if(token == config.stickerContract)
            return;
            
        let tokenInfo = event.returnValues;
        let tokenId = check721 ? tokenInfo._tokenId : tokenInfo._id;
        
        let [result, txInfo, blockInfo] = await this.makeBatchRequest([
            {method: check721 ? tokenContract.methods.tokenURI(tokenId).call : tokenContract.methods.uri(tokenId).call, params: {}},
            {method: web3Rpc.eth.getTransaction, params: event.transactionHash},
            {method: web3Rpc.eth.getBlock, params: event.blockNumber}
        ], web3Rpc)

        let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
        await this.parseData(result, gasFee, blockInfo, tokenInfo, tokenId, event, token, check721, tokenContract, web3Rpc, marketPlace);
        
    },

    parseData: async function(result, gasFee, blockInfo, tokenInfo, tokenId, event, token, check721, tokenContract, web3Rpc, marketPlace) {
        if(!stickerDBService.checkAddress(tokenInfo._from) || !stickerDBService.checkAddress(tokenInfo._to)) 
            return;

        if(result.indexOf("pasar:json") != -1 || result.indexOf("feeds:json") != -1) {
            let jsonData = await this.getInfoByIpfsUri(result);
            jsonData = this.parsePasar(jsonData);
            let tokenData = {};
            if(token == config.stickerV2Contract) {
                [tokenData] = await this.makeBatchRequest([
                    {method: tokenContract.methods.tokenInfo(tokenId).call, params: {}},
                ], web3Rpc);
            }
            
            this.updateTokenInfo(gasFee, blockInfo, tokenInfo, tokenId, event, token, check721, jsonData, marketPlace, tokenData)
        } else {
            let uriUrl = result;
            uriUrl = uriUrl.replace("https://gateway.pinata.cloud", "https://ipfs.ela.city");
            uriUrl = uriUrl.replace("ipfs://", "https://ipfs.ela.city/ipfs/");

            fetch(uriUrl)
            .then(res => res.text())
            .then(async data => {
                let jsonData = await JSON.parse(data);
                let returnData = await this.parseCustom(jsonData, token);

                this.updateTokenInfo(gasFee, blockInfo, tokenInfo, tokenId, event, token, check721, returnData, marketPlace)
            })
        }
    },

    updateTokenInfo: async function(gasFee, blockInfo, tokenInfo, tokenId, event, token, check721, data, marketPlace, tokenData=null) {
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
            token,
            marketPlace,
        };
        
        let stickerDBService = require("./stickerDBService");
        
        let tokenDetail = {
            tokenId: tokenId,
            baseToken: token,
            marketPlace,
            blockNumber: event.blockNumber,
            updateTime: blockInfo.timestamp,
            marketTime: blockInfo.timestamp,
        }
        
        if(tokenInfo._from == burnAddress) {
            tokenDetail.status = "Not on sale";
            tokenDetail.royaltyOwner = tokenInfo._to;
            tokenDetail.orderId = "";
            tokenDetail.endTime = 0;
            tokenDetail.price = 0;
            tokenDetail.orderId = 0;
            tokenDetail.royalties = tokenData && tokenData.royaltyFee? tokenData.royaltyFee : "0",
            tokenDetail.holder = tokenInfo._to;
            tokenDetail.createTime = blockInfo.timestamp;
            tokenDetail.quantity = check721 ? 1 : parseInt(tokenInfo._value);
            tokenDetail.tokenIdHex = '0x' + BigInt(tokenId).toString(16);
            tokenDetail.tokenJsonVersion = data.tokenJsonVersion;
            tokenDetail.type = data.type;
            tokenDetail.name = data.name;
            tokenDetail.description = data.description;
            tokenDetail.thumbnail = data.thumbnail;
            tokenDetail.asset = data.asset;
            tokenDetail.kind = data.kind;
            tokenDetail.size = data.size;
            tokenDetail.adult = data.adult;
            tokenDetail.attribute = data.attribute ? data.attribute : null;
            tokenDetail.properties = data.properties ? data.properties : null;

            let creator = data.creator ? data.creator : null;
            if(creator) {
                await pasarDBService.updateDid({address: tokenInfo._to, did: creator});
            }

            await stickerDBService.replaceToken(tokenDetail);

            let response = await stickerDBService.getEvents(tokenId, token, marketPlace);
            
            if(response.code == 200) {
                await Promise.all(response.data.map(async event => {
                    if(event.from != burnAddress) {
                        let updateTokenInfo = {
                            tokenId: tokenId,
                            blockNumber: event.blockNumber,
                            updateTime: event.updateTime,
                            holder: event.to,
                            baseToken: token,
                            marketPlace,
                        };
                        await stickerDBService.updateNormalToken(updateTokenInfo);
                    }
                }))
            }
            await stickerDBService.replaceEvent(tokenEventDetail)
        } else if(tokenInfo._to == burnAddress) {
            await stickerDBService.burnToken(tokenId, token, marketPlace);
            await stickerDBService.replaceEvent(tokenEventDetail)
        } else if(stickerDBService.checkAddress(tokenInfo._from) && stickerDBService.checkAddress(tokenInfo._to)){
            tokenDetail.holder = tokenInfo._to;
            await stickerDBService.updateNormalToken(tokenDetail);
            await stickerDBService.replaceEvent(tokenEventDetail)
        }
    },

    startupUsersContractEvents: async function (web3Rpc, marketPlace) {
        const stickerDBService = require("./stickerDBService");
        let data = (await stickerDBService.getCollections(0, marketPlace)).data;

        for(let x of data) {
            let tokenContract = new web3Rpc.eth.Contract(x.is721 ? token721ABI : token1155ABI, x.token);

            let result = await stickerDBService.getLastRegisterCollectionEvent(x.token, marketPlace);
            let startBlock = result == 0 ? x.blockNumber : result + 1;
            let  endBlock = "latest";

            const getAllEvents = await tokenContract.getPastEvents(x.is721 ? 'Transfer' : 'TransferSingle', {fromBlock: startBlock, toBlock: endBlock});

            for (var i = 0; i < getAllEvents.length; i++) {
                try {
                    let jobService = require('./jobService.js');
                    await jobService.dealWithUsersToken(getAllEvents[i], x.token, x.is721, tokenContract, web3Rpc, marketPlace)
                } catch(err) {
                    logger.info(`collection name: ${x.name}`);
                    logger.info(err);
                }
            }
        }
    },

    parsePasar: function(data) {
        let returnValue = {};
        returnValue.tokenJsonVersion = data.version;
        returnValue.type = data.type;
        returnValue.name = data.name;
        returnValue.properties = data.properties ? data.properties : null;
        returnValue.description = data.description;
        returnValue.thumbnail = data.data != null && data.data != undefined && data.data.thumbnail ? data.data.thumbnail : data.thumbnail;
        returnValue.asset = data.data != null && data.data != undefined && data.data.image ? data.data.image : data.image;
        returnValue.kind = data.data != null && data.data != undefined && data.data.kind ? data.data.kind : data.kind;
        returnValue.size = data.data != null && data.data != undefined && data.data.size ? data.data.size: data.size;
        returnValue.adult = data.adult ? data.adult : false;
        return returnValue;
    },

    parseCustom: async function(data, token) {
        let returnValue = {};

        returnValue.tokenJsonVersion = 1;
        returnValue.name = data.name;
        returnValue.size = 0;
        returnValue.adult = false;
        returnValue.description = data.description;

        let image = data.image;
        image = image.replace("https://gateway.pinata.cloud", "https://ipfs.pasarprotocol.io");
        image = image.replace("ipfs://", "https://ipfs.pasarprotocol.io/ipfs/");
        image = image.replace("ipfs.ela.city", "ipfs.pasarprotocol.io");

        returnValue.thumbnail = image;
        returnValue.asset = image;

        if(data.type) {
            returnValue.type = data.type;
            returnValue.kind = data.type;
        } else if(data.properties && data.properties.files && data.properties.files[0].type) {
            returnValue.type = data.properties.files[0].type;
            returnValue.kind = data.properties.files[0].type;
        } else {
            returnValue.type = 'image';
            returnValue.kind = 'image';
        }

        if(data.attribute) {
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
        }
        

        return returnValue;
    },

    parsePrimates: function(data) {
        let returnValue = {};
        returnValue.tokenJsonVersion = 1;
        returnValue.type = 'image';
        returnValue.name = data.name;
        returnValue.description = data.description;
        returnValue.thumbnail = data.image;
        returnValue.asset = data.image;
        returnValue.kind = 'image';
        returnValue.size = 0;
        returnValue.adult = false;
        return returnValue;
    },

    parseVitrim: async function(data, token) {
        let returnValue = {};

        returnValue.tokenJsonVersion = 1;
        returnValue.type = data.type;
        returnValue.name = data.name;
        returnValue.description = data.description;
        returnValue.thumbnail = data.image.replace("ipfs://", "https://ipfs.pasarprotocol.io/ipfs/");
        returnValue.asset = data.image.replace("ipfs://", "https://ipfs.pasarprotocol.io/ipfs/");
        returnValue.kind = data.type;
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
        
        return returnValue;
    },

    parseBella: function(data) {
        let returnValue = {};
        returnValue.tokenJsonVersion = 1;
        returnValue.type = 'image';
        returnValue.name = data.name;
        returnValue.description = data.description;
        returnValue.thumbnail = data.image.replace("https://gateway.pinata.cloud/ipfs", "https://ipfs.pasarprotocol.io/ipfs");;
        returnValue.asset = data.image.replace("https://gateway.pinata.cloud/ipfs", "https://ipfs.pasarprotocol.io/ipfs");;
        returnValue.kind = 'image';
        returnValue.size = 0;
        returnValue.adult = false;
        return returnValue;
    },

    parsePhantz: async function(data, token) {
        let returnValue = {};

        returnValue.tokenJsonVersion = 1;
        returnValue.type = "image";
        returnValue.name = data.name;
        returnValue.description = data.description;
        returnValue.thumbnail = data.image.replace("ipfs.ela.city", "ipfs.pasarprotocol.io");
        returnValue.asset = data.image.replace("ipfs.ela.city", "ipfs.pasarprotocol.io");
        returnValue.kind = "image";
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

        return returnValue;
    },

    parseLudmila: function(data) {
        let returnValue = {};
        returnValue.tokenJsonVersion = 1;
        returnValue.type = 'image';
        returnValue.name = data.name;
        returnValue.description = data.description;
        returnValue.thumbnail = data.image;
        returnValue.asset = data.image;
        returnValue.kind = 'image';
        returnValue.size = 0;
        returnValue.adult = false;
        return returnValue;
    },

    parseEliens: async function(data, token) {
        let returnValue = {};

        returnValue.tokenJsonVersion = 1;
        returnValue.type = data.type;
        returnValue.name = data.name;
        returnValue.description = data.description;
        returnValue.thumbnail = data.image.replace("ipfs://", "https://ipfs.pasarprotocol.io/ipfs/");
        returnValue.asset = data.image.replace("ipfs://", "https://ipfs.pasarprotocol.io/ipfs/");
        returnValue.kind = data.type;
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
        return returnValue;
    },

    parseBunnyLottery: function(data) {
        let returnValue = {};
        returnValue.tokenJsonVersion = 1;
        returnValue.type = 'image';
        returnValue.name = data.name;
        returnValue.description = data.description;
        returnValue.thumbnail = data.image.replace("https://gateway.pinata.cloud/ipfs", "https://ipfs.pasarprotocol.io/ipfs");
        returnValue.asset = data.image.replace("https://gateway.pinata.cloud/ipfs", "https://ipfs.pasarprotocol.io/ipfs");
        returnValue.kind = 'image';
        returnValue.size = 0;
        returnValue.adult = false;
        return returnValue;
    },

    parseHeralds: async function(data, token) {
        let returnValue = {};

        returnValue.tokenJsonVersion = 1;
        returnValue.type = data.type;
        returnValue.name = data.name;
        returnValue.description = data.description;
        returnValue.thumbnail = data.image.replace("ipfs://", "https://ipfs.pasarprotocol.io/ipfs/");
        returnValue.asset = data.image.replace("ipfs://", "https://ipfs.pasarprotocol.io/ipfs/");
        returnValue.kind = data.type;
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
        
        return returnValue;
    },

    parseBirdie: async function(data, token) {
        let returnValue = {};
        returnValue.tokenJsonVersion = 1;
        returnValue.type = data.type;
        returnValue.name = data.name;
        returnValue.description = data.description;
        returnValue.thumbnail = data.image.replace("ipfs://", "https://ipfs.pasarprotocol.io/ipfs/");
        returnValue.asset = data.image.replace("ipfs://", "https://ipfs.pasarprotocol.io/ipfs/");
        returnValue.kind = data.type;
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
        
        return returnValue;
    },
}
