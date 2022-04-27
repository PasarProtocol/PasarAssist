let express = require('express');
let router = express.Router();
let stickerDBService = require('../../service/stickerDBService');

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

router.get('/search/:key', function(req, res) {
    let keyword = req.params.key;

    if(!keyword) {
        res.json({code: 400, message: 'bad request'})
        return;
    }

    if(keyword.startsWith('0x') && keyword.length > 42) {
        keyword = BigInt(keyword).toFormat({prefix:""});
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

router.get('/tokenTrans/:tokenId', function(req, res) {
    let tokenId = req.params.tokenId;

    if(!tokenId) {
        res.json({code: 400, message: 'bad request'})
        return;
    }

    if(tokenId.startsWith('0x') && tokenId.length > 42) {
        tokenId = BigInt(tokenId).toFormat({prefix:""});
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

router.get('/getNftPriceByTokenId/:tokenId', function(req, res) {
    let tokenId = req.params.tokenId;
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

router.get('/getCollectibleByTokenId/:tokenId', function(req, res) {
    let tokenId = req.params.tokenId;
    stickerDBService.getCollectibleByTokenId(tokenId).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/getTotalRoyaltyandTotalSaleByWalletAddr/:walletAddr', function(req, res) {
    let walletAddr = req.params.walletAddr;
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

router.get('/getStastisDataByWalletAddr/:walletAddr', function(req, res) {
    let walletAddr = req.params.walletAddr;
    walletAddr = walletAddr ? walletAddr.toString(): "^";
    stickerDBService.getStastisDataByWalletAddr(walletAddr).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/getTranDetailsByWalletAddr/:walletAddr', function(req, res) {
    let walletAddr = req.params.walletAddr.toString();
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


router.get('/getAuctionOrdersByTokenId/:tokenId', function(req, res) {
    let tokenId = req.params.tokenId;
    stickerDBService.getAuctionOrdersByTokenId(tokenId.toString()).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});


router.get('/getLatestBids/:tokenId', function(req, res) {
    let tokenId = req.params.tokenId;
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
    let collectionType = req.query.collectionType;
    let itemType = req.query.itemType;
    let adult = req.query.adult;
    let orderType = req.query.order;
    let pageNumStr = req.query.pageNum;
    let pageSizeStr = req.query.pageSize;
    let keyword = req.query.keyword;
    let tokenType = req.query.tokenType;
    let pageNum, pageSize;

    try {
        pageNum = pageNumStr ? parseInt(pageNumStr) : 1;
        pageSize = pageSizeStr ? parseInt(pageSizeStr) : 10;
        if(pageNum < 1 || pageSize < 1) {
            res.json({code: 400, message: 'bad request'})
            return;
        }
    }catch (e) {
        console.log(e);
        res.json({code: 400, message: 'bad request'});
        return;
    }
    
    stickerDBService.getDetailedCollectibles(status, minPrice, maxPrice, collectionType, itemType, adult, orderType, pageNum, pageSize, keyword, tokenType).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/getDetailedCollectiblesInCollection/:baseToken', function(req, res) {
    let status = req.query.status;
    let minPrice = req.query.minPrice;
    let maxPrice = req.query.maxPrice;
    let collectionType = req.params.baseToken;
    let itemType = req.query.itemType;
    let adult = req.query.adult;
    let orderType = req.query.order;
    let pageNumStr = req.query.pageNum;
    let pageSizeStr = req.query.pageSize;
    let keyword = req.query.keyword;
    let tokenType = req.query.tokenType;
    let pageNum, pageSize;

    try {
        pageNum = pageNumStr ? parseInt(pageNumStr) : 1;
        pageSize = pageSizeStr ? parseInt(pageSizeStr) : 10;
        if(pageNum < 1 || pageSize < 1) {
            res.json({code: 400, message: 'bad request'})
            return;
        }
    }catch (e) {
        console.log(e);
        res.json({code: 400, message: 'bad request'});
        return;
    }

    stickerDBService.getDetailedCollectiblesInCollection(status, minPrice, maxPrice, collectionType, itemType, adult, orderType, pageNum, pageSize, keyword, tokenType).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/getAttributeOfCollection/:token', function(req, res) {
    let token = req.params.token;

    stickerDBService.getAttributeOfCollection(token).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/getListedCollectiblesByAddress/:address', function(req, res) {
    let address = req.params.address;
    let orderType = req.query.order;
    stickerDBService.getListedCollectiblesByAddress(address, orderType).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/getOwnCollectiblesByAddress/:address', function (req, res) {
    let address = req.params.address;
    let orderType = req.query.order;
    stickerDBService.getOwnCollectiblesByAddress(address, orderType).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/getCreatedCollectiblesByAddress/:address', function(req, res) {
    let address = req.params.address;
    let orderType = req.query.orderType;
    stickerDBService.getCreatedCollectiblesByAddress(address, orderType).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/getMarketStatusByTokenId/:sellerAddr', function(req, res) {
    let sellerAddr = req.params.sellerAddr;
    let tokenId = req.query.tokenId;
    stickerDBService.getMarketStatusByTokenId(tokenId, sellerAddr).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/updateBurnTokens', function(req, res) {
    stickerDBService.updateBurnTokens().then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/updateTokenHolders', function(req, res) {
    stickerDBService.updateTokenHolders().then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/getLatestPurchasedToken', function(req, res) {
    stickerDBService.getLatestPurchasedToken().then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})


router.get('/updateTokens', function(req, res) {
    stickerDBService.updateTokens().then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/getLatestElaPrice', function(req, res) {
    stickerDBService.getLatestElaPrice().then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/getCollection', function(req, res) {
    stickerDBService.getCollections().then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/getCollection/:token', function(req, res) {
    let token = req.params.token;
    stickerDBService.getCollectionByToken(token).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

router.get('/getCollectionByOwner/:owner', function(req, res) {
    let owner = req.params.owner;
    stickerDBService.getCollectionByOwner(owner).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});
router.get('/getOwnersOfCollection/:token', function(req, res) {
    let token = req.params.token;
    stickerDBService.getOwnersOfCollection(token).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});
router.get('/getTotalCountCollectibles/:token', function(req, res) {
    let token = req.params.token;
    stickerDBService.getTotalCountCollectibles(token).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});
router.get('/getTotalPriceCollectibles/:token', function(req, res) {
    let token = req.params.token;
    stickerDBService.getTotalPriceCollectibles(token).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});
router.get('/getFloorPriceCollectibles/:token', function(req, res) {
    let token = req.params.token;
    stickerDBService.getFloorPriceCollectibles(token).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});
module.exports = router;
