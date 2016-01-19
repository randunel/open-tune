'use strict';

let util = require('./util.js');

const PREFIX = 'ot';
const IP_START = '169.254.1.0';
const IP_MASK = 30;

exports.setupNNS = nns => {
    let name = nns.name;
    let vethDefault = nns.vethDefault;
    let vethNNS = nns.vethNNS;
    let ipDefault = nns.ipDefault;
    let ipNNS = nns.ipNNS;
    let netmask = nns.netmask;
    let network = nns.network;
    const NNSEXEC = `ip netns exec ${name}`;
    return util.exec(`ip netns del ${name}`).catch(() => {
        // Clean up network namespace in case it already exists. Start fresh.
    }).then(
        // Create network namespace
        () => util.exec(`ip netns add ${name}`)
    ).then(
        // Set up loopback interface. This step is optional, but some
        // programs may exhibit unexpected behaviour should one not exist
        () => util.exec(`${NNSEXEC} ip link set dev lo up`)
    ).then(
        // Set up a veth pair
        () => util.exec(`ip link add ${vethDefault} type veth peer name ${vethNNS}`)
    ).then(
        // Move a veth endpoint to the network namespace
        () => util.exec(`ip link set ${vethNNS} netns ${name}`)
    ).then(
        // Assign static ip address to veth outside namespace
        () => util.exec(`ip addr add ${ipDefault}/${netmask} dev ${vethDefault}`)
    ).then(
        () => util.exec(`ip link set ${vethDefault} up`)
    ).then(
        // Assign static ip address to veth inside network namespace
        () => util.exec(`${NNSEXEC} ip addr add ${ipNNS}/${netmask} dev ${vethNNS}`)
    ).then(
        () => util.exec(`${NNSEXEC} ip link set up dev ${vethNNS}`)
    ).then(
        // Enable routing inside network namespace for packets from the outside
        () => util.exec(`${NNSEXEC} iptables -t nat -A POSTROUTING -s ${ipDefault} -j MASQUERADE`)
    ).then(
        // Allow packets forwarding
        () => util.exec(`${NNSEXEC} sysctl net.ipv4.ip_forward=1`)
    ).then(
        () => util.exec(`${NNSEXEC} sysctl net.ipv4.conf.${vethNNS}.forwarding=1`)
    ).then(
        () => util.exec(`${NNSEXEC} sysctl net.ipv4.conf.${vethNNS}.proxy_arp=1`)
    ).then(
        // Use masquerate to change source ip address from nns to default
        //
        // Alternatively, SNAT (faster) can be used, but that means the
        // public ip address of the interface needs to be retrieved, and it
        // would not survive ip address changes
        // iptables -t nat -D POSTROUTING -s 169.254.254.2 -o PUBLIC_INTERFACE -j SNAT --to-source IP_ADDRESS_OF_PUBLIC_INTERFACE
        () => util.exec(`iptables -t nat -A POSTROUTING -s ${ipNNS} -j MASQUERADE`)
    ).then(
        // Remove filter to allow packet replies from nns to default
        () => util.exec(`sysctl net.ipv4.conf.${vethDefault}.rp_filter=2`)
    ).then(
        // Loosen up reverse path filtering on all interfaces
        // TODO(me): I don't know why this affects some linux installations. Individual
        // rules per-interface should work (but they don't always do)
        () => util.exec(`sysctl net.ipv4.conf.all.rp_filter=2`)
    ).then(
        // Path from default to namespace address
        () => util.exec(`ip route add ${network}/${netmask} dev ${vethDefault}`)
    ).catch(err => {
        if (err.includes('File exists')) {
            // Route already exists, possibly from other runs. Delete and try again
            return util.exec(`ip route del ${network}/${netmask}`).then(
                () => util.exec(`ip route add ${network}/${netmask} dev ${vethDefault}`)
            );
        }
        return Promise.reject(err);
    }).then(
        // Path from namespace to default
        () => util.exec(`${NNSEXEC} ip route add ${ipDefault}/32 dev ${vethNNS}`)
    ).then(
        () => util.exec(`sysctl net.ipv4.conf.${vethDefault}.proxy_arp=1`)
    ).then(
        // DNS resolver is namespace specific
        () => util.exec(`mkdir -p /etc/netns/${name}`)
    ).then(
        () => util.writeFile(`/etc/netns/${name}/resolv.conf`, 'nameserver 8.8.8.8\n')
    ).then(
        // Get default routes to the outside world.
        //
        // In order to allow programs running inside the network namespace
        // to access the real gateway and the local network, the route must
        // be set explicitly inside the nns
        () => util.exec(`ip route get 128.0.0.0/1`)
    ).then(
        route => {
            if (!route || route.indexOf('via') === -1) {
                return;
            }
            let immediateGateway = route.split('via ')[1].split(' ')[0];
            if (!immediateGateway) {
                console.error(`Could not extract gateway from ${route}.`);
                return;
            }
            immediateGateway = immediateGateway.trim();
            return util.exec(`ip route show match ${immediateGateway}`).then(
                route => {
                    let srcLine = route.split('\n').find(line => line.indexOf(' src ') > -1);
                    if (!srcLine) {
                        console.error(`Could not extract src from ${route}.`);
                        return;
                    }
                    let immediateNetwork = srcLine.trim().split(' ')[0];
                    return util.exec(`${NNSEXEC} ip route add ${immediateNetwork} dev ${vethNNS}`);
                }
            );
        }
    );
};

