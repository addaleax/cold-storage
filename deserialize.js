'use strict';

const realFunctionToString = Function.prototype.toString;
const functionStrings = new WeakMap();
Function.prototype.toString = function() {
  /* wrapper added by the cold-storage module */
  const maybeStringified = functionStrings.get(this);
  if (maybeStringified !== undefined)
    return maybeStringified;
  return realFunctionToString.call(this);
};

const c = Function.prototype.call.bind(String.prototype.charCodeAt);

const isBigEndian = (() => {
  const u16 = new Uint16Array([0x0102]);
  const u8 = new Uint8Array(u16.buffer);
  return u8[0] === 0x01;
})();

const PlaceholderSymbol = Symbol('This symbol serves as a placeholder');

class Context {
  constructor(buffer) {
    this.buffer = buffer;
    if (this.buffer[0] !== 2)
      throw new Error('cannot understand serialization format');
    this.seen = [];
    this.position = 1;
  }

  readByte() {
    return this.buffer[this.position++];
  }

  readFloat64() {
    const aligned = Buffer.alloc(8);
    this.buffer.copy(aligned, 0, this.position);
    this.position += 8;
    /* istanbul ignore next */
    if (isBigEndian) aligned.swap64();
    return (new Float64Array(aligned.buffer))[0];
  }

  readUint32() {
    const aligned = Buffer.alloc(4);
    this.buffer.copy(aligned, 0, this.position);
    this.position += 4;
    /* istanbul ignore next */
    if (isBigEndian) aligned.swap32();
    return (new Uint32Array(aligned.buffer))[0];
  }

  readRawString(length) {
    const str = this.buffer.toString('utf8',
                                     this.position,
                                     this.position + length);
    this.position += length;
    return str;
  }

  deserialize(projectOn = undefined) {
    const type = this.readByte();
    switch (type) {
      case c `n`: return null;
      case c `u`: return undefined;
      case c `f`: return false;
      case c `t`: return true;
      case c `I`: return this.readUint32() | 0;
      case 0:
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
      case 6:
      case 7: return (type << 8) + this.readByte();
      case c `N`: return this.readFloat64();
      case c `R`: return this.seen[this.readUint32()];
      case c `s`:
        const length = this.deserialize();
        const str = this.readRawString(length);
        this.seen.push(str);
        return str;
      case c `S`:
        const phIndex = this.seen.push(PlaceholderSymbol) - 1;
        const sym = Symbol(this.deserialize());
        this.seen[phIndex] = sym;
        return sym;
    }
    let obj;
    if (type === c `F`) {
      obj = function() {};
      this.seen.push(projectOn || obj);
      const stringified = this.deserialize();
      functionStrings.set(obj, stringified);
    } else if (type === c `[`) {
      obj = [];
      this.seen.push(projectOn || obj);
    } else {
      if (type !== c `{`)
        throw new Error(`Invalid serialization data (Type ${type} ` +
          `(${String.fromCharCode(type)}) at ${this.position} unknown))`);
      obj = {};
      const index = this.seen.push(projectOn || obj) - 1;

      const boxIndex = this.readByte();
      if (boxIndex !== 0xff) {
        if (boxIndex === 2 /* Date */)
          obj = new Date(this.deserialize());
        else
          obj = Object(this.deserialize());
        this.seen[index] = obj;
      }
    }

    {
      const pproto = projectOn && Object.getPrototypeOf(projectOn);
      const proto = this.deserialize(pproto);
      Object.setPrototypeOf(obj, proto);
    }

    while (this.buffer[this.position] !== c `}`) {
      const key = this.deserialize();
      const flags = this.readByte();
      const descriptor = {
        enumerable: !!(flags & 0x01),
        configurable: !!(flags & 0x02)
      };
      const pd =
        (projectOn && Object.getOwnPropertyDescriptor(projectOn, key)) || {};
      if (flags & 0x04) {
        descriptor.writable = !!(flags & 0x08);
        descriptor.value = this.deserialize(pd.value);
      } else {
        descriptor.get = this.deserialize(pd.get);
        descriptor.set = this.deserialize(pd.set);
      }
      Object.defineProperty(obj, key, descriptor);
    }
    this.position++;
    return obj;
  }
}


function deserialize(buffer) {
  const ctx = new Context(buffer);
  return ctx.deserialize();
}

module.exports = deserialize;
module.exports.Context = Context;
