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
    pasarV2Contract: '0xAC4294D1945fcE4aBEC5D95d3946D1d6F6B53940',
    stickerV2Contract: '0x3FFDA81fCa4550133cC3D9BbE83749c4be5A39b9',
    dexSwapContract: '0xB838B63Eb9AEc710f781787E221aAB06594233EF',
    pasarRegisterContract: '0x7cD2f66394fbb4B2F630e58b068CEa4B4D996738',
    diaTokenContract: '0x85946E4b6AB7C5c5C60A7b31415A52C0647E3272',
    token721Contract: '0x32e36240eA2CDe9128A510901a9689E92EBe8ac1',

    token1155Contract: '0x52aDF83463Afe415ab48Da0C38DAA03211C580dC',

    pasarContractDeploy: 7377671,
    stickerContractDeploy: 7377671,
    pasarV2ContractDeploy: 12241019,
    stickerV2ContractDeploy: 12241002,
    galleriaContractDeploy: 10242686,
    pasarRegisterContractDeploy: 12241006,
    dexSwapContractDeploy: 12241013,
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
