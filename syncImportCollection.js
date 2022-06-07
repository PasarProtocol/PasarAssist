const schedule = require('node-schedule');
let Web3 = require('web3');
let config = require('./config');
const token1155ABI = require("./contractABI/token1155ABI");
const token721ABI = require("./contractABI/token721ABI");

let jobService = require('./service/jobService');

const config_test = require("./config_test");
const stickerDBService = require('./service/stickerDBService');
config = config.curNetwork == 'testNet'? config_test : config;
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

let web3WsProvider = new Web3.providers.WebsocketProvider(config.escWsUrl, {
    clientConfig: {
        // Useful if requests are large
        maxReceivedFrameSize: 100000000,   // bytes - default: 1MiB
        maxReceivedMessageSize: 100000000, // bytes - default: 8MiB
        keepalive: true, // Useful to keep a connection alive
        keepaliveInterval: 60000 // ms
    },
    reconnect: {
        auto: true,
        delay: 5000,
        maxAttempts: 5,
        onTimeout: false,
    },
})
let web3Ws = new Web3(web3WsProvider);
let web3Rpc = new Web3(config.escRpcUrl);

let now = Date.now();

let token = '0x26b2341d10dC4118110825719BF733a571AB6EC5';
let conllectionJobCurrent = 11793633;

let tokenContractWs = new web3Ws.eth.Contract(token721ABI, token);
let tokenContract = new web3Rpc.eth.Contract(token721ABI, token);

const step = 10000;
web3Rpc.eth.getBlockNumber().then(async currentHeight => {
    console.log(currentHeight);
    let [is721, is1155] = await jobService.makeBatchRequest([
        {method: tokenContract.methods.supportsInterface('0x80ac58cd').call, params: {}},
        {method: tokenContract.methods.supportsInterface('0xd9b67a26').call, params: {}},
    ], web3Rpc)
    console.log(is721);

    if(!is721 && is1155) {
        tokenContractWs = new web3Ws.eth.Contract(token1155ABI, token);
        tokenContract = new web3Rpc.eth.Contract(token1155ABI, token);
    }

    schedule.scheduleJob({start: new Date(now + 60 * 1000), rule: '0 * * * * *'}, async () => {
        console.log(currentHeight);
        console.log(conllectionJobCurrent);
        if(conllectionJobCurrent > currentHeight) {
            console.log(`[Collection] Sync ${conllectionJobCurrent} finished`)
            return;
        }
        const tempBlockNumber = conllectionJobCurrent + step
        const toBlock = tempBlockNumber > currentHeight ? currentHeight : tempBlockNumber;

        console.log(`[Collection] Sync ${conllectionJobCurrent} ~ ${toBlock} ...`)

        tokenContractWs.getPastEvents(is721 ? 'Transfer' : 'TransferSingle', {
            fromBlock: conllectionJobCurrent, toBlock
        }).then(events => {
            events.forEach(async event => {
                await jobService.dealWithUsersToken(event, token, is721, tokenContract, web3Rpc)
            })
            conllectionJobCurrent = toBlock + 1;
        }).catch(error => {
            console.log(error);
            console.log("[Collection] Sync Ending ...")
        })
    });
})
