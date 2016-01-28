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
                .then(manager.getInterfaceConfig)
                .then(cfg => {
                    return netns.exec(`ip link set dev ${cfg.device} up mtu 1500`)
                        .then(() => netns.exec(`ip addr add dev ${cfg.device} ${cfg.localIp}/${cfg.localNetmask} peer ${cfg.vpnGateway}`))
                        .then(() => netns.exec(`ip route add ${cfg.vpnHost}/32 via ${netns.config.ipDefault}`))
                        .then(() => netns.exec(`ip route add 0.0.0.0/1 via ${cfg.vpnGateway}`))
                        .then(() => netns.exec(`ip route add 128.0.0.0/1 via ${cfg.vpnGateway}`));
                })
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
            '--ifconfig-noexec',
            '--route-noexec',
        ];
        if (opts.configPath) {
            commandParams.push(`--config ${opts.configPath}`);
        }
        return commandParams.join(' ');
    }
};

