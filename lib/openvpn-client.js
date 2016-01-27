'use strict';

let util = require('./util.js');
let createFifo = require('./fifo.js');
let nns = require('nns');

const CONNECTION_TIMEOUT = 20000;

module.exports = configPath => Promise.all([
    nns({prefix: 'ot'}),
    createFifo({
        dir: '/tmp',
        name: Math.random() + '_route_up'
    })
])
    .then(result => {
        let netns = result[0];
        let fifo = result[1];
        let proc = netns.execNoWait('openvpn ' + makeParams({
            caller: fifo.caller,
            configPath
        }));
        return Promise.race([
            fifo.wait(),
            util.throwAfterTimeout(new Error('Timeout waiting for openvpn startup'), CONNECTION_TIMEOUT)
        ])
            .then(() => ({
                nns: netns,
                destroy: () => {
                    proc.kill('SIGHUP');
                    proc.on('error', () => util.exec(`kill -9 ${proc.pid}`));
                    return netns.destroy();
                }
            }));
    });

function makeParams(opts) {
    let commandParams = [
        '--script-security', 2,
        '--topology', 'subnet',
        // '--ifconfig-noexec',
        // '--route-noexec',
        '--route-up', opts.caller,
    ];
    if (opts.configPath) {
        commandParams.push('--config');
        commandParams.push(opts.configPath);
    }
    return commandParams.join(' ');
}

