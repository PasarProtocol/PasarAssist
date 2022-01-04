const config = require("../config");
module.exports = {

    getInfoByIpfsUri: async function(uri) {
        let tokenCID = uri.split(":")[2];
        let response = await fetch(config.ipfsNodeUrl + tokenCID);
        return await response.json();
    }
}
