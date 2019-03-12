const argv = require('yargs').argv;
const axios = require('axios');
const crypto = require('crypto');
let axiosInstance = axios.create({
    baseURL: 'https://api.rfinex.com/api/v1',
    headers: {},
    timeout: 20000, // 超时时间
})
// Add a request interceptor
axiosInstance.interceptors.request.use(function (config) {
    // Do something before request is sent
    if (config.needAuth) {
        let url = "/api/v1" + config.url
        let queryStr = '';
        let tonce = Date.now();
        let params;
        if (config.method === 'get') {
            params = {
                tonce,
                access_key: argv.access_key,
                ...config.params
            }
        } else if (config.method === 'post') {
            params = {
                tonce,
                access_key: argv.access_key,
                ...config.data
            }
        }
        const keys = Object.keys(params).sort()
        keys.forEach((v) => {
            queryStr += v + "=" + encodeURI(params[v]) + "&"
        })
        queryStr = queryStr.substr(0, queryStr.length - 1)
        const payload = `${config.method.toUpperCase()}|${url}|${queryStr}`;
        const signature = crypto.createHmac('sha256', argv.secret_key).update(payload).digest('hex');
        config.params = {
            ...params,
            signature
        }
    }
    return config;
}, function (error) {
    // Do something with request error
    return Promise.reject(error);
});

// Add a response interceptor
axiosInstance.interceptors.response.use(function (response) {
    // Do something with response data
    return response;
    // let resData = response.data
    // switch (resData.code) {
    //     case '1000': // 如果业务成功，直接进成功回调
    //         return resData.data;
    //     default:
    //         // 业务中还会有一些特殊 code 逻辑，我们可以在这里做统一处理，也可以下方它们到业务层
    //         return Promise.reject(resData);
    // }
}, function (error) {
    // Do something with response error
    return Promise.reject(error);
});



module.exports = class {

    static async getTickers() {
        return await axiosInstance.get('/tickers');
    }

    static async getTicketByMarket(market) {
        const res = await axiosInstance.get(`/tickers/${market}`);
        return res.data;
    }

    static async getDepth(market, limit) {
        const res = await axiosInstance.get('/depth', {
            params: {
                market,
                limit
            }
        });
        return res.data;
    }

    static async getUserInfo() {
        const res = await axiosInstance.get('/members/me', {
            needAuth: true // 需要鉴权
        });
        return res.data;
    }

    static async getMyAccount(currency) {
        // 返回了 head和body
        const res = await axiosInstance.get(`/members/accounts/${currency}`, {
            needAuth: true // 需要鉴权
        });
        return res.data.body;
    }

    static async getOrders(market, limit = 100) {
        const res = await axiosInstance.get('/orders', {
            params: {
                market,
                limit
            },
            needAuth: true // 需要鉴权
        });
        return res.data;
    }

    static async getOrderById(id) {
        const res = await axiosInstance.get('/order', {
            params: { id },
            needAuth: true // 需要鉴权
        });
        return res.data;
    }

    static async getMarkets() {
        const res = await axiosInstance.get('/markets');
        return res.data;
    }

    static async sellOrBuy(side, market, volume, price) {
        const res = await axiosInstance.post('/orders',
            {
                side,
                market,
                volume,
                price
            },
            {
                needAuth: true // 需要鉴权
            });
        return res.data.body
    }

    static async sell(market, volume, price) {
        return await sellOrBuy('sell', market, volume, price);
    }

    static async buy(market, volume, price) {
        return await sellOrBuy('buy', market, volume, price);
    }

    static async cancelOrder(id) {
        const res = await axiosInstance.post('/order/delete',
            {
                id
            }, {
                needAuth: true // 需要鉴权
            });
        return res.data;
    }

    static async cancelManyOrders(ids) {
        const res = await axiosInstance.post('/orders/delete',
            {
                ids
            }, {
                needAuth: true // 需要鉴权
            });
        return res.data;
    }

    static async cancelAllOrdersByMarket(market) {
        const res = await axiosInstance.post('/orders/clear',
            {
                market
            }, {
                needAuth: true // 需要鉴权
            });
        return res.data;
    }

}
