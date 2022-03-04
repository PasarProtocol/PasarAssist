let express = require('express');
let router = express.Router();
const authService = require('../../service/authService');

router.get('/getCredentials/:address', function(req, res) {
  authService.getCredentials(req.params.address).then(result => {
      res.json(result);
  }).catch(error => {
      console.log(error);
      res.json({code: 500, message: 'server error'});
  })
});

module.exports = router;