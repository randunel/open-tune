
'use strict';

// var should = require('should');
var openvpn = require('../').openvpn;

describe('openvpn', function() {
    it('should work', () => {
        return openvpn.create({
            config: '/Users/anatoliy/Downloads/client-anatoliy.ovpn'
        });
    });
});

