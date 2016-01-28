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

        client.write('status\r\nstate on all\r\n');
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
            .find(line => /UPDOWN:ENV,dev=/.test(line))
            .split('=')
            .pop();
        let localIp = history
            .find(line => /UPDOWN:ENV,ifconfig_local/.test(line))
            .split('=')
            .pop();
        let mtu = history
            .find(line => /UPDOWN:ENV,tun_mtu/.test(line))
            .split('=')
            .pop();
        let localNetmask = history
            .find(line => /UPDOWN:ENV,route_netmask/.test(line)) // route_netmask_1
            .split('=')
            .pop();
        let vpnGateway = history
            .find(line => /UPDOWN:ENV,route_gateway/.test(line)) // route_gateway_1
            .split('=')
            .pop();
        let vpnHost = history
            .find(line => /UPDOWN:ENV,trusted_ip/.test(line))
            .split('=')
            .pop();

        return {
            device,
            localIp,
            localNetmask,
            mtu,
            vpnGateway,
            vpnHost
        };
    }
};

