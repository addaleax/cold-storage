'use strict';

const serialize = require('./serialize');
const deserialize = require('./deserialize');

function clone(value) {
  return deserialize(serialize(value));
}

module.exports = {
  serialize,
  deserialize,
  clone
};
