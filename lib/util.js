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
    var child = spawn(cmd, args, options);
    var res = '';
    var waiting = true;

    child.stdout.on('data', function(buf) {
        res += buf.toString();
    });

    child.stdout.on('end', function(exitCode) {
        console.log('exit code is', exitCode);
        if (waiting) {
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

