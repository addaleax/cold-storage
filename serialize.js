'use strict';

/* istanbul ignore next */
const hasBrokenStreamBase = (() => {
  /* work around https://github.com/nodejs/node/pull/16860 */
  if (typeof process === 'undefined') return false;
  const version = String(process.version).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!version) return false;
  return (+version[1] === 9 && +version[2] < 2) ||
         (+version[1] === 8 && +version[2] >= 9 && +version[3] < 2);
})();

const isBigEndian = (() => {
  const u16 = new Uint16Array([0x0102]);
  const u8 = new Uint8Array(u16.buffer);
  return u8[0] === 0x01;
})();

const ObjectPrototypeToString =
    Function.prototype.call.bind(Object.prototype.toString);

function tryStringifyFunction(fn) {
  try {
    return String(fn);
  } catch (e) {
    return 'function() { /* could not stringify function */ }';
  }
}

const ValueOfs = [Symbol, Number, Date, Boolean, String]
    .map(x => Function.prototype.call.bind(x.prototype.valueOf));

class Context {
  constructor() {
    this.seen = new Map();
    this.counter = 0;
    this.target = [];
    this._curbuf = Buffer.alloc(4096);
    this._curbuf[0] = 2; // version
    this.position = 1;
  }

  fork() {
    this.flush();
    const context = new Context();
    context.seen = new Map([...this.seen]);
    context.counter = this.counter;
    context.target = this.target;
    context.position = this.position;
    return context;
  }

  getBuffer() {
    this.flush();
    if (this.target.length !== 1) {
      this.target = [ Buffer.concat(this.target) ];
    }
    return this.target[0];
  }

  flush() {
    if (this.position === 0)
      return;
    this.target.push(this._curbuf.slice(0, this.position));
    this._curbuf = Buffer.alloc(4096);
    this.position = 0;
  }

  get curbuf() {
    if (this._curbuf.length - this.position < 16)
      this.flush();
    return this._curbuf;
  }

  pushByte(b) {
    this.curbuf[this.position++] = b;
  }

  pushChar(c) {
    this.curbuf[this.position++] = c.charCodeAt(0);
  }

  pushFloat64(f64) {
    const arr = new Float64Array([f64]);
    const asUint8 = new Uint8Array(arr.buffer);
    /* istanbul ignore next */
    if (isBigEndian) asUint8.swap64();
    this.curbuf.set(asUint8, this.position);
    this.position += 8;
  }

  pushUint32(u32) {
    const p = this.position;
    /* istanbul ignore next */
    if (isBigEndian) {
      this.curbuf[p+3] = (u32 & 0xff);
      this.curbuf[p+2] = ((u32 >> 8) & 0xff);
      this.curbuf[p+1] = ((u32 >> 16) & 0xff);
      this.curbuf[p+0] = (u32 >>> 24);
    } else {
      this.curbuf[p+0] = (u32 & 0xff);
      this.curbuf[p+1] = ((u32 >> 8) & 0xff);
      this.curbuf[p+2] = ((u32 >> 16) & 0xff);
      this.curbuf[p+3] = (u32 >>> 24);
    }
    this.position += 4;
  }

  pushRawString(str) {
    const len = Buffer.byteLength(str);
    if (len >= 512 || len > this._curbuf.length - this.position) {
      this.flush();
      this.target.push(Buffer.from(str));
      return;
    }
    this._curbuf.write(str, this.position);
    this.position += len;
  }

  serialize(value) {
    if (value === null)
      return this.pushChar('n');
    if (value === undefined)
      return this.pushChar('u');
    if (value === false)
      return this.pushChar('f');
    if (value === true)
      return this.pushChar('t');
    if (typeof value === 'number') {
      if (value >= 0 && value < (1 << 11) && Number.isInteger(value) &&
          1/value !== -Infinity) {
        this.pushByte(value >> 8);
        this.pushByte(value & 0xff);
        return;
      }
      if ((value | 0) === value) {
        this.pushChar('I');
        this.pushUint32(value >>> 0);
        return;
      }
      this.pushChar('N');
      this.pushFloat64(value);
      return;
    }
    const entry = this.seen.get(value);
    if (entry !== undefined) {
      this.pushChar('R');
      this.pushUint32(entry);
      return;
    }
    this.seen.set(value, this.counter++);
    switch (typeof value) {
      case 'string':
        this.pushChar('s');
        this.serialize(Buffer.byteLength(value));
        this.pushRawString(value);
        return;
      case 'symbol':
        const stringified = String(value);
        this.pushChar('S');
        this.serialize(stringified.substr(7, stringified.length - 8));
        return;
      case 'function':
      case 'object':
        if (typeof value === 'function') {
          this.pushChar('F');
          this.serialize(tryStringifyFunction(value));
        } else if (Array.isArray(value)) {
          this.pushChar('[');
        } else {
          const tag = ObjectPrototypeToString(value);
          this.pushChar('{');

          let unboxed, i = 0;
          if (tag !== '[object Object]') {
            for (const v of ValueOfs) {
              try {
                unboxed = v(value);
              } catch (err) { i++; continue; }
              this.pushByte(i);
            }
          }
          if (unboxed !== undefined)
            this.serialize(unboxed);
          else
            this.pushByte(0xff);
        }

        this.serialize(Object.getPrototypeOf(value));

        const keys = Reflect.ownKeys(value);
        for (const key of keys) {
          /* istanbul ignore next */
          if (hasBrokenStreamBase &&
              (key === 'fd' || key === '_externalStream' ||
               key === 'bytesRead')) {
            if (keys.includes('fd') && keys.includes('_externalStream') &&
                keys.includes('bytesRead'))
              continue;
          }
          let descriptor;
          try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
          } catch (e) { continue; }
          this.serialize(key);
          let flags = 0;
          if (descriptor.enumerable)
            flags |= 1;
          if (descriptor.configurable)
            flags |= 2;
          if (descriptor.hasOwnProperty('value')) {
            flags |= 4;
            if (descriptor.writable)
              flags |= 8;
            this.pushByte(flags);
            this.serialize(descriptor.value);
          } else {
            this.pushByte(flags);
            this.serialize(descriptor.get);
            this.serialize(descriptor.set);
          }
        }
        this.pushChar('}');
        return;
    }
  }
}


function serialize(value) {
  const ctx = new Context();
  ctx.serialize(value);
  return ctx.getBuffer();
}

module.exports = serialize;
module.exports.Context = Context;
