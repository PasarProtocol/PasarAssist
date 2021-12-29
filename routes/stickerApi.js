let express = require('express');
let router = express.Router();
let stickerDBService = require('../service/stickerDBService');
const BigNumber = require('bignumber.js');

router.get('/listStickers', function(req, res) {
    let pageNumStr = req.query.pageNum;
    let pageSizeStr = req.query.pageSize;
    let timeOrderStr = req.query.timeOrder;
    let pageNum, pageSize, timeOrder;

    try {
        pageNum = pageNumStr ? parseInt(pageNumStr) : 1;
        pageSize = pageSizeStr ? parseInt(pageSizeStr) : 10;
        timeOrder = timeOrderStr ? parseInt(timeOrderStr) : -1; 
        if(pageNum < 1 || pageSize < 1) {
            res.json({code: 400, message: 'bad request'})
            return;
        }
    }catch (e) {
        console.log(e);
        res.json({code: 400, message: 'bad request'});
        return;
    }

    stickerDBService.listStickers(pageNum, pageSize, timeOrder).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/search', function(req, res) {
    let keyword = req.query.key;

    if(!keyword) {
        res.json({code: 400, message: 'bad request'})
        return;
    }

    if(keyword.startsWith('0x') && keyword.length > 42) {
        keyword = new BigNumber(keyword).toFormat({prefix:""});
    }

    stickerDBService.search(keyword).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/query', function(req, res) {
    let owner = req.query.owner;
    let creator = req.query.creator;
    let typesStr = req.query.types;

    let types = undefined;
    if(typesStr !== undefined) {
        if(typeof typesStr !== "object") {
            types = [typesStr];
        } else {
            types = typesStr;
        }
        if(types[0] === 'image' || types[0] === 'avatar') {
            if(types[1] === 'feeds-channel' || types.length > 2) {
                res.json({code: 400, message: 'bad request'})
            }
        } else {
            if(types[0] === 'feeds-channel' && types.length > 1) {
                res.json({code: 400, message: 'bad request'})
            }
        }
    }

    if(!owner && !creator) {
        res.json({code: 400, message: 'bad request'})
        return;
    }

    stickerDBService.query(owner, creator, types).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/tokenTrans', function(req, res) {
    let tokenId = req.query.tokenId;

    if(!tokenId) {
        res.json({code: 400, message: 'bad request'})
        return;
    }

    if(tokenId.startsWith('0x') && tokenId.length > 42) {
        tokenId = new BigNumber(tokenId).toFormat({prefix:""});
    }

    stickerDBService.tokenTrans(tokenId).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/listTrans', function(req, res) {
    let pageNumStr = req.query.pageNum;
    let pageSizeStr = req.query.pageSize;
    let methodStr = req.query.method;
    let timeOrderStr = req.query.timeOrder;
    let pageNum, pageSize, method, timeOrder;

    try {
        pageNum = pageNumStr ? parseInt(pageNumStr) : 1;
        pageSize = pageSizeStr ? parseInt(pageSizeStr) : 10;
        method = methodStr ? methodStr : 'All';
        timeOrder = timeOrderStr ? parseInt(timeOrderStr) : -1; 
        if(pageNum < 1 || pageSize < 1) {
            res.json({code: 400, message: 'bad request'})
            return;
        }
    }catch (e) {
        console.log(e);
        res.json({code: 400, message: 'bad request'});
        return;
    }
    stickerDBService.listTrans(pageNum, pageSize, method, timeOrder).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/nftnumber', function(req, res) {

    stickerDBService.nftnumber().then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/udpateOrderEventCollection', function(req, res) {

    stickerDBService.udpateOrderEventCollection().then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/relatednftnum', function(req, res) {

    stickerDBService.relatednftnum().then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/walletaddressnum', function(req, res) {

    stickerDBService.walletaddressnum().then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/gettv', function(req, res) {
    stickerDBService.gettv().then(result => {
        console.log(result);
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code : 500, message: 'server error'});
    })
});

router.get('/getTranVolumeByTokenId', function(req, res) {
    let tokenId = req.query.tokenId;
    let type = req.query.type;
    tokenId = tokenId ? tokenId: "^";
    type = type ? type: 0;
    stickerDBService.getTranVolumeByTokenId(tokenId, type).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/getTranDetailsByTokenId', function(req, res) {
    let tokenId = req.query.tokenId;
    let method = req.query.method;
    let timeOrder = req.query.timeOrder;
    method = method ? method : 'All';
    stickerDBService.getTranDetailsByTokenId(tokenId, method, timeOrder).then(result => {
      res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/getCollectibleByTokenId', function(req, res) {
    let tokenId = req.query.tokenId;
    stickerDBService.getCollectibleByTokenId(tokenId).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/getTranvolumeTotalRoyaltySaleVolumeByWalletAddr', function(req, res) {
    let walletAddr = req.query.walletAddr;
    let type = req.query.type;
    walletAddr = walletAddr ? walletAddr.toString(): "^";
    type = type ? type: 0;
    stickerDBService.getTranvolumeTotalRoyaltySaleVolumeByWalletAddr(walletAddr, type).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/getStastisDataByWalletAddr', function(req, res) {
    let walletAddr = req.query.walletAddr;
    walletAddr = walletAddr ? walletAddr.toString(): "^";
    stickerDBService.getStastisDataByWalletAddr(walletAddr).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/getTranDetailsByWalletAddr', function(req, res) {
    let walletAddr = req.query.walletAddr.toString();
    let method = req.query.method;
    let timeOrder = req.query.timeOrder;
    let pageNumStr = req.query.pageNum;
    let pageSizeStr = req.query.pageSize;
    let keyword = req.query.keyword ? req.query.keyword : "";

    let pageNum, pageSize;

    try {
        pageNum = pageNumStr ? parseInt(pageNumStr) : 1;
        pageSize = pageSizeStr ? parseInt(pageSizeStr) : 10;
        method = method ? method : 'All';
        if(pageNum < 1 || pageSize < 1) {
            res.json({code: 400, message: 'bad request'})
            return;
        }
    }catch (e) {
        console.log(e);
        res.json({code: 400, message: 'bad request'});
        return;
    }

    stickerDBService.getTranDetailsByWalletAddr(walletAddr, method, timeOrder, keyword, pageNum, pageSize).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});
module.exports = router;
