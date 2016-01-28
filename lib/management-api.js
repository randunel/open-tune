'use strict';

let net = require('net');
let util = require('./util.js');

module.exports = function constructor(name) {
    let path = `/tmp/${name}.mgmt`;
    let server = net.createServer({
        allowHalfOpen: false
    }, connectionHandler);
    let lines = util.createLinesEmitter();
    let history = [];

    return Object.freeze({
        listen,
        path,
        waitForConnectionInit,
        getInterfaceConfig
    });

    function listen() {
        return new Promise(resolve => {
            server.listen(path, resolve);
        });
    }

    function connectionHandler(client) {
        lines.init(client);
        lines.events.on('line', line => history.push(line));

        // console.log('client connected');
        // client.on('data', data => {
        //     console.log(`${name}> ${data.toString()}`);
        // });
        // client.on('end', () => {
        //     console.log('client disconnected');
        // });

        client.write('log on all\r\nstate on all\r\n');
    }

    function waitForConnectionInit() {
        return new Promise((resolve, reject) => {
            lines.events.on('line', checkConnectionInit);

            function checkConnectionInit(line) {
                if (line.includes('CONNECTED,SUCCESS')) {
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

    function getInterfaceConfig() {
        let device = history
            .find(line => /TUN\/TAP\sdevice\s.*\sopened/.test(line))
            .split(/TUN\/TAP\sdevice\s/)[1]
            .split(' ')[0];
        let pushLine = history
            .find(line => /PUSH_REPLY/.test(line));
        let localIp = pushLine
            .split('ifconfig ')[1]
            .split(' ')[0];
        let localNetmask = pushLine
            .split('route ')[1]
            .split(',')[0]
            .split(' ')[1];
        let vpnGateway = pushLine
            .split('ifconfig ')[1]
            .split('\'')[0]
            .split(',')[0]
            .split(' ')[1];
        let vpnHost = history
            .find(line => /CONNECTED\,SUCCESS/.test(line))
            .split(',')
            .pop();

        return {
            device,
            localIp,
            localNetmask,
            vpnGateway,
            vpnHost
        };
    }
};

