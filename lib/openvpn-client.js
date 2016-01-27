'use strict';

let util = require('./util.js');
let nns = require('nns');
let createManager = require('./management-api.js');

const CONNECTION_TIMEOUT = 20000;

module.exports = configPath => {
    let uniqueId = `ot${Math.random()}`;
    let manager = createManager(uniqueId);

    return Promise.all([
        nns({prefix: 'ot'}),
        manager.listen()
    ])
        .then(result => {
            let netns = result[0];
            let proc = netns.execNoWait('openvpn ' + makeParams({
                configPath,
                managementPath: manager.path
            }));
            return Promise.race([
                util.throwAfterTimeout(new Error('Timeout waiting for openvpn startup'), CONNECTION_TIMEOUT),
                manager.waitForConnectionInit(),
            ])
                .then(() => ({
                    nns: netns,
                    destroy: () => {
                        proc.kill('SIGHUP');
                        proc.on('error', () => util.exec(`kill -9 ${proc.pid}`));
                        return netns.destroy();
                    },
                    manager
                }));
        });

    function makeParams(opts) {
        let commandParams = [
            '--script-security 2',
            '--topology subnet',
            `--management ${opts.managementPath} unix`,
            '--management-client',
            // '--ifconfig-noexec',
            // '--route-noexec',
        ];
        if (opts.configPath) {
            commandParams.push(`--config ${opts.configPath}`);
        }
        return commandParams.join(' ');
    }
};

