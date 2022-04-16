let config = require("../config");
const config_test = require("../config_test");
const stickerDBService = require("./stickerDBService");
const token1155ABI = require("../contractABI/token1155ABI");
const token721ABI = require("../contractABI/token721ABI");
config = config.curNetwork == 'testNet'? config_test : config;
module.exports = {

    getInfoByIpfsUri: async function(uri) {
        console.log(uri, 'this is ipfs method')
        let tokenCID = uri.split(":")[2];
        let response = await fetch(config.ipfsNodeUrl + tokenCID);
        return await response.json();
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

        let [result, txInfo, blockInfo] = await this.makeBatchRequest([
            {method: tokenContract.methods.tokenURI(tokenInfo._id).call, params: {}},
            {method: web3Rpc.eth.getTransaction, params: event.transactionHash},
            {method: web3Rpc.eth.getBlock, params: event.blockNumber}
        ], web3Rpc)

        let gasFee = txInfo.gas * txInfo.gasPrice / (10 ** 18);

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
        await stickerDBService.addEvent(tokenEventDetail)

        let tokenDetail = {
            token,
            tokenId: tokenInfo._id,
            blockNumber: event.blockNumber,
            quantity: check721 ? 1 : parseInt(tokenInfo._value),
            royalties: 0,
            royaltyOwner: "",
            holder: "",
            createTime: blockInfo.timestamp,
            updateTime: blockInfo.timestamp,
            tokenIdHex: '0x' + BigInt(tokenInfo._id).toString(16),
            tokenJsonVersion: data.version,
            type: data.type,
            name: data.name,
            description: data.description,
            thumbnail: data.data.thumbnail,
            asset: data.data.image,
            kind: data.data.kind,
            size: data.data.size,
            adult: data.adult,
            price: 0,
            marketTime: 0,
            status: "Not on sale",
            endTime: 0,
            orderId: ""
        }

        await stickerDBService.replaceToken(tokenDetail);
    },

    startupUsersContractEvents: async function (web3Ws, web3Rpc) {
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
