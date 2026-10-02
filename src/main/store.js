'use strict';

const fs = require('node:fs');
const path = require('node:path');

class Store {
  constructor(file, defaults) {
    this.file = file;
    this.defaults = defaults || {};
    this.data = {};
    this._timer = null;
    this.load();
  }

  load() {
    let raw = null;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch (_) {
      raw = null;
    }
    let parsed = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch (_) {
        parsed = null;
      }
    }
    this.data = Object.assign({}, this.defaults, parsed && typeof parsed === 'object' ? parsed : {});
    return this.data;
  }

  get(key) {
    if (key === undefined) return this.data;
    if (Object.prototype.hasOwnProperty.call(this.defaults, key) && !Object.prototype.hasOwnProperty.call(this.data, key)) {
      this.data[key] = JSON.parse(JSON.stringify(this.defaults[key]));
    }
    return this.data[key];
  }

  set(key, value) {
    if (typeof key === 'object' && key !== null) {
      Object.assign(this.data, key);
    } else {
      this.data[key] = value;
    }
    this.schedule();
  }

  schedule() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.save();
    }, 400);
    if (this._timer.unref) this._timer.unref();
  }

  save() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (_) {
      /* ignore */
    }
  }
}

module.exports = Store;