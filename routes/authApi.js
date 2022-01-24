let { VerifiablePresentation } = require('@elastosfoundation/did-js-sdk');
let express = require('express');
let router = express.Router();
let jwt = require('jsonwebtoken');
const config = require("../config");
let { dbService } = require('../service/authDBService');

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

    // First check if we know this user yet or not. If not, we will create an entry
    let existingUser = await dbService.findUserByDID(did);
    let user;
    if (existingUser) {
        // Nothing to do yet
        logger.info("Existing user is signing in", existingUser);
        user = existingUser;
    }
    else {
        logger.info("Unknown user is signing in with DID", did, ". Creating a new user");

        // Optional name
        let nameCredential = vp.getCredential(`name`);
        let name = nameCredential ? nameCredential.getSubject().getProperty('name') : '';

        // Optional email
        let emailCredential = vp.getCredential(`email`);
        let email = emailCredential ? emailCredential.getSubject().getProperty('email') : '';

        user = {
            did,
            type: 'user',
            name,
            email,
            canManageAdmins: false
        };
        let result = await dbService.addUser(user);
        if (result.code != 200) {
            res.json(result);
            return;
        }

        /* let matchedCount = await dbService.updateUser(did, name, email);
        if (matchedCount !== 1) {
            res.json({ code: 400, message: 'User does not exist' })
            return;
        } */
    }

    let token = jwt.sign(user, config.Auth.jwtSecret, { expiresIn: 60 * 60 * 24 * 7 });
    res.json({ code: 200, message: 'success', data: token });
})
module.exports = router;
