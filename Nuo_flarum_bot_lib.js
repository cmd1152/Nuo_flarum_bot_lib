const fetch = require('node-fetch');

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;

  if (obj instanceof Date) return new Date(obj);

  if (obj instanceof RegExp) return new RegExp(obj);

  if (obj instanceof Map) {
    const mapClone = new Map();
    obj.forEach((value, key) => mapClone.set(deepClone(key), deepClone(value)));
    return mapClone;
  }

  if (obj instanceof Set) {
    const setClone = new Set();
    obj.forEach(value => setClone.add(deepClone(value)));
    return setClone;
  }

  if (Array.isArray(obj)) return obj.map(item => deepClone(item));

  const clonedObj = Object.create(Object.getPrototypeOf(obj));

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) clonedObj[key] = deepClone(obj[key]);
  }

  return clonedObj;
}

function deepMerge(target, ...sources) {
  if (!isObject(target)) return target;

  for (const source of sources) {
    if (isObject(source)) {
      for (const key in source) {
        const sourceValue = source[key];
        const targetValue = target[key];

        if (isObject(sourceValue)) {
          target[key] = deepMerge(targetValue || {}, sourceValue);
        } else target[key] = sourceValue;
      }
    }
  }
  return target;
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

class Client {

  // 封装
  async fetch(url, options = {}) {
    if (!this.csrf) await this.auth();
    return fetch(this.domain + url, deepMerge(options, {
      headers: {
        cookie: this.cookie2text(),
        'X-CSRF-Token': this.csrf,
      }
    }));
  }
  constructor(options = {}) {
    if (typeof options !== 'object') throw new Error('需要一个 Object 来配置客户端');

    // 初始化
    this.domain = new URL(options.url).origin;
    if (!/^http(|s)\:\/\//.test(this.domain)) throw new Error('无效 url');
    this.options = options;

    // 开启 session
    this.cookie = {};
    this.csrf = null;

    // 登录
    if (options.auth) {
      switch (options.auth.type) {
        case 'cookie':
          this.setCookie('' + options.auth.cookie);
          break;
        default: 
          throw new Error('未知 Auth 方式');
      }
    }
  }

  async getPayload(dataOrPath) {
    if (this.hasPayload(dataOrPath)) {
      return JSON.parse(this.hasPayload(dataOrPath));
    }
    let req = await this.fetch(dataOrPath);
    let data = await req.text();

    let payload = this.hasPayload(data);
    if (!payload) return false;
    return JSON.parse(payload);
  }
  
  hasPayload(data) {
    let match = data.match(/<script id="flarum-json-payload" type="application\/json">(.+?)<\/script>/);
    return match ? match[1]: undefined;
  }

  // cookie 设置
  cookie2text() {
    return Object.keys(this.cookie).map((key) => 
      `${encodeURIComponent(key)}=${encodeURIComponent(this.cookie[key])}`
    ).join(";")
  }
  setCookie(cookies_raw) {
    let regCookie = (cookie_raw) => {
      let cookie = cookie_raw.split(";")[0].split("=");
      this.cookie[cookie[0]] = cookie[1];
    }
    if (Array.isArray(cookies_raw)) return cookies_raw.forEach(regCookie);
    regCookie(cookies_raw);
  }

  // Auth 处理
  async auth() {
    let req = await fetch(this.domain, {
      headers: {
        cookie: this.cookie2text()
      }
    });

    if (!req.headers.raw()['set-cookie']) return false;

    this.setCookie(req.headers.raw()['set-cookie']);
    this.csrf = req.headers.raw()['x-csrf-token'][0];

    return true;
  }
}


module.exports = Client;