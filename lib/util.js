'use strict';

var spawn = require('child_process').spawn;

//exports.promiseTimeout = timeout => new Promise(rslv => setTimeout(rslv, timeout));

exports.throwAfterTimeout = (err, timeout) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => reject(err), timeout);
    });
};

exports.run = function(cmd, args, options) {
    var deferred = Promise.defer();
    var params;
    if ('string' === typeof args) {
        params = args.split(' ');
    } else {
        params = args;
    }
    console.log('run', cmd, params);
    var child = spawn(cmd, params, options);
    var res = '';
    var waiting = true;

    child.stdout.on('data', function(buf) {
        console.log('got buf for', cmd);
        res += buf.toString();
    });

    child.stdout.on('end', function(exitCode) {
        console.log('exit code is', exitCode);
        if (waiting) {
            console.log('done run', cmd);
            deferred.resolve(res);
            waiting = false;
        }
    });

    child.stderr.on('data', function(buf) {
        console.log('ERROR on', cmd, args);
        let err = buf.toString();
        console.log(err);
        if (waiting) {
            console.log('deferred.reject from run');
            deferred.reject(err);
            waiting = false;
        }
    });

    return deferred.promise;
};

exports.exec = function exec(cmd, options) {
    return new Promise((resolve, reject) => {
        let bin = cmd.split(' ').shift();
        let params = cmd.split(' ').slice(1);
        let child = spawn(bin, params, options);
        let res = new Buffer(0);
        let err = new Buffer(0);

        child.stdout.on('data', buf => res = Buffer.concat([res, buf], res.length + buf.length));
        child.stderr.on('data', buf => err = Buffer.concat([err, buf], err.length + buf.length));
        child.on('close', code => {
            return setImmediate(() => {
                // setImmediate is required because there are often still
                // pending write requests in both stdout and stderr at this point
                code ? reject(err.toString()) : resolve(res.toString());
            });
        });
    });
};

