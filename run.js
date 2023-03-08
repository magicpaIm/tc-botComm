const {app} = require('./index');

const runApp = async () => {
    await app();
    process.exit(0);
}

runApp();