'use strict';

const util = require('./util.js');
const nns = require('nns');
const createManager = require('./management-api.js');

const CONNECTION_TIMEOUT = 20000;

module.exports = params => {
    const prefix = params.prefix || 'otc';
    const uniqueId = `${prefix}${Math.random()}`;
    const manager = createManager(uniqueId);

    return Promise.all([
        nns(Object.assign({prefix}, params.nns)),
        prepareConfig(params, manager.path),
        manager.listen()
    ])
        .then(result => {
            const nns = result[0];
            const config = result[1];
            const proc = nns.execNoWait(`openvpn ${config}`);
            // proc.stdout.on('data', buf => console.log(buf.toString()));
            // proc.stderr.on('data', buf => console.log(buf.toString()));
            return Promise.race([
                util.throwAfterTimeout(new Error('Timeout waiting for openvpn startup'), CONNECTION_TIMEOUT),
                manager.waitForConnectionInit({
                    user: params.user,
                    pass: params.pass
                }),
            ])
                .then(manager.getClientInterfaceConfig)
                .then(cfg => {
                    return nns.exec(`ip link set dev ${cfg.device} up mtu ${cfg.mtu}`)
                        .then(() => nns.exec(`ip addr add dev ${cfg.device} ${cfg.localIp}/${cfg.localNetmask} peer ${cfg.vpnGateway}`))
                        .then(() => nns.exec(`ip route add ${cfg.vpnHost}/32 via ${nns.config.ipDefault}`))
                        .then(() => nns.exec(`ip route add 0.0.0.0/1 via ${cfg.vpnGateway}`))
                        .then(() => nns.exec(`ip route add 128.0.0.0/1 via ${cfg.vpnGateway}`))
                        .then(() => cfg);
                })
                .then(cfg => ({
                    config: {
                        ip: cfg.localIp,
                        netmask: cfg.localNetmask
                    },
                    nns,
                    destroy: () => {
                        proc.kill('SIGHUP');
                        proc.on('error', () => util.exec(`kill -9 ${proc.pid}`));
                        return Promise.all([
                            nns.destroy(),
                            util.removeFilesWithPrefix('/tmp', uniqueId)
                        ]);
                    },
                    manager
                }));
        });

    function prepareConfig(config, managementPath) {
        return Promise.resolve()
            .then(() => {
                const openvpn = makeParams(Object.assign({}, config, {managementPath}));
                ['ca', 'cert', 'key', 'tls-auth'].forEach(param => {
                    if (config[param]) {
                        openvpn.push(`--${param}`);
                        if (looksLikePath(config[param])) {
                            openvpn.push(config[param]);
                        } else {
                            const path = `/tmp/${uniqueId}.${param}`;
                            openvpn.push(util.writeFile(path, config[param])
                                .then(() => {
                                    return path;
                                }));
                        }
                    }
                });
                if ('string' === typeof config.user && 'string' === typeof config.pass) {
                    openvpn.push('--management-query-passwords');
                    openvpn.push('--auth-user-pass');
                    // const path = `/tmp/${uniqueId}.userpass`;
                    // openvpn.push(util.writeFile(path, `${config.user}\n${config.pass}\n`)
                    //     .then(() => {
                    //         return path;
                    //     }));
                }
                return Promise.all(openvpn);
            })
            .then(params => params.join(' '));
    }

    function looksLikePath(string) {
        return ('string' === typeof string) && (string.split('\n').length === 1);
    }

    function makeParams(opts) {
        const commandParams = [
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
        ['config', 'comp-lzo', 'remote', 'port', 'proto', 'dev', 'key-direction'].forEach(param => {
            if (opts[param]) {
                commandParams.push(`--${param} ${opts[param]}`);
            }
        });
        return commandParams;
    }
};

