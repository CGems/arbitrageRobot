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
let currencyBodyAccountBalance; // 主体货币余额
let currencyBaseAccountBalance; // 基础货币余额
let closedPendingOrderId; // 封闭单的ID (低价卖单或高价买单，数量是刻度值)
let operatingStatus = 'close'; // 套利机器人运行状态
let closedPendingOrderStatus = 'close'; // 封闭单情况
let isHandicapChange = false;
let highBuyPrice; // 最高价买单
let lowSellPrice; // 最低价卖单
let userId; // 套利账户ID

async function init() {
    const resultList = await Promise.all([apiInstance.getTicketByMarket(market), getAccount()]);
    const currencyBodyPrice = resultList[0].ticker.last; // 最新价格
    if (new BigNumber(currencyBaseAccountBalance).div(currencyBodyPrice).isGreaterThanOrEqualTo(currencyBodyAccountBalance)) { // 初始化时判断第一次是买还是卖
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
    userId = resultList[0].member_id;
}

async function closedPendingOrder(type, price) {
    if (isHandicapChange) { //如果盘口变了
        if (closedPendingOrderStatus === 'running') {
            try {
                await apiInstance.cancelOrder(closedPendingOrderId);
            } catch (error) {
                error
            }
            closedPendingOrderStatus = 'close';
            closedPendingOrderId = undefined;
            return
        }
    }
    if (closedPendingOrderStatus === 'close') {
        // 下封闭单（机器人想低价买就下低价的卖单，反之想高价卖，就下高价的买单，把盘口缩小，方便捕获交易机器人单，数量是刻度值）
        const { id } = await apiInstance.sellOrBuy(type, market, amountInterval.toString(), price);
        closedPendingOrderId = id;
        closedPendingOrderStatus = 'running';
    }
    const { state } = await apiInstance.getOrderById(closedPendingOrderId);
    if (state === 'wait') { // 等待成交（此状态为预期状态）
        await sleep(1000);
        closedPendingOrder(type, price); // 循环检测
    } else {
        // 封闭单已被他人成交
        closedPendingOrderStatus = 'close'
        closedPendingOrderId = undefined;
        await sleep(1000);
        closedPendingOrder(type, price);
    }
}

async function watchHandicap() {
    await sleep(1000);
    // 如无别人挂单干预 盘口周围除去机器人可能挂的封闭单和待成交单之外就是原来的盘口
    const [depth, orders] = await Promise.all([apiInstance.getDepth(market, 2), apiInstance.getOrders(market, 10)])
    orders.forEach(item => {
        if (item.type === 'OrderAsk') {
            for (let i = 0; i < depth.asks.length; i++) {
                if (depth.asks[i][0] === item.price) {
                    depth.asks[i][1] = new BigNumber(depth.asks[i][1]).minus(item.volume).toString()
                    break
                }
            }
        } else {
            for (let i = 0; i < depth.bids.length; i++) {
                if (depth.bids[i][0] === item.price) {
                    depth.bids[i][1] = new BigNumber(depth.bids[i][1]).minus(item.volume).toString()
                    break
                }
            }
        }
    })
    depth.asks = depth.asks.filter(item => {
        return item[1] > 0
    })
    depth.bids = depth.bids.filter(item => {
        return item[1] > 0
    })
    let currentHighBuyPriceExceptMy = depth.bids[0][0]; // 当前最高价买单 (除了套利机器人下的单外)
    let currentLowSellPriceExceptMy = depth.asks[0][0]; // 当前最低价卖单 (除了套利机器人下的单外)
    if (currentHighBuyPriceExceptMy !== highBuyPrice || currentLowSellPriceExceptMy !== lowSellPrice) {
        // 因为深度数据的滞后性（深度是从redis中取，可能数据库已经变更），所以再次确认一遍
        console.log('A',currentHighBuyPriceExceptMy,currentLowSellPriceExceptMy)
        await sleep(500);
        const depthAgain = await apiInstance.getDepth(market, 2);
        orders.forEach(item => {
            if (item.type === 'OrderAsk') {
                for (let i = 0; i < depthAgain.asks.length; i++) {
                    if (depthAgain.asks[i][0] === item.price) {
                        depthAgain.asks[i][1] = new BigNumber(depthAgain.asks[i][1]).minus(item.volume).toString()
                        break
                    }
                }
            } else {
                for (let i = 0; i < depthAgain.bids.length; i++) {
                    if (depthAgain.bids[i][0] === item.price) {
                        depthAgain.bids[i][1] = new BigNumber(depthAgain.bids[i][1]).minus(item.volume).toString()
                        break
                    }
                }
            }
        })
        depthAgain.asks = depthAgain.asks.filter(item => {
            return item[1] > 0
        })
        depthAgain.bids = depthAgain.bids.filter(item => {
            return item[1] > 0
        })
        currentHighBuyPriceExceptMy = depthAgain.bids[0][0]; // 当前最高价买单 (除了套利机器人下的单外)
        currentLowSellPriceExceptMy = depthAgain.asks[0][0]; // 当前最低价卖单 (除了套利机器人下的单外)
        if (currentHighBuyPriceExceptMy !== highBuyPrice || currentLowSellPriceExceptMy !== lowSellPrice) {
            console.log('B',currentHighBuyPriceExceptMy,currentLowSellPriceExceptMy)
            // 盘口变了 应停止所有操作
            console.log('盘口变了')
            isHandicapChange = true
        } else {
            watchHandicap()
        }
    } else {
        watchHandicap()
    }
}

module.exports = async function taoli() {
    isHandicapChange = false; // 重置
    if (priceFixed === undefined) { // 初始化
        await init()
    }
    const depth = await apiInstance.getDepth(market, 1);
    highBuyPrice = depth.bids[0][0]; // 最高价买单
    lowSellPrice = depth.asks[0][0]; // 最低价卖单
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
        return;
    }
    const buyMoneyEveryUnit = taoliBuyPrice;// 每单位买单花费
    const sellMoneyEveryUnit = taoliSellPrice.times(new BigNumber(1).minus(buyFee)).times(new BigNumber(1).minus(sellFee)); // 每单位卖单花费 （未考虑买的量再卖时精度被截断的情况，建议成交量超过 数量刻度/手续费）
    const earnMoneyEveryUnit = sellMoneyEveryUnit.minus(buyMoneyEveryUnit); // 每单位获利
    if (earnMoneyEveryUnit.isGreaterThan(0)) { // 如果能获利
        operatingStatus = 'running'
        console.log(`按照成交量${amount}${argv.m.split('_')[0]},每买入卖出可获得${earnMoneyEveryUnit.times(amount).toFixed(2, 1)}${argv.m.split('_')[1]}`);
        closedPendingOrder(tradeType === 'buy' ? 'sell' : 'buy', tradeType === 'buy' ? taoliBuyPrice.plus(priceInterval).toString() : taoliSellPrice.minus(priceInterval).toString()); // 封闭单的下单与监控
        watchHandicap();
    } else {
        console.log('盘口过小，暂无套利空间')
        await sleep(1000);
        taoli()
    }
}