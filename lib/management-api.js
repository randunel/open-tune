'use strict';

let net = require('net');
let util = require('./util.js');

module.exports = function constructor(name) {
    let path = `/tmp/${name}.mgmt`;
    let server = net.createServer({
        allowHalfOpen: false
    }, connectionHandler);
    let lines = util.createLinesEmitter();

    return Object.freeze({
        listen,
        path,
        waitForConnectionInit
    });

    function listen() {
        return new Promise(resolve => {
            server.listen(path, resolve);
        });
    }

    function connectionHandler(client) {
        lines.init(client);
        // console.log('client connected');
        // client.on('data', data => {
        //     console.log(`${name}> ${data.toString()}`);
        // });
        // client.on('end', () => {
        //     console.log('client disconnected');
        // });

        client.write('log on all\r\n');
    }

    function waitForConnectionInit() {
        return new Promise((resolve, reject) => {
            lines.events.on('line', checkConnectionInit);

            function checkConnectionInit(line) {
                if (line.indexOf('Initialization Sequence Completed') > -1) {
                    removeListener();
                    return resolve();
                }
            }

            function removeListener() {
                lines.events.removeListener('line', checkConnectionInit);
            }

            setTimeout(() => {
                removeListener();
                reject();
            }, 15000);
        });
    }
};

