module.exports = {
    mongodb: 'mongodb://localhost:27017',
    dbName: 'feeds_sources',
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

    pasarContract: '0x02E8AD0687D583e2F6A7e5b82144025f30e26aA0',
    stickerContract: '0x020c7303664bc88ae92cE3D380BF361E03B78B81',
    galleriaContract: '0xE91F413953A82E15B92Ffb93818d8a7b87C3939B',
    pasarV2Contract: '0x19088c509C390F996802B90bdc4bFe6dc3F5AAA7',
    stickerV2Contract: '0x32496388d7c0CDdbF4e12BDc84D39B9E42ee4CB0',
    dexSwapContract: '0x7dfef8C30e1B510F4Af807fa53d0328D0164aAA4',
    pasarRegisterContract: '0x2b304ffC302b402785294629674A8C2b64cEF897',
    diaTokenContract: '0x85946E4b6AB7C5c5C60A7b31415A52C0647E3272',
    token721Contract: '0x32e36240eA2CDe9128A510901a9689E92EBe8ac1',
    token1155Contract: '0x52aDF83463Afe415ab48Da0C38DAA03211C580dC',

    pasarContractDeploy: 7744408,
    stickerContractDeploy: 7744408,
    galleriaContractDeploy: 10527413,
    stickerV2ContractDeploy: 12311834,
    galleriaContractDeploy: 10242686,
    pasarRegisterContractDeploy: 12311838,
    dexSwapContractDeploy: 11693705,
    diaTokenContractDeploy: 10433331,
    token721ContractDeploy: 11365833,
    token1155ContractDeploy: 11365831,

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
    curNetwork: 'testNet'
}
