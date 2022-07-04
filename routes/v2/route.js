let express = require('express');
let pasarApi = require('./pasarApi');
let stickerApi = require('./stickerApi');

let app = express();
app.use('/pasar', pasarApi);
app.use('/sticker', stickerApi);

module.exports = app;