cold-storage
==============

[![NPM Version](https://img.shields.io/npm/v/cold-storage.svg?style=flat)](https://npmjs.org/package/cold-storage)
[![NPM Downloads](https://img.shields.io/npm/dm/cold-storage.svg?style=flat)](https://npmjs.org/package/cold-storage)
[![Build Status](https://travis-ci.org/addaleax/cold-storage.svg?style=flat&branch=master)](https://travis-ci.org/addaleax/cold-storage?branch=master)
[![Coverage Status](https://coveralls.io/repos/addaleax/cold-storage/badge.svg?branch=master)](https://coveralls.io/r/addaleax/cold-storage?branch=master)
[![Dependency Status](https://david-dm.org/addaleax/cold-storage.svg?style=flat)](https://david-dm.org/addaleax/cold-storage)

Full serialization/deserialization for JS objects.

Install:
`npm install cold-storage`

```js
// serialize returns a Buffer
// deserialize reads a Buffer
// clone is chaining the two
const { serialize, deserialize, clone } = require('cold-storage');

clone({ a: 1, b: 2 }) // => { a: 1, b: 2 }
clone({ deep: { value: null } }) // works with deep objects

clone({}) instanceof Object // false, even the prototypes are cloned
```

Breaking deserialization of existing serialized data is considered semver-major.

License
=======

MIT
