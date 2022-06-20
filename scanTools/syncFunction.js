const { config, DB_SYNC} = require("./utils");
const { syncRegisterCollection, transferCustomCollection } = require('./syncImportCollection');
const { syncFeedCollection, transferSingleV1, royaltyFeeV1, orderPriceChangedV1, orderForSaleV1, orderFilledV1, orderCanceledV1 } = require('./syncFeedCollection');
const { syncPasarCollection, transferSingleV2, transferBatchV2, royaltyFeeV2, orderPriceChangedV2, orderForSaleV2, orderForAuctionV2, orderFilledV2, orderCanceledV2, orderBidV2 } = require('./syncPasarCollection');

let stickerDBService = require('../service/stickerDBService');

const importDataInDB = async () => {
    console.log("======= Start Importing Data ==========")
    let currentStep = 0;
    let step = 100;
    
    let totalCount = await stickerDBService.getCountSyncTemp(DB_SYNC);
    console.log(totalCount);

    let totalStep = Math.ceil(totalCount/step);
    console.log(totalStep);
    try {
        while(currentStep < totalStep) {
            let listDoc = await stickerDBService.getSyncTemp(DB_SYNC, currentStep, step);
            if(listDoc == null) {
                continue;
            }
            for(var i = 0; i < listDoc.length; i++) {
                let cell = listDoc[i];
                switch(cell.eventType) {
                    case "TransferSingle":
                        if(cell.baseToken == config.stickerContract) {
                            await transferSingleV1(cell.eventData);
                        } else if(cell.baseToken == config.stickerV2Contract) {
                            await transferSingleV2(cell.eventData);
                        } else {
                            await transferCustomCollection(cell.eventData, cell.baseToken);
                        }
                        break;
                    case "Transfer":
                        if(cell.baseToken == config.stickerContract) {
                            await transferSingleV1(cell.eventData);
                        } else if(cell.baseToken == config.stickerV2Contract) {
                            await transferSingleV2(cell.eventData);
                        } else {
                            await transferCustomCollection(cell.eventData, cell.baseToken);
                        }
                        break;
                    case "TransferBatch":
                        if(cell.baseToken == config.stickerV2Contract) {
                            await transferBatchV2(cell.eventData);
                        }
                        break;
                    case "RoyaltyFee":
                        if(cell.baseToken == config.stickerContract) {
                            await royaltyFeeV1(cell.eventData);
                        } else if(cell.baseToken == config.stickerV2Contract) {
                            await royaltyFeeV2(cell.eventData);
                        }
                        break;
                    case "OrderForSale":
                        if(cell.baseToken == config.pasarContract) {
                            await orderForSaleV1(cell.eventData);
                        } else if(cell.baseToken == config.pasarV2Contract) {
                            await orderForSaleV2(cell.eventData);
                        }
                        break;
                    case "OrderForAuction":
                        if(cell.baseToken == config.pasarV2Contract) {
                            await orderForAuctionV2(cell.eventData);
                        }
                        break;
                    case "OrderBid":
                        if(cell.baseToken == config.pasarV2Contract) {
                            await orderBidV2(cell.eventData);
                        }
                        break;
                    case "OrderPriceChanged":
                        if(cell.baseToken == config.pasarContract) {
                            await orderPriceChangedV1(cell.eventData);
                        } else if(cell.baseToken == config.pasarV2Contract) {
                            await orderPriceChangedV2(cell.eventData);
                        }
                        break;
                    case "OrderCanceled":
                        if(cell.baseToken == config.pasarContract) {
                            await orderCanceledV1(cell.eventData);
                        } else if(cell.baseToken == config.pasarV2Contract) {
                            await orderCanceledV2(cell.eventData);
                        }
                        break;
                    case "OrderFilled":
                        if(cell.baseToken == config.pasarContract) {
                            await orderFilledV1(cell.eventData);
                        } else if(cell.baseToken == config.pasarV2Contract) {
                            await orderFilledV2(cell.eventData);
                        }
                        break;
                } 
            }
            console.log("Current Step: " + (currentStep * step + i) + " / " + totalCount);
            currentStep++;
        }
        console.log("======= End Importing Data ==========")
    } catch(err) {
        console.log(err);
    }
}

if (require.main == module) {
    (async ()=> {
        await syncRegisterCollection();
        await syncFeedCollection();
        await syncPasarCollection();
        await importDataInDB();
    })();
}
