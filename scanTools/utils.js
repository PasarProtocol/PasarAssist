let stickerDBService = require('../service/stickerDBService');

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

const saveEvent = async(event) => {
  let blockNumber = event.blockNumber;
  let eventType = event.event;
  let info = event.returnValues;

  let data = {
    blockNumber,
    eventType,
    info,
    eventData: event,
    createdAt: new Date()
  }

  await stickerDBService.saveSyncTemp(data);
}

module.exports = {
  scanEvents,
  saveEvent,
};
