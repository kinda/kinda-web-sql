'use strict';

let _ = require('lodash');
let AwaitLock = require('await-lock');
let KindaObject = require('kinda-object');

let KindaWebSQL = KindaObject.extend('KindaWebSQL', function() {
  this.creator = function(options = {}) {
    if (!options.name) throw new Error('WebSQL database name is missing');
    let shortName = options.name;
    let version = options.version || '1.0';
    let displayName = options.displayName || options.name;
    let maxSize = options.maxSize || (50 * 1024 * 1024); // 50 MB
    this.database = openDatabase(shortName, version, displayName, maxSize);
    this.awaitLock = new AwaitLock();
  };

  this.lock = async function(fn) {
    await this.awaitLock.acquireAsync();
    try {
      return await fn();
    } finally {
      this.awaitLock.release();
    }
  };

  this.query = async function(sql, values) {
    return await this.lock(async function() {
      return await this._query(sql, values);
    }.bind(this));
  };

  this._query = async function(sql, values) {
    values = this.normalizeValues(values);
    let result = await this.__query(sql, values);
    result = this.normalizeResult(result);
    return result;
  };

  this.__query = function(sql, values) {
    return new Promise((resolve, reject) => {
      let result;
      this.database.transaction(function(tr) {
        tr.executeSql(sql, values, function(innerTr, res) {
          result = res;
        });
      }, function(err) { // transaction error callback
        reject(err);
      }, function() { // transaction success callback
        resolve(result);
      });
    });
  };

  this.transaction = async function(fn) {
    return await this.lock(async function() {
      return await fn({ query: this._query.bind(this) });
    }.bind(this));
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
