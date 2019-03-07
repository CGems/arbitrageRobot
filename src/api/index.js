const argv = require('yargs').argv;

const exchangeApi = {
    get: (exchange) => {
        switch (exchange) {
            case 'rfinex':
                return require('./api_rfinex')
        }

    }
}

module.exports = class {
    static getApi() {
        return exchangeApi.get(argv.e)
    }
}