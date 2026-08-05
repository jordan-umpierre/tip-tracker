type AsyncKeyValueStore = {
  deleteItemAsync(key: string): Promise<void>;
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
};

type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
};

type Manifest = {
  chunks: number;
  slot: 0 | 1;
  version: 1;
};

const DEFAULT_CHUNK_BYTES = 1_500;
const DEFAULT_MAX_BYTES = 72_000;

export function createChunkedStorage(
  store: AsyncKeyValueStore,
  options: { chunkBytes?: number; maxBytes?: number } = {}
): StorageAdapter {
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxChunks = Math.ceil(maxBytes / chunkBytes);

  if (chunkBytes < 1 || maxBytes < chunkBytes) {
    throw new Error('Session storage bounds are invalid.');
  }

  return {
    async getItem(key) {
      const manifestValue = await store.getItemAsync(key);
      if (manifestValue === null) return null;

      const manifest = readManifest(manifestValue, maxChunks);
      const chunks = await Promise.all(
        Array.from({ length: manifest.chunks }, (_, index) =>
          store.getItemAsync(chunkKey(key, manifest.slot, index))
        )
      );

      if (chunks.some((chunk) => chunk === null)) {
        throw new Error('The saved account session is incomplete.');
      }

      return chunks.join('');
    },

    async removeItem(key) {
      const manifestValue = await store.getItemAsync(key);
      await store.deleteItemAsync(key);
      if (manifestValue === null) return;

      const manifest = readManifest(manifestValue, maxChunks);
      await Promise.all(
        Array.from({ length: manifest.chunks }, (_, index) =>
          store.deleteItemAsync(chunkKey(key, manifest.slot, index))
        )
      );
    },

    async setItem(key, value) {
      const chunks = splitByUtf8Bytes(value, chunkBytes, maxBytes);
      const oldManifestValue = await store.getItemAsync(key);
      const oldManifest =
        oldManifestValue === null
          ? null
          : readManifest(oldManifestValue, maxChunks);
      const nextSlot: 0 | 1 = oldManifest?.slot === 0 ? 1 : 0;
      let writtenChunks = 0;

      try {
        for (const [index, chunk] of chunks.entries()) {
          await store.setItemAsync(chunkKey(key, nextSlot, index), chunk);
          writtenChunks += 1;
        }
        await store.setItemAsync(
          key,
          JSON.stringify({ version: 1, slot: nextSlot, chunks: chunks.length })
        );
      } catch (error) {
        await Promise.allSettled(
          Array.from({ length: writtenChunks }, (_, index) =>
            store.deleteItemAsync(chunkKey(key, nextSlot, index))
          )
        );
        throw error;
      }

      if (oldManifest !== null) {
        await Promise.allSettled(
          Array.from({ length: oldManifest.chunks }, (_, index) =>
            store.deleteItemAsync(chunkKey(key, oldManifest.slot, index))
          )
        );
      }
    },
  };
}

function chunkKey(key: string, slot: 0 | 1, index: number): string {
  return `${key}.${slot}.${index}`;
}

function readManifest(value: string, maxChunks: number): Manifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('The saved account session metadata is invalid.');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    parsed.version !== 1 ||
    !('slot' in parsed) ||
    (parsed.slot !== 0 && parsed.slot !== 1) ||
    !('chunks' in parsed) ||
    !Number.isInteger(parsed.chunks) ||
    (parsed.chunks as number) < 1 ||
    (parsed.chunks as number) > maxChunks
  ) {
    throw new Error('The saved account session metadata is invalid.');
  }

  return parsed as Manifest;
}

function splitByUtf8Bytes(
  value: string,
  chunkBytes: number,
  maxBytes: number
): string[] {
  const chunks: string[] = [];
  let chunk = '';
  let chunkSize = 0;
  let totalSize = 0;

  for (const character of value) {
    const characterSize = utf8ByteLength(character.codePointAt(0)!);
    totalSize += characterSize;
    if (totalSize > maxBytes) {
      throw new Error('The account session is too large to store safely.');
    }
    if (chunkSize + characterSize > chunkBytes && chunk !== '') {
      chunks.push(chunk);
      chunk = '';
      chunkSize = 0;
    }
    chunk += character;
    chunkSize += characterSize;
  }

  chunks.push(chunk);
  return chunks;
}

function utf8ByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}
