const schedule = require('node-schedule');
let Web3 = require('web3');

const token1155ABI = require("../contractABI/token1155ABI");
const token721ABI = require("../contractABI/token721ABI");
const pasarRegisterContractABI = require('../contractABI/pasarRegisterABI');

const { scanEvents, saveEvent, config } = require("./utils");
let jobService = require('../service/jobService');
let stickerDBService = require('../service/stickerDBService');
let pasarDBService = require('../service/pasarDBService');

let web3Rpc = new Web3(config.escRpcUrl);
let pasarRegisterContract = new web3Rpc.eth.Contract(pasarRegisterContractABI, config.pasarRegisterContract);
let DB_REGISTER = "pasar_sync_register";
let DB_SYNC = 'pasar_sync_temp';

let listCollection = [                       
    {name: "Bunny", address: '0xE27934fB3683872e35b8d9E57c30978e1260c614'},
    {name: "Samurai", address: '0x26b2341d10dC4118110825719BF733a571AB6EC5'},
    {name: "Bella", address: '0xef5f768618139d0f5Fa3bcbbBcaAf09Fe9d7A07d'},
    {name: "Meta", address: '0xcB262A92e2E3c8C3590b72A1fDe3c6768EE08B7e'},
    {name: "Phantz", address: '0xfDdE60866508263e30C769e8592BB0f8C3274ba7'},
];

const getTotalEvents = async (startBlock, endBlock) => {

    for(let collection of listCollection) {
        let tokenContract = new web3Rpc.eth.Contract(token721ABI, collection.address);

        let [is721, is1155] = await jobService.makeBatchRequest([
            {method: tokenContract.methods.supportsInterface('0x80ac58cd').call, params: {}},
            {method: tokenContract.methods.supportsInterface('0xd9b67a26').call, params: {}},
        ], web3Rpc)
    
        if(!is721 && is1155) {
            tokenContract = new web3Rpc.eth.Contract(token1155ABI, collection.address);
        }
    
        let getAllEvents = await scanEvents(tokenContract, is721 ? 'Transfer' : 'TransferSingle', startBlock, endBlock);
        console.log(`collection name: ${collection.name} collectible count: ${getAllEvents.length}`);

        for (let item of getAllEvents) {
            await jobService.dealWithUsersToken(item, collection.address, is721, tokenContract, web3Rpc)
        }
    }
};

async function tempCollectiblesOfCollection() {
    let collections = await stickerDBService.getImportedCollection();
    console.log(collections);
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

async function tokenRegistered(event) {
    let registeredTokenInfo = event.returnValues;

    let registeredTokenDetail = {token: registeredTokenInfo._token, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id}

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
        registeredTokenInfo._name, registeredTokenInfo._uri, symbol, check721, event.blockNumber, data);
}

async function tokenRoyaltyChanged(event) {
    let orderInfo = event.returnValues;
    let orderEventDetail = {token: orderInfo._token, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id}

    await stickerDBService.collectionEvent(orderEventDetail);
    await stickerDBService.changeCollectionRoyalty(orderInfo._token, orderInfo._royaltyOwners, orderInfo._royaltyRates);
}

async function tokenInfoUpdated(event) {
    let updatedTokenInfo = event.returnValues;

    let updatedTokenDetail = {token: updatedTokenInfo._token, event: event.event, blockNumber: event.blockNumber,
        tHash: event.transactionHash, tIndex: event.transactionIndex, blockHash: event.blockHash,
        logIndex: event.logIndex, removed: event.removed, id: event.id}

    await stickerDBService.collectionEvent(updatedTokenDetail);
    await stickerDBService.updateCollection(updatedTokenInfo._token, updatedTokenInfo._name, updatedTokenInfo._uri, event.blockNumber);
}

const importCollectionRegister = async () => {
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
                        await tokenRegistered(cell.eventData);
                        break;
                    case "TokenRoyaltyChanged":
                        await tokenRoyaltyChanged(cell.eventData);
                        break;
                    case "TokenInfoUpdated":
                        await tokenInfoUpdated(cell.eventData);
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

const syncRegisterCollection = () => {
    web3Rpc.eth.getBlockNumber().then(async lastBlock => {
        let startBlock = config.pasarRegisterContractDeploy;

        while(startBlock < lastBlock) {
            await getTotalEventsOfRegister(startBlock, startBlock + 1000000);
            startBlock = startBlock + 1000000;
        };

        await importCollectionRegister();
        await tempCollectiblesOfCollection();
    });
}

module.exports = {
    syncRegisterCollection,
}