/**
    sync all events on the ethereum network
*/

const { config, DB_SYNC} = require("./utils");
const { syncRegisterCollection, transferCustomCollection } = require('./syncImportCollection');
const { syncPasarCollection, orderPriceChanged, orderForSale, orderForAuction, orderFilled, orderCanceled, orderBid, orderDIDURI } = require('./syncPasarCollection');

let stickerDBService = require('../../service/stickerDBService');
let currentStep = 0;
let i = 0;
let totalCount;
const importDataInDB = async (marketPlace) => {
    console.log("======= Start Importing Data ==========")
    
    let step = 100;
    
    totalCount = await stickerDBService.getCountSyncTemp(DB_SYNC);
    console.log(totalCount);

    let totalStep = Math.ceil(totalCount/step);
    
    try {
        while(currentStep < totalStep) {
            let listDoc = await stickerDBService.getSyncTemp(DB_SYNC, currentStep, step);
            if(listDoc == null) {
                continue;
            }
            for(; i < listDoc.length; i++) {
                let cell = listDoc[i];
                switch(cell.eventType) {
                    case "TransferSingle":
                        await transferCustomCollection(cell.eventData, cell.baseToken, marketPlace);
                    case "Transfer":
                        await transferCustomCollection(cell.eventData, cell.baseToken, marketPlace);
                        break;
                    case "OrderForSale":
                        await orderForSale(cell.eventData, marketPlace);
                        break;
                    case "OrderForAuction":
                        await orderForAuction(cell.eventData, marketPlace);
                        break;
                    case "OrderBid":
                        await orderBid(cell.eventData, marketPlace);
                        break;
                    case "OrderPriceChanged":
                        await orderPriceChanged(cell.eventData, marketPlace);
                        break;
                    case "OrderCanceled":
                        await orderCanceled(cell.eventData, marketPlace);
                        break;
                    case "OrderFilled":
                        await orderFilled(cell.eventData, marketPlace);
                        break;
                    case "OrderDidURI":
                        await orderDIDURI(cell.eventData, marketPlace);
                        break;
                } 
                logger.info("Current Step: " + (currentStep * step + i) + " / " + totalCount + " - " + cell.blockNumber + " : " + cell.eventType);
            }
            currentStep++;
            i = 0;
        }
        console.log("======= End Importing Data ==========")
    } catch(err) {
        logger.info("Error happened Step: " + (currentStep * step + i) + " / " + totalCount);
        logger.info(err);
        if(i == step - 1) {
            currentStep++
        } else {
            i++;
        }
        await importDataInDB(marketPlace);
    }
}

if (require.main == module) {
    (async ()=> {
        await syncRegisterCollection(config.fusionChain);
        await syncPasarCollection();
        await importDataInDB(config.fusionChain);
    })();
}
