'use strict';

let _ = require('lodash');
let co = require('co');
let KindaObject = require('kinda-object');

let KindaWebSQL = KindaObject.extend('KindaWebSQL', function() {
  this.creator = function(options = {}) {
    if (!options.name) throw new Error('WebSQL database name is missing');
    let shortName = options.name;
    let version = options.version || '1.0';
    let displayName = options.displayName || options.name;
    let maxSize = options.maxSize || (50 * 1024 * 1024); // 50 MB
    this.database = openDatabase(shortName, version, displayName, maxSize);
  };

  this.query = function(sql, values) {
    let that = this;
    values = that.normalizeValues(values);
    let result;
    return function(cb) {
      that.database.transaction(function(tr) {
        tr.executeSql(sql, values, function(innerTr, res) {
          result = that.normalizeResult(res);
        });
      }, function(err) { // transaction error callback
        cb(err);
      }, function() { // transaction success callback
        cb(null, result);
      });
    };
  };

  this.transaction = function(fn) {
    let that = this;
    return function(cb) {
      let lastErr;
      let transactionAborted;
      that.database.transaction(function(tr) {
        co(function *() {
          try {
            yield fn({
              query(sql, values) {
                values = that.normalizeValues(values);
                return function(innerCb) {
                  try {
                    tr.executeSql(sql, values, function(innerTr, res) {
                      innerCb(null, that.normalizeResult(res));
                    }, function(innerTr, err) {
                      transactionAborted = true;
                      innerCb(err);
                      return true;
                    });
                  } catch (err) {
                    cb(err);
                  }
                };
              }
            });
          } catch (err) {
            lastErr = err;
            if (!transactionAborted) {
              transactionAborted = true;
              tr.executeSql('arghhhh'); // force the transaction to fail
            }
          }
        })();
      }, function(err) { // transaction error callback
        cb(lastErr || err);
      }, function() { // transaction success callback
        cb(null);
      });
    };
  };

  this.normalizeValues = function(values) {
    if (values && values.length) {
      values = _.map(values, function(val) {
        if (typeof val === 'undefined') {
          val = null;
        } else if (Buffer.isBuffer(val)) {
          val = 'bin!' + val.toString('hex');
        }
        return val;
      });
    }
    return values;
  };

  this.normalizeResult = function(result) {
    if (!result) return result;
    let normalizedResult = [];
    if (result.rowsAffected != null) {
      normalizedResult.affectedRows = result.rowsAffected;
    }
    try {
      if (result.insertId != null) {
        normalizedResult.insertId = result.insertId;
      }
    } catch (err) {
      // noop
    }
    if (!result.rows) return normalizedResult;
    for (let i = 0; i < result.rows.length; i++) {
      let row = result.rows.item(i);
      let normalizedRow = {};
      _.forOwn(row, function(val, key) { // eslint-disable-line no-loop-func
        if (val && val.substr && val.substr(0, 4) === 'bin!') {
          val = new Buffer(val.substr(4), 'hex');
        }
        normalizedRow[key] = val;
      });
      normalizedResult.push(normalizedRow);
    }
    return normalizedResult;
  };
});

module.exports = KindaWebSQL;
