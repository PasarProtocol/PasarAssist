const schedule = require('node-schedule');
let Web3 = require('web3');
const token1155ABI = require("../contractABI/token1155ABI");
const token721ABI = require("../contractABI/token721ABI");
const { scanEvents, config } = require("./utils");

let jobService = require('../service/jobService');

let web3Rpc = new Web3(config.escRpcUrl);

let listCollection = [                       
    {name: "Bunny Lottery", address: '0x0954133d1a6E12d420602336643fbd6d61cdE91d'},
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