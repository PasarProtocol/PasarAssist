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
    pasarContractDeploy: 7744408,
    stickerContractDeploy: 7744408,
    galleriaContractDeploy: 10527413,

    ipfsNodeUrl:  "https://ipfs.pasarprotocol.io/ipfs/",

    serviceName: 'default',
    upgradeBlock: 9607086,
    elastos_transation_api_url: 'https://esc.elastos.io/api?module=transaction&action=gettxinfo&txhash=',
    Auth: {
        jwtSecret: 'pasar', // Used to encode JWT tokens
    },
    burnAddress: '0x0000000000000000000000000000000000000000',
    cmcApiKeys: [
        "521e2027-4f7e-4fa3-8a13-37ba061023f4",
        "4fa7c6d7-5725-4342-a189-7d0cef2b906b",
        "1b6a40f4-8c0f-4605-8502-6d3385da0db1",
        "355418f4-6912-45f1-8ea6-b16a235b3859",
        "2192fabc-19cc-4f97-8bc8-67cdbe6f1cc2",
        "2ea8215e-022d-4d65-b8d8-48dee70daa9e",
        "c6d2dedb-c75c-4bbe-8e59-80dcd49145e6"
    ],
    curNetwork: 'testNet'
}
