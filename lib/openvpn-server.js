'use strict';

module.exports = params => {
    const PATH_CA = params.ca;
    const PATH_CRT = params.crt;
    const PATH_KEY = params.key;
    const PATH_DH = params.dh;

    function _makeParams(opts) {
        let commandParams = [
            'port', '1194',
            'proto', 'udp',
            'dev', 'tun',
            'ca', PATH_CA,
            'cert', PATH_CRT,
            'key', PATH_KEY,
            'dh', PATH_DH,
            'server', opts.network, opts.netmask,
            'ifconfig-pool-persist', '/tmp/ipp.txt',
            'client-to-client',
            'keepalive', '10', '120',
            'comp-lzo',
            'user', 'nobody',
            'group', 'nogroup',
            'persist-key',
            'persist-tun',
            'verb', '0'
        ];
        return commandParams;
    }
};

