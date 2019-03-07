module.exports = class {
    static sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve()
            }, ms);
        })
    }
}