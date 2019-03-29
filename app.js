const { taoli } = require('./src/actions')
const argv = require('yargs')
    .option('exchange', {
        alias: 'e',
        describe: '交易所',
        demandOption: true,
        choices: ['rfinex']
    })
    .option('market', {
        alias: 'm',
        describe: '交易队',
        demandOption: true
    })
    .option('amount', {
        alias: 'a',
        describe: '最大成交数量',
    })
    .option('orderType', {
        alias: 't',
        describe: '下单类型',
    })
    .option('closeRange', {
        alias: 'r',
        describe: '手动设置封单跨度',
    })
    .option('closeAmount', {
        alias: 'n',
        describe: '手动设置封单数量',
    })
    .option('access_key', {
        describe: '公钥',
        demandOption: true
    })
    .option('secret_key', {
        describe: '私钥',
        demandOption: true
    })
    .help('help')
    .version('1.0.0')
    .alias({ version: 'v', help: 'h' })
    .argv;

try {
    taoli()
} catch (error) {
    taoli()
}