'use strict';
var spawn = require('child_process').spawn;

function run(cmd, args, options, cb) {
    if ('function' === typeof options) {
        cb = options;
        options = null;
    }
    var child = spawn(cmd, args, options);
    var res = '';

    child.stdout.on('data', function(buf) {
        res += buf.toString();
    });

    child.stdout.on('end', function() {
        cb(res);
    });

    child.stderr.on('data', function(buf) {
        console.log('ERROR on', cmd, args);
        console.log(buf.toString());
    });
}

String.prototype.grep = function(pattern) {
    var list = this.split('\n');
    var res = '';
    if ('string' === typeof pattern) {
        list.forEach(function(line) {
            if (line.indexOf(pattern) > -1) {
                res = res + '\n' + line;
            }
        });
    } else {
        list.forEach(function(line) {
            if (pattern.test(line)) {
                res = res + '\n' + line;
            }
        });
    }
    return res.substr(1);
};

run('ip', ['r', 'l'], function(out) {
    var list = out.grep('tun')
    if (!list) {
        return;
    }
    list = list.split('\n');
    list.length && list.forEach(function(route) {
        run('ip', ('r d ' + route).split('  ').join(' ').trim().split(' '), function() {});
    });
});
run('ip', ['rule', 'l'], function(out) {
    var list = out.grep('fwmark');
    if (!list) {
        return;
    }
    list = list.split('\n');
    list.length && list.forEach(function(rule) {
        run('ip', ('rule d ' + rule.split(':')[1].trim()).split('  ').join(' ').trim().split(' '), function() {});
    });
});

run('iptables', ['-F', '-t', 'nat'], function() {});
run('iptables', ['-F', '-t', 'mangle'], function() {});

run('killall', ['openvpn'], function() {});

run('dig', ['+short', 'server.ub.io'], function(out) {
    out.split('\n').forEach(function(ip) {
        if (ip) {
            run('ip', ['r', 'd', ip], function() {});
        }
    });
});

run('dig', ['+short', 'api.ub.io'], function(out) {
    out.split('\n').forEach(function(ip) {
        if (ip) {
            run('ip', ['r', 'd', ip], function() {});
        }
    });
});

if (process.env.SSH_CLIENT) {
    run('ip', ('r d ' + process.env.SSH_CLIENT.split(' ')[0]).split(' '), function() {});
}

