let express = require('express');
let router = express.Router();
let apiV2DBService = require('../service/apiV2DBService');
const BigNumber = require('bignumber.js');

router.get('/collectible/tokenId/:tokenId', function (req, res) {
    apiV2DBService.queryCollectibleByTokenId(req.params.tokenId).then(result => {res.json(result)})
})

router.get('/collectibles/creator/:creator', function (req, res) {
    apiV2DBService.queryCollectibleByOther('creator', req.params.creator).then(result => {res.json(result)})
})

router.get('/collectibles/owner/:owner', function (req, res) {
    apiV2DBService.queryCollectibleByOther('owner', req.params.owner).then(result => {res.json(result)})
})

router.get('/collectibles/keyword/:keyword', function (req, res) {
    apiV2DBService.queryCollectibleByOther('keyword', req.params.keyword).then(result => {res.json(result)})
})

router.get('/collectibles/owner/:owner/creator/:creator/types/:types', function (req, res) {
    let owner = req.params.owner;
    let creator = req.params.creator;
    let typesStr = req.params.types;

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

    apiV2DBService.queryCollectibleByOthers(owner, creator, types).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
})

router.get('/collectibles/all', function (req, res) {
    apiV2DBService.queryAllCollectibles().then(result => {res.json(result)})
})

router.get('/creators/all', function (req, res) {
    apiV2DBService.queryAllCreators().then(result => {res.json(result)})
})

router.get('/creator/:address', function (req, res) {
    apiV2DBService.queryDidsByAddress(req.params.address).then(result => {res.json(result)})
})

router.get('/orders/filled/tokenId/:tokenId', function (req, res) {
    apiV2DBService.queryOrders('2', 'tokenId', req.params.tokenId).then(result => {res.json(result)})
})

router.get('/orders/filled/seller/:seller', function (req, res) {
    // apiV2DBService.queryOrdersBySeller('2',  req.params.seller).then(result => {res.json(result)})
    apiV2DBService.queryOrders('2', 'sellerAddr', req.params.seller).then(result => {res.json(result)})
})

router.get('/orders/filled/buyer/:buyer', function (req, res) {
    apiV2DBService.queryOrders('2', 'buyerAddr', req.params.buyer).then(result => {res.json(result)})
})

router.get('/orders/filled/keyword/:keyword', function (req, res) {
    apiV2DBService.queryOrdersByKeyword('2', 'keyword', req.params.keyword).then(result => {res.json(result)})
})

router.get('/orders/filled/all', function (req, res) {
    apiV2DBService.queryAllOrder('2').then(result => {res.json(result)})
})

router.get('/orders/canceled/tokenId/:tokenId', function (req, res) {
    apiV2DBService.queryOrders('3', 'tokenId', req.params.tokenId).then(result => {res.json(result)})
})

router.get('/orders/canceled/seller/:seller', function (req, res) {
    // apiV2DBService.queryOrdersBySeller('3', req.params.seller).then(result => {res.json(result)})
    apiV2DBService.queryOrders('3', 'sellerAddr', req.params.seller).then(result => {res.json(result)})
})

router.get('/orders/canceled/all', function (req, res) {
    apiV2DBService.queryAllOrder('3').then(result => {res.json(result)})
})

router.get('/orders/sale/tokenId/:tokenId', function (req, res) {
    apiV2DBService.queryOrders('1', 'tokenId', req.params.tokenId).then(result => {res.json(result)})
})

router.get('/orders/sale/seller/:seller', function (req, res) {
    // apiV2DBService.queryOrdersBySeller('1', req.params.seller).then(result => {res.json(result)})
    apiV2DBService.queryOrders('1', 'sellerAddr', req.params.seller).then(result => {res.json(result)})
})

router.get('/orders/sale/all', function (req, res) {
    apiV2DBService.queryAllOrder('1').then(result => {res.json(result)})
})

router.get('/orders/priceChanged/tokenId/:tokenId', function (req, res) {
    apiV2DBService.queryOrderPriceChangeHistory(req.params.tokenId).then(result => {res.json(result)})
})

router.get('/orders/priceChanged/seller/:seller', function (req, res) {

})


router.get('/giveaways/tokenId/:tokenId', function (req, res) {
    apiV2DBService.queryGiveawaysToken('tokenId', req.params.tokenId).then(result => {res.json(result)})
})

router.get('/giveaways/sender/:sender', function (req, res) {
    apiV2DBService.queryGiveawaysToken('from', req.params.sender).then(result => {res.json(result)})
})

router.get('/giveaways/recipient/:recipient', function (req, res) {
    apiV2DBService.queryGiveawaysToken('to', req.params.recipient).then(result => {res.json(result)})
})

router.get('/giveaways/royaltyOwner/:royaltyOwner', function (req, res) {
    apiV2DBService.queryGiveawaysTokenByRoyaltyOwner(req.params.royaltyOwner).then(result => {res.json(result)})
})

router.get('/giveaways/lastSyncHeight', function (req, res) {
    apiV2DBService.queryGiveawaysLastSyncHeight().then(result => {res.json(result)})
})

router.get('/collectibles/pagination/:pageNum/:pageSize', function (req, res) {
    let pageNumStr = req.params.pageNum;
    let pageSizeStr = req.params.pageSize;
    let pageNum, pageSize;

    try {
        pageNum = pageNumStr ? parseInt(pageNumStr) : 1;
        pageSize = pageSizeStr ? parseInt(pageSizeStr) : 10;

        if(pageNum < 1 || pageSize < 1) {
            res.json({code: 400, message: 'bad request'})
            return;
        }
    }catch (e) {
        res.json({code: 400, message: 'bad request'});
        return;
    }
    apiV2DBService.queryCollectiblesByPageNumAndPageSize(pageNum, pageSize).then(result => {res.json(result)})
})

router.get('/transactions/tokenId/:tokenId', function (req, res) {
    let tokenId = req.params.tokenId;

    if(!tokenId) {
        res.json({code: 400, message: 'bad request'})
        return;
    }

    if(tokenId.startsWith('0x') && tokenId.length > 42) {
        tokenId = new BigNumber(tokenId).toFormat({prefix:""});
    }

    apiV2DBService.queryTransactionsByTokenId(tokenId).then(result => {
        res.json(result);
    }).catch(error => {
        console.log(error);
        res.json({code: 500, message: 'server error'});
    })
});

module.exports = router;
