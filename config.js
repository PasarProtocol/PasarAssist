module.exports = {
    mongodb: 'mongodb://localhost:27017',
    dbName: 'feeds_sources',
    dbUser: '',
    dbPass: '',

    mailHost: 'smtp.qq.com',
    mailPort: 465,
    mailUser: '445222754',
    mailPass: '',
    mailFrom: '445222754@qq.com',

    escWsUrl: 'wss://api.elastos.io/eth-ws',
    escRpcUrl: 'https://api.elastos.io/eth',

    pasarContract: '0x02E8AD0687D583e2F6A7e5b82144025f30e26aA0',
    stickerContract: '0x020c7303664bc88ae92cE3D380BF361E03B78B81',
    galleriaContract: '',
    pasarContractDeploy: 7744408,
    stickerContractDeploy: 7744408,
    galleriaContractDeploy: 0,

    ipfsNodeUrl:  "http://ipfs.pasarprotocol.io/ipfs/",

    serviceName: 'default',
    upgradeBlock: 9607086,
    elastos_transation_api_url: 'https://esc.elastos.io/api?module=transaction&action=gettxinfo&txhash=',
    Auth: {
        jwtSecret: 'pasar', // Used to encode JWT tokens
    },
    burnAddress: '0x0000000000000000000000000000000000000000',
    cmcApiKeys: [],
    curNetwork: 'mainNet'
}
