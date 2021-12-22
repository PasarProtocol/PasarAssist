let express = require('express');
let router = express.Router();
let galleriaDBService = require('../service/galleriaDBService');


router.get('/listPanels', function (req, res) {
    let pageNumStr = req.query.pageNum;
    let pageSizeStr = req.query.pageSize;

    let pageNum, pageSize;
    try {
        if(pageNumStr) {
            pageNum = parseInt(pageNumStr);
            if(!pageSizeStr) {
                pageSize = 20;
            } else {
                pageSize = parseInt(pageSizeStr);
            }
        }

        if(pageNum < 1 || pageSize < 1) {
            res.json({code: 400, message: 'bad request'})
            return;
        }
    }catch (e) {
        console.log(e);
        res.json({code: 400, message: 'bad request'});
        return;
    }

    galleriaDBService.listPanels(pageNum, pageSize).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/getPanel', function (req, res) {
    let tokenId = req.query.tokenId;
    if(!tokenId) {
        res.json({code: 400, message: 'bad request'})
        return;
    }

    galleriaDBService.getPanel(tokenId).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})


module.exports = router;
