let Web3 = require('web3');
let config = require('../config');
let stickerContractABI = require('../contractABI/stickerABI');
let jobService = require('../service/jobService');
let config_test = require("../config_test");
let stickerDBService = require('../service/stickerDBService');

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

config = config.curNetwork == 'testNet'? config_test : config;

let web3Rpc = new Web3(config.escRpcUrl);
let stickerContract = new web3Rpc.eth.Contract(stickerContractABI, config.stickerContract);

module.exports = {
    dealWithNewToken: async function(blockNumber,tokenId) {
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
    
}