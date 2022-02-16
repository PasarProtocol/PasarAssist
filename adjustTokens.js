let stickerDBService = require('./service/stickerDBService');
let log4js = require('log4js');
const { exit } = require('process');
log4js.configure({
    appenders: {
        file: { type: 'dateFile', filename: 'logs/pasar.log', pattern: ".yyyy-MM-dd.log", compress: true, },
        console: { type: 'stdout'}
    },
    categories: { default: { appenders: ['file', 'console'], level: 'info' } },
    pm2: true,
    pm2InstanceVar: 'INSTANCE_ID'
});
global.logger = log4js.getLogger('default');
stickerDBService.updateTokens().then(()=> {
    exit();
});
