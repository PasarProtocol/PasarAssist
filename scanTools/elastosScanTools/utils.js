let Web3 = require('web3');
let stickerDBService = require('../../service/stickerDBService');
let jobService = require('../../service/jobService');
let config = require('../../config');
let config_test = require("../../config_test");
config = config.curNetwork == 'testNet'? config_test : config;

let DB_SYNC = 'pasar_sync_temp';

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

const scanEvents = async(conObj, evName, startBlock, endBlock) => {
  try {
    if (!evName) {
      evName = "allEvents";
    }
    if (!startBlock) {
      startBlock = "earliest";
    }
    if (!endBlock) {
      endBlock = "latest";
    }
    const events = await conObj.getPastEvents(evName, {fromBlock: startBlock, toBlock: endBlock});
    return events;
  } catch (err) {
    console.error(String(err));
    return;
  }
};

const saveEvent = async(event, db, baseToken) => {
  let blockNumber = event.blockNumber;
  let eventType = event.event;
  let info = event.returnValues;

  let data = {
    blockNumber,
    eventType,
    info,
    eventData: event,
    createdAt: new Date(),
    baseToken: baseToken
  }

  await stickerDBService.saveSyncTemp(data, db);
}

const dealWithNewToken = async (stickerContract, web3Rpc, blockNumber,tokenId, baseToken, marketPlace) => {
  try {
      let [result] = await jobService.makeBatchRequest([
          {method: stickerContract.methods.tokenInfo(tokenId).call, params: {}},
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
      token.baseToken = baseToken;

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
      token.sold = 0;
      token.listed = 0;
      token.marketPlace = marketPlace;
      let name = token.asset.replace("pasar:image:", "").replace("feeds:imgage:", "");
      console.log(name);
      await jobService.downloadImage(name);
      await stickerDBService.replaceToken(token);
  } catch (e) {
      logger.info(`[TokenInfo] Sync error at ${blockNumber} ${tokenId}`);
      logger.info(e);
  }
}

module.exports = {
  scanEvents,
  saveEvent,
  dealWithNewToken,
  config,
  DB_SYNC,
};
