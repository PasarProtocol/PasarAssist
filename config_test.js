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
    pasarV2Contract: '0xE18bA7189E2Fe28B48aD83B0F4f0fc73447d6F66',
    stickerV2Contract: '0x2Fe55AE5a47F680064e2d9afd9FcDbEbdb04d1CE',
    dexSwapContract: '0x7dfef8C30e1B510F4Af807fa53d0328D0164aAA4',
    pasarRegisterContract: '0xa140CC39Cf636A40FB2Ffe127928b08B67d90564',
    diaTokenContract: '0x85946E4b6AB7C5c5C60A7b31415A52C0647E3272',
    token721Contract: '0x32e36240eA2CDe9128A510901a9689E92EBe8ac1',

    token1155Contract: '0x52aDF83463Afe415ab48Da0C38DAA03211C580dC',

    pasarContractDeploy: 7377671,
    stickerContractDeploy: 7377671,
    pasarV2ContractDeploy: 11693711,
    stickerV2ContractDeploy: 11693695,
    galleriaContractDeploy: 10242686,
    pasarRegisterContractDeploy: 11693699,
    dexSwapContractDeploy: 11693705,
    diaTokenContractDeploy: 10433331,
    token721ContractDeploy: 11365833,
    token1155ContractDeploy: 11365831,
    
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
