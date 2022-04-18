let config = require("../config");
const config_test = require("../config_test");
const token1155ABI = require("../contractABI/token1155ABI");
const token721ABI = require("../contractABI/token721ABI");
config = config.curNetwork == 'testNet'? config_test : config;

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

    dealWithUsersToken: async function(event, token, check721, tokenContract, web3Rpc, baseToken) {
        let tokenInfo = event.returnValues;
        console.log(tokenInfo);
        let [result, txInfo, blockInfo] = await this.makeBatchRequest([
            {method: check721 ? tokenContract.methods.tokenURI(tokenInfo._id).call : tokenContract.methods.uri(tokenInfo._id).call, params: {}},
            {method: web3Rpc.eth.getTransaction, params: event.transactionHash},
            {method: web3Rpc.eth.getBlock, params: event.blockNumber}
        ], web3Rpc)

        let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);
        console.log("URI: " + result)
        let data = await this.getInfoByIpfsUri(result);
        
        let tokenEventDetail = {
            tokenId: tokenInfo._id,
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
            tokenId: tokenInfo._id,
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
            tokenDetail.tokenIdHex = '0x' + BigInt(tokenInfo._id).toString(16);
            tokenDetail.tokenJsonVersion = data.version;
            tokenDetail.type = data.type;
            tokenDetail.name = data.name;
            tokenDetail.description = data.description;
            tokenDetail.thumbnail = data.data.thumbnail;
            tokenDetail.asset = data.data.image;
            tokenDetail.kind = data.data.kind;
            tokenDetail.size = data.data.size;
            tokenDetail.adult = data.adult;
            tokenDetail.baseToken = token;
        } else if(tokenInfo._to == burnAddress) {
            tokenDetail.holder = burnAddress;
        } else if(tokenInfo._to == token) {
            tokenDetail.status = "MarketSale";
        } else {
            tokenDetail.status = "Not on sale";
            tokenDetail.holder = tokenInfo._to;
        }
        console.log(JSON.stringify(tokenDetail));
        await stickerDBService.replaceToken(tokenDetail);
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
    }
}
