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

describe('yields re-serializable output', function() {
  it('works', function() {
    this.timeout(10000);
    const ser1 = serialize(global);
    const des1 = deserialize(ser1);
    const ser2 = serialize(des1);
    const des2 = deserialize(ser2);
    const ser3 = serialize(des2);
  });
});

describe('works with pre-forkable globals', function() {
  it('works', function() {
    this.timeout(10000);
    const input = { foo: 'bar' };

    const sctx = new serialize.Context();
    sctx.serialize({ global });
    const fctx = sctx.fork();
    fctx.serialize(input);
    const buf = fctx.getBuffer();
    const dctx = new deserialize.Context(buf);
    dctx.deserialize({ global });

    const output = dctx.deserialize();
    assert.deepStrictEqual(output, input);
    assert.notStrictEqual(output, input);
    assert.strictEqual(Object.getPrototypeOf(output), Object.prototype);
  });
});
