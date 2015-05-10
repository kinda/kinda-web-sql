'use strict';

var _ = require('lodash');
var co = require('co');
var KindaObject = require('kinda-object');

var KindaWebSQL = KindaObject.extend('KindaWebSQL', function() {
  this.setCreator(function(name, options) {
    if (!options) options = {};
    var shortName = name;
    var version = options.version || '1.0';
    var displayName = options.displayName || name;
    var maxSize = options.maxSize || (50 * 1024 * 1024); // 50 MB
    this.database = openDatabase(shortName, version, displayName, maxSize);
  });

  this.query = function(sql, values) {
    var that = this;
    values = that.normalizeValues(values);
    var result = undefined;
    return function(cb) {
      that.database.transaction(function(tr) {
        tr.executeSql(sql, values, function(tr, res) {
          result = that.normalizeResult(res);
        });
      }, function(err) { // transaction error callback
        cb(err);
      }, function() { // transaction success callback
        cb(null, result);
      });
    };
  };

  this.transaction = function(fn, options) {
    var that = this;
    return function(cb) {
      var lastErr;
      var transactionAborted;
      that.database.transaction(function(tr) {
        co(function *() {
          try {
            yield fn({
              query: function(sql, values) {
                values = that.normalizeValues(values);
                return function(innerCB) {
                  try {
                    tr.executeSql(sql, values, function(tr, res) {
                      innerCB(null, that.normalizeResult(res));
                    }, function(tr, err) {
                      transactionAborted = true;
                      innerCB(err);
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
        if (typeof val === 'undefined')
          val = null
        else if (Buffer.isBuffer(val))
          val = "bin!" + val.toString('hex');
        return val;
      });
    }
    return values;
  };

  this.normalizeResult = function(result) {
    if (!result) return result;
    var normalizedResult = [];
    if (result.rowsAffected != null)
      normalizedResult.affectedRows = result.rowsAffected;
    try {
      if (result.insertId != null)
        normalizedResult.insertId = result.insertId;
    } catch (err) {}
    if (!result.rows) return normalizedResult;
    for (var i = 0; i < result.rows.length; i++) {
      var row = result.rows.item(i);
      var normalizedRow = {};
      _.forOwn(row, function(val, key) {
        if (val && val.substr && val.substr(0, 4) === 'bin!')
          val = new Buffer(val.substr(4), 'hex');
        normalizedRow[key] = val;
      });
      normalizedResult.push(normalizedRow);
    }
    return normalizedResult;
  };
});

module.exports = KindaWebSQL;
