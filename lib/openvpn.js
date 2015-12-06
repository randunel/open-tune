'use strict';

var uuid = require('uuid');
var util = require('./util.js');
var fs = require('fs');
var spawn = require('child_process').spawn;
var makeFifo = require('./fifo.js');

const CONNECTION_TIMEOUT = 20000;

module.exports = function constructor(params) {
    let config = params.config;
    let id = uuid.v4();
    let workingDirectory = params.workingDirectory || '/tmp';

    return Object.freeze({
        create: create
    });

    function create() {
        let fifoUp = makeFifo(workingDirectory, id);
        _getLock()
            .then(fifoUp.init)
            .then(() => {
                console.log('runnin openvpn');
                var proc = spawn('openvpn', _makeParams({
                    routeUp: fifoUp
                }));
                proc.stderr.on('data', chunk => {
                    console.error('openvpn.error:', chunk.toString());
                });
                proc.stdout.on('data', chunk => {
                    console.log('openvpn.log:', chunk.toString());
                });
                proc.stdout.on('end', () => {
                    // this is the point where openvpn terminates
                    console.log(`${id} exited.`);
                });
            });

        return Promise.race([
            fifoUp.wait(),
            util.throwAfterTimeout(new Error('Timeout'), CONNECTION_TIMEOUT)
        ]).then((routesJSON) => {
            let routes = JSON.parse(routesJSON);
            let tableNumber = 3;
            let userName = 'vpn_' + tableNumber;
            let mark = tableNumber;
            let gatewayKey = 'route_vpn_gateway';
            let localRouteKey = 'ifconfig_local';
            let remoteRouteKey = 'ifconfig_local';
            Promise.all([
                util.run('ip', `route add fwmark ${mark} table ${tableNumber}`),
                util.run('ip', `route add default via ${routes[gatewayKey]} dev ${routes.dev} table ${tableNumber}`),
                util.run('ip', `route add ${_getDeviceLink()} table ${tableNumber}`),
                util.run('iptables', [
                    '-t', 'mangle',
                    '-A', 'OUTPUT',
                    '-m', 'owner',
                    '--uid-owner', userName,
                    '-j', 'MARK',
                    '--set-mark', mark,
                ]).then(() => {
                    return util.run('iptables', [
                        '-t', 'nat',
                        '-A', 'POSTROUTING',
                        '-o', routes.dev,
                        '-m', 'mark',
                        '--mark', mark,
                        '-j', 'SNAT',
                        '--to-source', routes[localRouteKey]
                    ]);
                }),
                _disableIPFiltering(routes.dev)
            ])
            .catch(function(err) {
                // TODO: do cleanup in case if error
                console.error(err);
                throw err;
            });

            function _getDeviceLink() {
                return routes[remoteRouteKey] + ' dev ' + routes.dev + '  proto kernel  scope link  src ' + routes[localRouteKey];
            }
        }).catch(err => {
            console.error(err);
            throw err;
        });
    }

    function _makeParams(opts) {
        var commandParams = [
            '--script-security', 2,
            '--route-noexec',
            '--route-up', opts.routeUp.getCallerPath(),
        ];
        if (config) {
            commandParams.push('--config');
            commandParams.push(config);
        }
        console.log(commandParams.join(' '));
        return commandParams;
    }

    function _getLock() {
        // TODO(ac): lock
        return Promise.resolve();
    }

    function _disableIPFiltering(deviceName) {
        return new Promise((resolve, reject) => {
            fs.appendFile('/proc/sys/net/ipv4/conf/' + deviceName + '/rp_filter', '0', function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

};

