const schedule = require('node-schedule');
let Web3 = require('web3');
let config = require('../config');
const token1155ABI = require("../contractABI/token1155ABI");
const token721ABI = require("../contractABI/token721ABI");
const { scanEvents, saveEvent } = require("./utils");

let jobService = require('../service/jobService');

let web3Rpc = new Web3(config.escRpcUrl);

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

if (require.main == module) {
    (async () => {
      await getTotalEvents();
    })();
}