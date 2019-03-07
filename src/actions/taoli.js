const api = require('./../api/index')
const apiInstance = api.getApi();
const argv = require('yargs').argv;
const BigNumber = require('bignumber.js');
const { sleep } = require('./../utils')

let tradeType = 'buy';// 当前交易类型
const market = argv.m.replace('_', '');
const currencyArr = argv.m.split('_');
const currencyBody = currencyArr[0]; // 主体货币
const currencyBase = currencyArr[1]; // 基础货币
let priceFixed; // 价格精度
let amountFixed; // 数量精度
let priceInterval; // 价格刻度
let amountInterval; // 数量刻度
let buyFee; // 买手续费
let sellFee; // 卖手续费
let currencyBodyAccountBalance;
let currencyBaseAccountBalance;

async function init() {
    const resultList = await Promise.all([apiInstance.getTicketByMarket(market), getAccount()]);
    const currencyBodyPrice = resultList[0].ticker.last; // 最新价格
    if (new BigNumber(currencyBodyAccountBalance).div(currencyBodyPrice).isGreaterThanOrEqualTo(currencyBaseAccountBalance)) { // 初始化时判断第一次是买还是卖
        tradeType = 'buy';
    } else {
        tradeType = 'sell';
    }
    priceFixed = resultList[0].bid.fixed; // 价格精度
    amountFixed = resultList[0].ask.fixed; // 数量精度
    priceInterval = new BigNumber(0.1).pow(priceFixed); // 价格刻度
    amountInterval = new BigNumber(0.1).pow(amountFixed); // 数量刻度
    buyFee = resultList[0].bid.fee; // 买手续费
    sellFee = resultList[0].ask.fee; // 卖手续费
}

async function getAccount() {
    const resultList = await Promise.all([apiInstance.getMyAccount(currencyBody), apiInstance.getMyAccount(currencyBase)]);
    currencyBodyAccountBalance = resultList[0].balance;
    currencyBaseAccountBalance = resultList[1].balance;
}

module.exports = async function taoli() {
    if (priceFixed === undefined) { // 初始化
        await init()
    }
    const depth = await apiInstance.getDepth(market, 1);
    const highBuyPrice = depth.bids[0][0]; // 最高价买单
    const lowSellPrice = depth.asks[0][0]; // 最低价卖单
    const taoliBuyPrice = priceInterval.times(9).plus(highBuyPrice); // 套利的低价买单价格
    const taoliSellPrice = new BigNumber(lowSellPrice).minus(priceInterval.times(9)); // 套利的高价卖单价格
    let amount;
    if (tradeType === 'buy') {
        const retainedBodyCurrency = amountInterval.times(50) // 留存的主体货币的数量
        if (retainedBodyCurrency.isGreaterThan(currencyBodyAccountBalance)) {
            console.log(`无法下低价买单，账户必须有${retainedBodyCurrency.toFixed(2, 1)}${currencyBody}`)
            return;
        }
        // 买的数量 = (基础货币-50次的卡卖单的基础货币数量) / 套利低价买单价格，并精度截断取整
        amount = new BigNumber(currencyBaseAccountBalance).minus(amountInterval.times(50).times(taoliSellPrice)).div(taoliBuyPrice).toFixed(amountFixed, 1);
    } else {
        const retainedBaseCurrency = amountInterval.times(50).times(taoliSellPrice) // 留存的基础货币的数量
        if (retainedBaseCurrency.isGreaterThan(currencyBaseAccountBalance)) {
            console.log(`无法下高价卖单，账户必须有${retainedBaseCurrency.toFixed(2, 1)}${currencyBase}`)
            return;
        }
        // 卖的数量 = (主体货币-50次的卡卖单的主体货币数量) / 套利高价卖单价格，并精度截断取整
        amount = new BigNumber(currencyBodyAccountBalance).minus(amountInterval.times(50)).div(taoliSellPrice).toFixed(amountFixed, 1);
    }
    amount = Math.min(amount, argv.a); // 数量在可买/卖数量和设定成交量中取最小值
    if (amount <= 0) {
        console.log('账户余额不支持进行套利');
        // return;
    }
    const buyMoneyEveryUnit = taoliBuyPrice;// 每单位买单花费
    const sellMoneyEveryUnit = taoliSellPrice.times(new BigNumber(1).minus(buyFee)).times(new BigNumber(1).minus(sellFee)); // 每单位卖单花费 （未考虑买的量再卖时精度被截断的情况，建议成交量超过 数量刻度/手续费）
    const earnMoneyEveryUnit = sellMoneyEveryUnit.minus(buyMoneyEveryUnit); // 每单位获利
    if (earnMoneyEveryUnit.isGreaterThan(0)) { // 如果能获利
        console.log(`按照设定成交量${argv.a}${argv.m.split('_')[0]},每买入卖出可获得${earnMoneyEveryUnit.times(argv.a).toFixed(2, 1)}${argv.m.split('_')[1]}`);
    } else {
        await sleep(1000);
        taoli()
    }
}