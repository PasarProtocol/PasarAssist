let { VerifiablePresentation } = require('@elastosfoundation/did-js-sdk');
let express = require('express');
let router = express.Router();
let jwt = require('jsonwebtoken');
const config = require("../config");
const authService = require('../service/authService');

// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.get('/getCredentials', function(req, res) {
    authService.getCredentials(req.query.address).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});
module.exports = router;
