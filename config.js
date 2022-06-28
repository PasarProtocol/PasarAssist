module.exports = {
    mongodb: 'mongodb://localhost:27017',
    dbName: 'feeds_sources_v2',
    dbUser: '',
    dbPass: '',

    redisPort: 6379,
    redisHost: 'localhost',

    mailHost: 'smtp.qq.com',
    mailPort: 465,
    mailUser: '445222754',
    mailPass: '',
    mailFrom: '445222754@qq.com',

    escWsUrl: 'wss://api.elastos.io/eth-ws',
    escRpcUrl: 'https://api.elastos.io/eth',

    ethWsUrl: 'wss://mainnet.infura.io/v3/8afb20a70e1047f19ed6f7419ba5381e',
    ethRpcUrl: 'https://mainnet.infura.io/v3/8afb20a70e1047f19ed6f7419ba5381e',

    pasarContract: '0x02E8AD0687D583e2F6A7e5b82144025f30e26aA0',
    stickerContract: '0x020c7303664bc88ae92cE3D380BF361E03B78B81',
    galleriaContract: '0xE91F413953A82E15B92Ffb93818d8a7b87C3939B',
    pasarV2Contract: '0xaeA699E4dA22986eB6fa2d714F5AC737Fe93a998',
    stickerV2Contract: '0xF63f820F4a0bC6E966D61A4b20d24916713Ebb95',
    pasarRegisterContract: '0x3d0AD66765C319c2A1c6330C1d815608543dcc19',
    diaTokenContract: '0x2C8010Ae4121212F836032973919E8AeC9AEaEE5',

    pasarEthContract: '0xC1c2f0f2b4A6e7aB99Bf588930Dcbb5dD6690F30',
    stickerEthContract: '0xA4b6ca4c59F2FA0c122e702ED6830fea48e635f9',
    pasarEthRegisterContract: '0x73c7fa921fE366aDcCC241E11A5A120198D2364c',

    pasarContractDeploy: 7744408,
    stickerContractDeploy: 7744408,
    galleriaContractDeploy: 10527413,
    pasarV2ContractDeploy: 12698149,
    stickerV2ContractDeploy: 12695430,
    pasarRegisterContractDeploy: 12698059,

    pasarEthContractDeploy: 12445478,
    stickerEthContractDeploy: 12445467,
    pasarEthRegisterContractDeploy: 12445472,

    ipfsNodeUrl:  "https://ipfs.pasarprotocol.io/ipfs/",

    serviceName: 'default',
    upgradeBlock: 9607086,
    elastos_transation_api_url: 'https://esc.elastos.io/api?module=transaction&action=gettxinfo&txhash=',
    Auth: {
        jwtSecret: 'pasar', // Used to encode JWT tokens
    },
    burnAddress: '0x0000000000000000000000000000000000000000',
    cmcApiKeys: [
    ],
    ELAToken:'0x0000000000000000000000000000000000000000',
    ELATokenOnETH:'0xe6fd75ff38Adca4B97FBCD938c86b98772431867',
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
    ethChain: 2,
    curNetwork: 'testNet'
}
