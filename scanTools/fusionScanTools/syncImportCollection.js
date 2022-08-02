/**
    sync the importing collections and nfts on ethereum network
*/

const schedule = require('node-schedule');
let Web3 = require('web3');

const token1155ABI = require("../../contractABI/token1155ABI");
const token721ABI = require("../../contractABI/token721ABI");
const pasarRegisterContractABI = require('../../contractABI/pasarRegisterABI');

const { scanEvents, saveEvent, config, DB_SYNC } = require("./utils");
let jobService = require('../../service/jobService');
let stickerDBService = require('../../service/stickerDBService');
let pasarDBService = require('../../service/pasarDBService');

let web3Rpc = new Web3(config.fusion.rpcUrl);
let pasarRegisterContract = new web3Rpc.eth.Contract(pasarRegisterContractABI, config.fusion.pasarRegisterContract);
let DB_REGISTER = "pasar_sync_register_fusion";

const transferCustomCollection = async (event, token, marketPlace) => {
    let tokenContract = new web3Rpc.eth.Contract(token721ABI, token);

    let [is721, is1155] = await jobService.makeBatchRequest([
        {method: tokenContract.methods.supportsInterface('0x80ac58cd').call, params: {}},
        {method: tokenContract.methods.supportsInterface('0xd9b67a26').call, params: {}},
    ], web3Rpc)

    if(!is721 && is1155) {
        tokenContract = new web3Rpc.eth.Contract(token1155ABI, token);
    }

    await jobService.dealWithUsersToken(event, token, is721, tokenContract, web3Rpc, marketPlace)
};

async function tempCollectiblesOfCollection() {
    let collections = await stickerDBService.getImportedCollection();
    for(let collection of collections) {
        if(collection.is721) {
            let tokenContract = new web3Rpc.eth.Contract(token721ABI, collection.token);

            let getAllEvents = await scanEvents(tokenContract, "Transfer");
            for (let item of getAllEvents) {
                await saveEvent(item, DB_SYNC, collection.token);
            }
        } else {
            let tokenContract = new web3Rpc.eth.Contract(token1155ABI, collection.token);

            let getAllEvents = await scanEvents(tokenContract, "TransferSingle");
            for (let item of getAllEvents) {
                await saveEvent(item, DB_SYNC, collection.token);
            }
        }
    }
}

async function tokenRegistered(event, marketPlace) {
    let registeredTokenInfo = event.returnValues;

    let registeredTokenDetail = {token: registeredTokenInfo._token, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, marketPlace}

    let tokenContract = new web3Rpc.eth.Contract(token721ABI, registeredTokenInfo._token);

    let [is721, is1155, symbol] = await jobService.makeBatchRequest([
        {method: tokenContract.methods.supportsInterface('0x80ac58cd').call, params: {}},
        {method: tokenContract.methods.supportsInterface('0xd9b67a26').call, params: {}},
        {method: tokenContract.methods.symbol().call, params: {}}
    ], web3Rpc)

    let data = await jobService.getInfoByIpfsUri(registeredTokenInfo._uri)

    let check721;
    if(is721){
        check721 = true;
    } else if(is1155) {
        check721 = false;
    }
    let creator = data && data.creator ? data.creator : null;
    
    if(creator) {
        await pasarDBService.updateDid({address: registeredTokenInfo._owner, did: creator});
    }

    await stickerDBService.collectionEvent(registeredTokenDetail);
    await stickerDBService.registerCollection(registeredTokenInfo._token, registeredTokenInfo._owner,
        registeredTokenInfo._name, registeredTokenInfo._uri, symbol, check721, event.blockNumber, data, marketPlace);
}

async function tokenRoyaltyChanged(event, marketPlace) {
    let orderInfo = event.returnValues;
    let orderEventDetail = {token: orderInfo._token, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, marketPlace}

    await stickerDBService.collectionEvent(orderEventDetail);
    await stickerDBService.changeCollectionRoyalty(orderInfo._token, orderInfo._royaltyOwners, orderInfo._royaltyRates, marketPlace);
}

async function tokenInfoUpdated(event, marketPlace) {
    let updatedTokenInfo = event.returnValues;

    let updatedTokenDetail = {token: updatedTokenInfo._token, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id, marketPlace}

    await stickerDBService.collectionEvent(updatedTokenDetail);
    await stickerDBService.updateCollection(updatedTokenInfo._token, updatedTokenInfo._name, updatedTokenInfo._uri, event.blockNumber, marketPlace);
}

const importCollectionRegister = async (marketPlace) => {
    let currentStep = 0;
    let step = 100;
    let totalCount = await stickerDBService.getCountSyncTemp(DB_REGISTER);
    console.log(totalCount);

    let totalStep = Math.ceil(totalCount/step);
    console.log(totalStep);
    try {
        while(currentStep < totalStep) {
            let listDoc = await stickerDBService.getSyncTemp(DB_REGISTER, currentStep, step);
            if(listDoc == null) {
                continue;
            }
            for(var i = 0; i < listDoc.length; i++) {
                let cell = listDoc[i];
                switch(cell.eventType) {
                    case "TokenRegistered":
                        await tokenRegistered(cell.eventData, marketPlace);
                        break;
                    case "TokenRoyaltyChanged":
                        await tokenRoyaltyChanged(cell.eventData, marketPlace);
                        break;
                    case "TokenInfoUpdated":
                        await tokenInfoUpdated(cell.eventData, marketPlace);
                        break;
                    
                } 
            }
            currentStep++;
        }
    } catch(err) {
        console.log(err);
    }
}

const getTotalEventsOfRegister = async (startBlock, endBlock) => {
    
    let getAllEvents = await scanEvents(pasarRegisterContract, "TokenRegistered", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_REGISTER);
    }
    console.log(`collection register count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarRegisterContract, "TokenRoyaltyChanged", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_REGISTER);
    }
    console.log(`collection royalty count: ${getAllEvents.length}`);

    getAllEvents = await scanEvents(pasarRegisterContract, "TokenInfoUpdated", startBlock, endBlock);

    for (let item of getAllEvents) {
        await saveEvent(item, DB_REGISTER);
    }
    console.log(`collection info update count: ${getAllEvents.length}`);
};

const syncRegisterCollection = async (marketPlace) => {
    let lastBlock = await web3Rpc.eth.getBlockNumber();
    let startBlock = config.fusion.pasarRegisterContractDeploy;
    while(startBlock < lastBlock) {
        await getTotalEventsOfRegister(startBlock, startBlock + 1000000);
        startBlock = startBlock + 1000000;
    };

    await importCollectionRegister(marketPlace);
    await tempCollectiblesOfCollection();
}

module.exports = {
    syncRegisterCollection,
    transferCustomCollection
}