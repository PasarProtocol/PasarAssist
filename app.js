let express = require('express');
let cookieParser = require('cookie-parser');
let bodyParser = require('body-parser');
let indexRouter = require('./routes/index');
let pasarApi = require('./routes/pasarApi');
let stickerApi = require('./routes/stickerApi');
let galleriaApi = require('./routes/galleriaApi');
let authApi = require('./routes/authApi');
let apiV2 = require('./routes/apiV2');
let routeV2 = require('./routes/v2/route');
let jobs = require('./jobs');
let jobsV2 = require('./jobsV2');
const jobsEth = require('./jobsEth');
let log4js = require('log4js');
let cors = require('cors');
let { DefaultDIDAdapter } =  require('@elastosfoundation/did-js-sdk');
let {DIDBackend} = require('@elastosfoundation/did-js-sdk');

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
global.fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const corsOpts = {
    origin: '*',
  
    methods: [
      'GET',
      'POST',
    ],
  
    allowedHeaders: [
      'Content-Type',
    ],
};
  

let app = express();

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(log4js.connectLogger(logger, { level: log4js.levels.INFO }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors(corsOpts));
app.use(function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});
app.use('/feeds/api/v1', indexRouter);
app.use('/pasar/api/v1', pasarApi);
app.use('/sticker/api/v1', stickerApi);
app.use('/galleria/api/v1', galleriaApi);
app.use('/auth/api/v1', authApi);
app.use('/api/v2', routeV2);

let resolverUrl = "https://api.trinity-tech.cn/eid";
DIDBackend.initialize(new DefaultDIDAdapter(resolverUrl));

jobs.run()
jobsV2.run()
jobsEth.run();

module.exports = app;
