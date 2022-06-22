const schedule = require('node-schedule');
let Web3 = require('web3');
let config = require('../config');
const token1155ABI = require("../contractABI/token1155ABI");
const token721ABI = require("../contractABI/token721ABI");
const { scanEvents, saveEvent } = require("./utils");

let jobService = require('../service/jobService');

let web3Rpc = new Web3(config.escRpcUrl);

let listCollection = [                       
    {name: "Eliens Of Hedrom", address: '0x69Cf9fE4a56af7F0dFeE2E4E1a0B33b8D695e4bA'},
    {name: "Eliens Of Xenora", address: '0xe88b8e977939A3f79e2B045b9cE4365A3512800F'},
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

        for (var i = 0; i < getAllEvents.length; i++) {
            try {
                await jobService.dealWithUsersToken(getAllEvents[i], collection.address, is721, tokenContract, web3Rpc)
                logger.info(`collection name: ${collection.name} - current step: ${i+1} / ${getAllEvents.length}`);
            } catch(err) {
                logger.info(`collection name: ${collection.name} - failed step: ${i+1} / ${getAllEvents.length}`);
                logger.info(err);
            }
            
        }
    }
};

if (require.main == module) {
    (async () => {
      await getTotalEvents();
    })();
}