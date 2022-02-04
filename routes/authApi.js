let { VerifiablePresentation } = require('@elastosfoundation/did-js-sdk');
let express = require('express');
let router = express.Router();
let jwt = require('jsonwebtoken');
const config = require("../config");

// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.post('/login', async (req, res) => {
    let presentationStr = req.body;
    let vp = VerifiablePresentation.parse(presentationStr);
    let valid = await vp.isValid();
    if (!valid) {
        res.json({ code: 403, message: 'Invalid presentation' });
        return;
    }

    let did = vp.getHolder().toString();
    if (!did) {
        res.json({ code: 400, message: 'Unable to extract owner DID from the presentation' })
        return;
    }

    logger.info("Unknown user is signing in with DID", did, ". Creating a new user");

    // Optional name
    let nameCredential = vp.getCredential(`name`);
    let name = nameCredential ? nameCredential.getSubject().getProperty('name') : '';

    // Optional email
    let emailCredential = vp.getCredential(`email`);
    let email = emailCredential ? emailCredential.getSubject().getProperty('email') : '';

    let user = {
        did,
        type: 'user',
        name,
        email,
        canManageAdmins: false
    };

    let token = jwt.sign(user, config.Auth.jwtSecret, { expiresIn: 60 * 60 * 24 * 7 });
    res.json({ code: 200, message: 'success', data: token });
})
module.exports = router;
