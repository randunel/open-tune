'use strict';

let util = require('./util.js');
let nns = require('nns');
let createManager = require('./management-api.js');

const CONNECTION_TIMEOUT = 20000;

module.exports = params => {
    let uniqueId = `otc${Math.random()}`;
    let manager = createManager(uniqueId);

    return Promise.all([
        nns(Object.assign({prefix: 'otc'}, params.nns)),
        manager.listen()
    ])
        .then(result => {
            let netns = result[0];
            let proc = netns.execNoWait('openvpn ' + makeParams(Object.assign({}, params, {
                managementPath: manager.path
            })));
            // proc.stdout.on('data', buf => console.log(buf.toString()));
            // proc.stderr.on('data', buf => console.log(buf.toString()));
            return Promise.race([
                util.throwAfterTimeout(new Error('Timeout waiting for openvpn startup'), CONNECTION_TIMEOUT),
                manager.waitForConnectionInit(),
            ])
                .then(manager.getClientInterfaceConfig)
                .then(cfg => {
                    return netns.exec(`ip link set dev ${cfg.device} up mtu ${cfg.mtu}`)
                        .then(() => netns.exec(`ip addr add dev ${cfg.device} ${cfg.localIp}/${cfg.localNetmask} peer ${cfg.vpnGateway}`))
                        .then(() => netns.exec(`ip route add ${cfg.vpnHost}/32 via ${netns.config.ipDefault}`))
                        .then(() => netns.exec(`ip route add 0.0.0.0/1 via ${cfg.vpnGateway}`))
                        .then(() => netns.exec(`ip route add 128.0.0.0/1 via ${cfg.vpnGateway}`))
                        .then(() => cfg);
                })
                .then(cfg => ({
                    config: {
                        ip: cfg.localIp,
                        netmask: cfg.localNetmask
                    },
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
            '--client',
            '--nobind',
            '--topology subnet',
            `--management ${opts.managementPath} unix`,
            '--management-client',
            '--management-signal',
            '--management-up-down',
            '--ifconfig-noexec',
            '--route-noexec',
            '--ns-cert-type server',
        ];
        ['config', 'remote', 'proto', 'dev', 'ca', 'cert', 'key'].forEach(param => {
            if (opts[param]) {
                commandParams.push(`--${param} ${opts[param]}`);
            }
        });
        return commandParams.join(' ');
    }
};

