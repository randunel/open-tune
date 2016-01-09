'use strict';

let client = require('../').client;

client(getIntegrationTestConfig()).create().then(
    data => {
        console.log(data);
    }
);

function getIntegrationTestConfig() {
    // TODO(me): grab params env
    return {
        workingDirectory: '/tmp',
        config: '/home/mihai/.openvpn/lenovo.ovpn'
    };
}
