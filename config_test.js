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

    ethWsUrl: 'wss://ropsten.infura.io/ws/v3/02505ed478e64ee481a74236dc9e91f1',
    ethRpcUrl: 'https://ropsten.infura.io/v3/02505ed478e64ee481a74236dc9e91f1',

    pasarContract: '0x2652d10A5e525959F7120b56f2D7a9cD0f6ee087',
    stickerContract: '0xed1978c53731997f4DAfBA47C9b07957Ef6F3961',
    galleriaContract: '0x8b3c7Fc42d0501e0367d29426421D950f45F5041',
    pasarV2Contract: '0xA9bBf0F9FB45Db6396D8e583DB69C13bA8C086A8',
    stickerV2Contract: '0x68da537d387b874A1E06b7a951d622E4037F3680',
    pasarRegisterContract: '0x930f675Ee9Bc62e37ef672c88158253dc65A63A0',
    diaTokenContract: '0x85946E4b6AB7C5c5C60A7b31415A52C0647E3272',

    pasarEthContract: '0x61EAE56bc110249648fB9eAe7eA4cfa185e0A498',
    stickerEthContract: '0xed1978c53731997f4DAfBA47C9b07957Ef6F3961',
    pasarEthRegisterContract: '0xC1d40312232ec4b308E69713A98c3A2b21c8F5E0',

    pasarContractDeploy: 7377671,
    stickerContractDeploy: 7377671,
    pasarV2ContractDeploy: 13278867,
    stickerV2ContractDeploy: 13278856,
    galleriaContractDeploy: 10242686,
    pasarRegisterContractDeploy: 13278856,
    
    pasarEthContractDeploy: 12565400,
    stickerEthContractDeploy: 12549901,
    pasarEthRegisterContractDeploy: 12565395,

    ipfsNodeUrl: 'https://ipfs-test.pasarprotocol.io/ipfs/',

    serviceName: 'default',
    upgradeBlock: 9090468,
    elastos_transation_api_url: 'https://esc-testnet.elastos.io/api?module=transaction&action=gettxinfo&txhash=',
    Auth: {
        jwtSecret: 'pasar', // Used to encode JWT tokens
    },
    burnAddress: '0x0000000000000000000000000000000000000000',
    cmcApiKeys: [
        
    ],
    ELAToken:'0x0000000000000000000000000000000000000000',
    ELATokenOnETH:'0x8c947E0fA67e91370587076A4108Df17840e9982',
    DefaultToken:'0x0000000000000000000000000000000000000000',
    listToken: [
        '0x0000000000000000000000000000000000000000',
        "0x2C8010Ae4121212F836032973919E8AeC9AEaEE5",
        "0x517E9e5d46C1EA8aB6f78677d6114Ef47F71f6c4",
        "0xd39eC832FF1CaaFAb2729c76dDeac967ABcA8F27",
        "0xE1C110E1B1b4A1deD0cAf3E42BfBdbB7b5d7cE1C",
        "0xA06be0F5950781cE28D965E5EFc6996e88a8C141",
        "0x75740FC7058DA148752ef8a9AdFb73966DEb42a8",
        "0x9f1d0Ed4E041C503BD487E5dc9FC935Ab57F9a57",
    ],
    elaChain: 1,
    ethChain: 2
}
