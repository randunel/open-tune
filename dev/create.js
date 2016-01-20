'use strict';

let client = require('../').client;

let vpn = client(getIntegrationTestConfig());

vpn.create().then(
    data => {
        console.log(data);
    }
);

function getIntegrationTestConfig() {
    return {
        workingDirectory: '/tmp',
        config: './openvpn-config.ovpn'
    };
}

var signals = {
    'SIGINT': 2,
    'SIGTERM': 15
};

Object.keys(signals).forEach(signal =>
    process.on(signal, () =>
        shutdown(signal, signals[signal])
    )
);

function shutdown(signal, value) {
    vpn.destroy().then(() => {
        process.exit(value);
    });
}

