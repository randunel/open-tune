'use strict';

let util = require('./util.js');
let nns = require('nns');
let createManager = require('./management-api.js');

const CONNECTION_TIMEOUT = 20000;

module.exports = params => {
    const uniqueId = `ots${Math.random()}`;
    const manager = createManager(uniqueId);
    const network = params.network || '10.1.2.0 255.255.255.0';
    const port = params.port || 1194;

    return Promise.all([
        nns({prefix: 'ots'}),
        manager.listen()
    ])
        .then(result => {
            let netns = result[0];
            let proc = netns.execNoWait('openvpn ' + makeParams({
                pathManager: manager.path,
                pathCA: params.pathCA,
                pathDH: params.pathDH,
                pathCERT: params.pathCERT,
                pathKEY: params.pathKEY,
                network,
                port
            }));
            // proc.stdout.on('data', buf => console.log(buf.toString()));
            // proc.stderr.on('data', buf => console.log(buf.toString()));
            return Promise.race([
                util.throwAfterTimeout(new Error('Timeout waiting for openvpn startup'), CONNECTION_TIMEOUT),
                manager.waitForConnectionInit(),
            ])
                .then(manager.getServerConfig)
                .then(cfg => {
                    return netns.exec(`ip link set dev ${cfg.device} up mtu ${cfg.mtu}`)
                        .then(() => netns.exec(`ip addr add dev ${cfg.device} ${cfg.localIp}/${cfg.localNetmask} peer ${cfg.localIp}`))
                        .then(() => netns.exec(`ip route add ${util.subnetFromIpMask(cfg.localIp, util.ipFromInt(util.intFromMask(cfg.localNetmask)))}/${cfg.localNetmask} dev ${cfg.device} src ${cfg.localIp}`))
                        // If the network namespace doesn't enable masquerade,
                        // it must be enabled at this point
                        // .then(() => netns.exec(`iptables -t nat -A POSTROUTING -o veth0 -j MASQUERADE`))
                        .then(() => cfg);
                })
                .then(cfg => ({
                    nns: netns,
                    cfg,
                    id: uniqueId,
                    destroy: () => {
                        proc.kill('SIGHUP');
                        proc.on('error', () => util.exec(`kill -9 ${proc.pid}`));
                        return netns.destroy();
                    },
                    manager
                }));
        });
};

function makeParams(opts) {
    let commandParams = [
        '--mode server',
        '--topology subnet',
        `--server ${opts.network}`,
        '--dev tun',
        '--client-to-client',
        '--tls-server',
        `--ca ${opts.pathCA}`,
        `--dh ${opts.pathDH}`,
        `--cert ${opts.pathCERT}`,
        `--key ${opts.pathKEY}`,
        `--management ${opts.pathManager} unix`,
        '--management-client',
        '--management-signal',
        '--management-up-down',
        '--keepalive 10 60',
        `--port ${opts.port}`,
        '--push redirect-gateway',
        '--push def1',
        '--push bypass-dhcp',
        '--verb 4',
        '--ifconfig-noexec',
        '--route-noexec',
    ];
    return commandParams.join(' ');
}

