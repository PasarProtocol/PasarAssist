let express = require('express');
let cookieParser = require('cookie-parser');
let bodyParser = require('body-parser');
let indexRouter = require('./routes/index');
let pasarApi = require('./routes/pasarApi');
let stickerApi = require('./routes/stickerApi');
let galleriaApi = require('./routes/galleriaApi');
let apiV2 = require('./routes/apiV2');
let jobs = require('./jobs');
let log4js = require('log4js');

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

let app = express();

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(log4js.connectLogger(logger, { level: log4js.levels.INFO }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/feeds/api/v1', indexRouter);
app.use('/pasar/api/v1', pasarApi);
app.use('/sticker/api/v1', stickerApi);
app.use('/galleria/api/v1', galleriaApi);
app.use('/api/v2', apiV2);

jobs.run()

module.exports = app;
