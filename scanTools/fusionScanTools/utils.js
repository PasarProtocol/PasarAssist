let Web3 = require('web3');
let stickerDBService = require('../../service/stickerDBService');
let jobService = require('../../service/jobService');
let config = require('../../config');
let config_test = require("../../config_test");
config = config.curNetwork == 'testNet'? config_test : config;

let DB_SYNC = 'pasar_sync_temp_fusion';

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

module.exports = {
  scanEvents,
  saveEvent,
  config,
  DB_SYNC,
};
