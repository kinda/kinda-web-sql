'use strict';

let assert = require('chai').assert;
let KindaWebSQL = require('../src');

suite('KindaWebSQL', function() {
  let connection = KindaWebSQL.create({ name: 'test' });

  test('2 + 3', async function() {
    let result = await connection.query('SELECT ? + ? AS solution', [2, 3]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].solution, 5);
  });

  test('simple queries', async function() {
    await connection.query('CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)');

    let result = await connection.query('INSERT INTO people (name, age) VALUES (?, ?)', ['Jean Dupont', 33]);
    assert.strictEqual(result.insertId, 1);

    result = await connection.query('SELECT * FROM people');
    assert.deepEqual(result[0], { id: 1, name: 'Jean Dupont', age: 33 });

    await connection.query('DROP TABLE people');
  });
});
