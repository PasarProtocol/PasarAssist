module.exports = {
    mongodb: 'mongodb://localhost:27017',
    dbName: 'feeds_sources_test',
    dbUser: '',
    dbPass: '',

    redisPort: 6379,
    redisHost: 'localhost',

    mailHost: '',
    mailPort: 465,
    mailUser: '',
    mailPass: '',
    mailFrom: '',

    escWsUrl: 'wss://api-testnet.elastos.io/eth-ws',
    escRpcUrl: 'https://api-testnet.elastos.io/eth',

    pasarContract: '0x2652d10A5e525959F7120b56f2D7a9cD0f6ee087',
    stickerContract: '0xed1978c53731997f4DAfBA47C9b07957Ef6F3961',
    galleriaContract: '0x8b3c7Fc42d0501e0367d29426421D950f45F5041',
    pasarV2Contract: '0xFb431A9c6519B76d444A7022a77511B3b192EEdd',
    stickerV2Contract: '0xcB13f1a8f68f17A7BCF91A946746930685ad233e',
    dexSwapContract: '0x16224d6eEBF832bABB99FA1e16B0036B54f7212a',
    pasarRegisterContract: '0xd40F5e6DcD004aDDd5149bDe397C12D954A1B7F4',

    pasarContractDeploy: 7377671,
    stickerContractDeploy: 7377671,
    pasarV2ContractDeploy: 11317296,
    stickerV2ContractDeploy: 10968230,
    galleriaContractDeploy: 10242686,
    pasarRegisterContractDeploy: 11317294,
    dexSwapContractDeploy: 11317298,

    ipfsNodeUrl: 'https://ipfs-test.pasarprotocol.io/ipfs/',

    serviceName: 'default',
    upgradeBlock: 9090468,
    elastos_transation_api_url: 'https://esc-testnet.elastos.io/api?module=transaction&action=gettxinfo&txhash=',
    Auth: {
        jwtSecret: 'pasar', // Used to encode JWT tokens
    },
    burnAddress: '0x0000000000000000000000000000000000000000',
    cmcApiKeys: [
        
    ]
}
