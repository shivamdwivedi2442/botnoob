const redis = require('redis');

class InMemoryStore {
  constructor() {
    this.store = new Map();
  }

  async set(key, value, options) {
    let ttl = 0;
    if (options && options.EX) {
      ttl = options.EX * 1000;
    }
    this.store.set(key, {
      value,
      expiry: ttl ? Date.now() + ttl : null
    });
    return 'OK';
  }

  async get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && item.expiry < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async del(key) {
    return this.store.delete(key);
  }

  async connect() {
    console.log('Using In-Memory Store (Redis Fallback)');
    return this;
  }

  on(event, callback) {
    // Mock event listener
  }
}

let redisClient;

if (process.env.REDIS_URL) {
  redisClient = redis.createClient({
    url: process.env.REDIS_URL
  });
  redisClient.on('error', (err) => console.log('Redis Client Error', err));
} else {
  redisClient = new InMemoryStore();
}

module.exports = redisClient;
