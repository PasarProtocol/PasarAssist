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

router.get('/updateOrderEventCollection', function(req, res) {

    stickerDBService.updateOrderEventCollection().then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/updateAllEventCollectionForGasFee', function(req, res) {

    stickerDBService.updateAllEventCollectionForGasFee().then(result => {
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

router.get('/owneraddressnum', function(req, res) {

    stickerDBService.owneraddressnum().then(result => {
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

router.get('/getNftPriceByTokenId', function(req, res) {
    let tokenId = req.query.tokenId;
    tokenId = tokenId ? tokenId: "^";
    stickerDBService.getNftPriceByTokenId(tokenId).then(result => {
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

router.get('/getTotalRoyaltyandTotalSaleByWalletAddr', function(req, res) {
    let walletAddr = req.query.walletAddr;
    let type = req.query.type;
    walletAddr = walletAddr ? walletAddr.toString(): "^";
    type = type ? type: 0;
    stickerDBService.getTotalRoyaltyandTotalSaleByWalletAddr(walletAddr, type).then(result => {
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
    let performer = req.query.performer;

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

    stickerDBService.getTranDetailsByWalletAddr(walletAddr, method, timeOrder, keyword, pageNum, pageSize, performer).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});


router.get('/getAuctionOrdersByTokenId', function(req, res) {
    let tokenId = res.query.tokenId;
    stickerDBService.getAuctionOrdersByTokenId(tokenId.toString()).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});


router.get('/getLatestBids', function(req, res) {
    let tokenId = req.query.tokenId;
    let ownerAddr = req.query.owner;
    tokenId = tokenId ? tokenId : '';
    stickerDBService.getLatestBids(tokenId, ownerAddr).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/getDetailedCollectibles', function(req, res) {
    let status = req.query.status;
    let minPrice = req.query.minPrice;
    let maxPrice = req.query.maxPrice;
    let collectionType = req.query.collectiionType;
    let itemType = req.query.itemType;
    let adult = req.query.adult;
    let orderType = req.query.order;
    stickerDBService.getDetailedCollectibles(status, parseInt(minPrice), parseInt(maxPrice), collectionType, itemType, adult, orderType).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/getListedCollectiblesByAddress', function(req, res) {
    let address = req.query.address;
    let orderType = req.query.order;
    stickerDBService.getListedCollectiblesByAddress(address, orderType).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/getOwnCollectiblesByAddress', function (req, res) {
    let address = req.query.address;
    let orderType = req.query.order;
    stickerDBService.getOwnCollectiblesByAddress(address, orderType).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})
module.exports = router;
