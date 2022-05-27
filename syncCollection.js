const schedule = require('node-schedule');
let Web3 = require('web3');
let config = require('./config');
const token1155ABI = require("./contractABI/token1155ABI");
const token721ABI = require("./contractABI/token721ABI");

let jobService = require('./service/jobService');
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
const config_test = require("./config_test");
config = config.curNetwork == 'testNet'? config_test : config;
global.fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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

let is721 = false;
let token = '0x020c7303664bc88ae92cE3D380BF361E03B78B81';
let tokenContractWs = new web3Ws.eth.Contract(is721 ? token721ABI : token1155ABI, token);
let tokenContract = new web3Rpc.eth.Contract(is721 ? token721ABI : token1155ABI, token);
let conllectionJobCurrent = 7744408;

const step = 20000;
web3Rpc.eth.getBlockNumber().then(currentHeight => {
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

        tokenContractWs.getPastEvents('TransferSingle', {
            fromBlock: conllectionJobCurrent, toBlock
        }).then(events => {
            events.forEach(async event => {
                jobService.dealWithUsersToken(event, token, is721, tokenContract, web3Rpc)
            })
            conllectionJobCurrent = toBlock + 1;
        }).catch(error => {
            console.log(error);
            console.log("[Collection] Sync Ending ...")
        })
    });
})
