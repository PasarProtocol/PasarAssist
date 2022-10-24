/**
    sync the nfts of importing collection on ethereum network
*/

const schedule = require('node-schedule');
let Web3 = require('web3');
const token1155ABI = require("../../contractABI/token1155ABI");
const token721ABI = require("../../contractABI/token721ABI");
const { scanEvents, config } = require("./utils");

let jobService = require('../../service/jobService');
let { curNetwork } = require('../../config');

let web3Rpc = new Web3(config.fusion.rpcUrl);

// set the address list of imported collection
let listCollection = [                       
    {name: "Domain", address: '0xA1019535E6b364523949EaF45F4B17521c1cb074'},
];

const stepBlock = 10000;

const getTotalEvents = async (marketPlace, startBlock, endBlock) => {
    for(let collection of listCollection) {
        let tokenContract = new web3Rpc.eth.Contract(token721ABI, collection.address);

        let [is721, is1155] = await jobService.makeBatchRequest([
            {method: tokenContract.methods.supportsInterface('0x80ac58cd').call, params: {}},
            {method: tokenContract.methods.supportsInterface('0xd9b67a26').call, params: {}},
        ], web3Rpc)
        
        if(!is721 && is1155) {
            tokenContract = new web3Rpc.eth.Contract(token1155ABI, collection.address);
        }
        if(curNetwork != "testNet") {
            startBlock = await jobService.getFirstBlockNumberOnFusionChain(collection.address);
        }
        
        let lastBlock = await web3Rpc.eth.getBlockNumber();
        console.log(lastBlock);
        startBlock = 7576057;
        let endBlock = startBlock + stepBlock;

        while(startBlock < lastBlock) {
            console.log(startBlock + " - " + endBlock);
            let getAllEvents = await scanEvents(tokenContract, is721 ? 'Transfer' : 'TransferSingle', startBlock, endBlock);
            console.log(getAllEvents.length);
            for (var i = 0; i < getAllEvents.length; i++) {
                try {
                    await jobService.dealWithUsersToken(getAllEvents[i], collection.address, is721, tokenContract, web3Rpc, marketPlace)
                    logger.info(`collection name: ${collection.name} - current step: ${i+1} / ${getAllEvents.length}`);
                } catch(err) {
                    logger.info(`collection name: ${collection.name} - failed step: ${i+1} / ${getAllEvents.length}`);
                    logger.info(err);
                }
            }
            startBlock = endBlock + 1;
            endBlock = startBlock + stepBlock;
        }
        
    }
};

if (require.main == module) {
    (async () => {
      await getTotalEvents(config.fusion.chainType, 7576057);
    })();
}