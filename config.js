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
    pasarV2Contract: '0xaeA699E4dA22986eB6fa2d714F5AC737Fe93a998',
    stickerV2Contract: '0xF63f820F4a0bC6E966D61A4b20d24916713Ebb95',
    pasarRegisterContract: '0x3d0AD66765C319c2A1c6330C1d815608543dcc19',
    diaTokenContract: '0x2C8010Ae4121212F836032973919E8AeC9AEaEE5',

    pasarContractDeploy: 7744408,
    stickerContractDeploy: 7744408,
    galleriaContractDeploy: 10527413,
    pasarV2ContractDeploy: 12698149,
    stickerV2ContractDeploy: 12695430,
    pasarRegisterContractDeploy: 12698059,

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
