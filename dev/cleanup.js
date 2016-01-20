'use strict';

let util = require('../lib/util');

util.exec('killall openvpn').catch(() => {}).then(
    () => util.exec('ip netns list')
).then(
    list => Promise.all(
        list
        .split('\n')
        .filter(line => !!line)
        .map(line => util.exec(`ip netns delete ${line}`))
    )
).then(
    () => util.exec('ip link show')
).then(
    list => Promise.all(
        list
        .split('\n')
        .filter(line => /\d+:\s/.test(line))
        .map(line => line.split(':')[1].trim())
        .filter(device => /veth_ot/.test(device))
        .map(device => util.exec(`ip link delete ${device.split('@')[0]}`))
    )
).then(
    () => util.exec('ip route show')
).then(
    list => Promise.all(
        list
        .split('\n')
        .filter(line => /169\./.test(line))
        .map(line => util.exec(`ip route delete ${line}`))
    )
).then(
    () => util.exec('iptables -t nat -vnL --line-numbers')
).then(
    list => {
        let promise = Promise.resolve();
        list
        .split('\n')
        .filter(line => /\s+169\./.test(line))
        .reverse()
        .forEach(line => {
            promise = promise.then(() => util.exec(`iptables -t nat -D POSTROUTING ${line.split(' ')[0]}`));
        });
        return promise;
    }
);

