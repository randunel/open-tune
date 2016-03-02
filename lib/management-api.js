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
        getClientInterfaceConfig,
        getServerConfig
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
        // client.on('error', err => {
        //     console.log('management client error', name, err);
        // });
        // client.write('log on all\r\n');

        client.write('status\r\nstate on all\r\n');
    }

    function waitForConnectionInit(userpass) {
        return new Promise((resolve, reject) => {
            lines.events.on('line', checkConnectionInit);
            lines.events.on('line', checkUserPassRequest);

            function checkUserPassRequest(line, client) {
                if (line.includes('>PASSWORD:Need \'Auth\' username/password')) {
                    lines.events.removeListener('line', checkUserPassRequest);
                    client.write(`username "Auth" ${userpass.user}\n\r`);
                    client.write(`password "Auth" ${userpass.pass}\n\r`);
                    client.write('\n\r');
                }
            }

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
                reject(new Error('Waiting for connection init timed out'));
            }, 15000);
        });
    }

    function getServerConfig() {
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
        let localNetmask = 24; // set on server startup

        return {
            device,
            localIp,
            localNetmask,
            mtu
        };
    }

    function getClientInterfaceConfig() {
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
            .find(line => /UPDOWN:ENV,ifconfig_netmask|UPDOWN:ENV,route_netmask/.test(line))
            .split('=')
            .pop();
        let vpnGateway = history
            .find(line => /UPDOWN:ENV,route_vpn_gateway/.test(line))
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

