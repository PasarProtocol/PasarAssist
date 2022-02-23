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
    pasarContractDeploy: 7377671,
    stickerContractDeploy: 7377671,
    galleriaContractDeploy: 10242686,
  
    ipfsNodeUrl: 'https://ipfs-test.pasarprotocol.io/ipfs/',

    serviceName: 'default',
    upgradeBlock: 9090468,
    elastos_transation_api_url: 'https://esc-testnet.elastos.io/api?module=transaction&action=gettxinfo&txhash=',
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
    ]
}
