
'use strict';

// var should = require('should');
var openvpn = require('../').openvpn;

describe.skip('openvpn', function() {
    it('should work', () => {
        return openvpn({
            workingDirectory: '/tmp',
            config: '/home/mihai/.openvpn/lenovo.ovpn'
        }).create();
    });
});

