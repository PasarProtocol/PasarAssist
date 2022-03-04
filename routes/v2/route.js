let express = require('express');
let authApi = require('./authApi');
let galleriaApi = require('./galleriaApi');
let feedsApi = require('./index');
let pasarApi = require('./pasarApi');
let stickerApi = require('./stickerApi');

let app = express();
app.use('/auth', authApi);
app.use('/galleria', galleriaApi);
app.use('/feeds', feedsApi);
app.use('/pasar', pasarApi);
app.use('/sticker', stickerApi);

module.exports = app;