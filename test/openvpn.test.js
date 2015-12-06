
'use strict';

// var should = require('should');
var openvpn = require('../').openvpn;

describe('openvpn', function() {
    it('should work', () => {
        return openvpn({
            workingDirectory: '/tmp',
            config: __dirname + '/../work/client-anatoliy.ovpn'
        }).create();
    });
});

