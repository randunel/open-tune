'use strict';

const net = require('net');
const util = require('./util.js');

module.exports = function constructor(name) {
    const path = `/tmp/${name}.mgmt`;
    const history = [];

    return Object.freeze({
        path,
        waitForConnectionInit,
        getClientInterfaceConfig,
        getServerConfig
    });

    function linesEmitterFromConnection(client) {
        const lines = util.createLinesEmitter();
        lines.init(client);
        lines.events.on('line', line => history.push(line));

        // console.log('management client connected');
        // client.on('data', data => {
        //     console.log(`${name}> ${data.toString()}`);
        // });
        // client.on('end', () => {
        //     console.log('client disconnected');
        // });
        // client.on('error', err => {
        //     console.log('management client error', name, err);
        // });
        // client.write('log on all\r\necho on all\r\n');

        client.write('status\r\nstate on all\r\nhold release\r\n');
        return lines;
    }

    function waitForConnection() {
        return retry(0)
            .then(client => {
                client.end();
            });

        function retry(attempt) {
            if (attempt > 10) {
                const err = new Error('waitForConnection attempts limit reached');
                throw err;
            }
            return createConnection()
                .catch(err => {
                    if ('ENOENT' === err.code) {
                        return util.promiseTimeout(50)
                            .then(() => retry(attempt + 1));
                    }
                });
        }
    }

    function createConnection() {
        return new Promise((resolve, reject) => {
            const client = net.createConnection({
                allowHalfOpen: false,
                path
            }, () => {
                resolve(client);
            })
                .on('error', reject);
        });
    }

    function waitForConnectionInit(userpass) {
        return waitForConnection()
            .then(() => createConnection())
            .then(client => linesEmitterFromConnection(client))
            .then(lines => new Promise((resolve, reject) => {
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
            }));
    }

    function getServerConfig() {
        const device = history
            .find(line => /UPDOWN:ENV,dev=/.test(line))
            .split('=')
            .pop();
        const localIp = history
            .find(line => /UPDOWN:ENV,ifconfig_local/.test(line))
            .split('=')
            .pop();
        const mtu = history
            .find(line => /UPDOWN:ENV,tun_mtu/.test(line))
            .split('=')
            .pop();
        const localNetmask = 24; // set on server startup

        return {
            device,
            localIp,
            localNetmask,
            mtu
        };
    }

    function getClientInterfaceConfig() {
        const device = history
            .find(line => /UPDOWN:ENV,dev=/.test(line))
            .split('=')
            .pop();
        const localIp = history
            .find(line => /UPDOWN:ENV,ifconfig_local/.test(line))
            .split('=')
            .pop();
        const mtu = history
            .find(line => /UPDOWN:ENV,tun_mtu/.test(line))
            .split('=')
            .pop();
        const localNetmask = history
            .find(line => /UPDOWN:ENV,ifconfig_netmask|UPDOWN:ENV,route_netmask/.test(line))
            .split('=')
            .pop();
        const vpnGateway = history
            .find(line => /UPDOWN:ENV,route_vpn_gateway/.test(line))
            .split('=')
            .pop();
        const vpnHost = history
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