exports.getUnusedNNS = () => {
    return Promise.all([
        _getUnusedNNS(), // 'ot123'
        _getUnusedNetwork() // '169.254.123.0'
    ]).then(nnsData => {
        let intNetwork = _intFromIP(nnsData[1]);
        return {
            name: nnsData[0],
            vethDefault: `veth_${nnsData[0]}`,
            vethNNS: 'veth0',
            netmask: IP_MASK,
            network: nnsData[1],
            ipDefault: _ipFromInt(intNetwork + 1),
            ipNNS: _ipFromInt(intNetwork + 2),
            broadcast: _ipFromInt(intNetwork | (~_intFromMask(IP_MASK)))
        };
    });
};

exports.destroy = nns => {
    return Promise.all([
        util.exec(`ip netns del ${nns.name}`),
        util.exec(`ip link del ${nns.vethDefault}`),
        util.exec(`iptables -t nat -D POSTROUTING -s ${nns.ipNNS} -j MASQUERADE`),
        util.exec(`ip route del ${nns.network}/${nns.netmask} dev ${nns.vethDefault}`).catch(err => {
            if (err.includes('Cannot find device')) {
                return;
            }
            return Promise.reject(err);
        }),
    ]);
};

function _getUnusedNNS() {
    return util.exec('ip netns list').then(list => {
        let lines = list.split('\n');
        return findNextUnused(0);

        function findNextUnused(counter) {
            let nnsName = `${PREFIX}${counter}`;
            if (lines.find(name => name === nnsName)) {
                return findNextUnused(counter + 1);
            }
            return nnsName;
        }
    });
}

function _getUnusedNetwork() {
    return util.exec('ip link show').then(list => Promise.all(
        list
            .split('\n')
            .filter(line => /\d+:\s/.test(line))
            .map(line => line.split(':')[1].trim())
            .map(device => util.exec(`ip addr show ${device}`).then(list => {
                let inetLine = list.split('\n').find(line => /inet\s/.test(line));
                if (!inetLine) {
                    return;
                }
                return inetLine.split('inet ')[1].split(' ')[0];
            }))
    )).then(ips => {
        let unavailableNetworks = ips
            .filter(ip => /^169\./.test(ip))
            .map(ip => ip.split('/')[0])
            .map(ip => _intFromIP(ip) & _intFromMask(IP_MASK));
        return findNextUnused(0);

        function findNextUnused(counter) {
            let network = _intFromIP(IP_START) + (Math.abs(_intFromMask(IP_MASK)) * counter);
            if (unavailableNetworks.find(uNetwork => uNetwork === network)) {
                return findNextUnused(counter + 1);
            }
            return _ipFromInt(network);
        }
    });
}

function _ipFromInt(n) {
    return `${(n >> 24) & 0xff}.${(n >> 16) & 0xff}.${(n >> 8) & 0xff}.${n & 0xff}`;
}

function _intFromIP(ip) {
    return ip
    .split('.')
    .map((chunk, ix) => Number(chunk) << ((3 - ix) * 8))
    .reduce((prev, curr) => prev + curr, 0);
}

function _intFromMask(mask) {
    return -1 << (32 - mask);
}

