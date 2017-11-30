'use strict';

const { serialize, deserialize, clone } = require('../');
const vm = require('vm');
const assert = require('assert');
const util = require('util');

describe('cold-storage', function() {
  it('can clone simple data', function() {
    for (const obj of [
      0,
      -0,
      { a: 1 },
      { foo: 'string' },
      [ 1, 2, 3 ],
      'a'.repeat(1000),
      true,
      false,
      undefined,
      null,
      1e12
    ]) {
      // Can only use deepEqual here because of the lost prototype information.
      assert.deepEqual(obj, clone(obj));
    }
  });

  it('can clone functions', function() {
    assert.strictEqual(util.inspect(clone(function foo() {})),
                       '[Function: foo]');
    assert.strictEqual(clone(() => 42)(), undefined);
  });

  it('can clone NaN', function() {
    assert.strictEqual(util.inspect(clone(NaN)), 'NaN');
  });

  it('can handle native handles', function() {
    const { JSStream } = process.binding('js_stream');
    assert.strictEqual(clone(new JSStream()).constructor.name, 'JSStream');
  });

  it('can handle proxied functions', function() {
    assert.strictEqual(clone(new Proxy(function foo() {}, {})).name, 'foo');
  });

  it('can handle boxed primitives', function() {
    for (const v of [
      Object(Symbol('foo')),
      new Number(42),
      new String('abc'),
      new Boolean(true)
    ]) {
      assert.strictEqual(util.inspect(v.valueOf.call(v)),
                         util.inspect(v.valueOf.call(clone(v))));
    }
  });
});

describe('deserialize', function() {
  it('throws an error for invalid input', function() {
    assert.throws(() => deserialize());
    assert.throws(() => deserialize(Buffer.from('baz')));
    assert.throws(() => deserialize(Buffer.from('\x01baz')));
  });
});

describe('Function.prototype.toString', function() {
  it('still works', function() {
    assert.strictEqual((function bar() {}).toString(), 'function bar() {}');
  });

  it('works for cloned values', function() {
    assert.strictEqual(Function.prototype.toString.call(
        clone(function bar() {})), 'function bar() {}');
  });
});
