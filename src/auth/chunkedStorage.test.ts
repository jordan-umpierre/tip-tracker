import assert from 'node:assert/strict';
import { createChunkedStorage } from './chunkedStorage.ts';

class MemoryStore {
  readonly values = new Map<string, string>();
  failNextWriteFor: string | null = null;

  async deleteItemAsync(key: string): Promise<void> {
    this.values.delete(key);
  }

  async getItemAsync(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    if (key === this.failNextWriteFor) {
      this.failNextWriteFor = null;
      throw new Error('injected write failure');
    }
    this.values.set(key, value);
  }
}

const store = new MemoryStore();
const storage = createChunkedStorage(store, { chunkBytes: 8, maxBytes: 64 });
const original = 'session-🍞-data';

await storage.setItem('auth-token', original);
assert.equal(await storage.getItem('auth-token'), original);
assert.ok(store.values.size > 2, 'the value should span multiple chunks');

await storage.setItem('auth-token', 'replacement');
assert.equal(await storage.getItem('auth-token'), 'replacement');
assert.equal(
  [...store.values.keys()].some((key) => key.startsWith('auth-token.0.')),
  false,
  'overwriting should clean up the inactive slot'
);

store.failNextWriteFor = 'auth-token.0.1';
await assert.rejects(
  storage.setItem('auth-token', 'a value long enough for three chunks'),
  /injected/
);
assert.equal(await storage.getItem('auth-token'), 'replacement');
assert.equal(
  [...store.values.keys()].some((key) => key.startsWith('auth-token.0.')),
  false,
  'a partial write should be removed without replacing the old manifest'
);

await storage.removeItem('auth-token');
assert.equal(await storage.getItem('auth-token'), null);
assert.equal(store.values.size, 0);

await assert.rejects(storage.setItem('auth-token', 'x'.repeat(65)), /too large/);

console.log('chunked auth storage OK');
