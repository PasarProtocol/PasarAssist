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
    pasarV2Contract: '0x14e3CEB7698C03a1714ed2d09C97A3e0d599Eb35',
    stickerV2Contract: '0x5637fd0632A297FDbe819C6b0F7d0E486D9e8C3F',
    dexSwapContract: '0xE74F6A2cC4d6830adf7cB9dCA34402733429E14B',
    pasarRegisterContract: '0x0B3d9c78E0e22b1c005AA74734aE0a973f1c60FE',
    diaTokenContract: '0x85946E4b6AB7C5c5C60A7b31415A52C0647E3272',

    pasarContractDeploy: 7377671,
    stickerContractDeploy: 7377671,
    pasarV2ContractDeploy: 11329374,
    stickerV2ContractDeploy: 11329357,
    galleriaContractDeploy: 10242686,
    pasarRegisterContractDeploy: 11329372,
    dexSwapContractDeploy: 11329376,
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
