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
    pasarV2Contract: '0x5883aC1b7FE1b7Ff5074795b79F1E6f7D287E96E',
    stickerV2Contract: '0xffAc03BC5bd4F9C6Cc262c10D03704855550354B',
    dexSwapContract: '0x1B4814c87827369BF40973CE769D56635892e033',
    pasarRegisterContract: '0xCA57114495c9A7d74dE4E082868993990bee3f02',
    diaTokenContract: '0x85946E4b6AB7C5c5C60A7b31415A52C0647E3272',

    pasarContractDeploy: 7377671,
    stickerContractDeploy: 7377671,
    pasarV2ContractDeploy: 11365846,
    stickerV2ContractDeploy: 11365829,
    galleriaContractDeploy: 10242686,
    pasarRegisterContractDeploy: 11365844,
    dexSwapContractDeploy: 11365848,
    diaTokenContractDeploy: 10433331,

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
