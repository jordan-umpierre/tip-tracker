const getWebStorage = (): Storage => {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new Error('Browser session storage is unavailable.');
  }
  return globalThis.localStorage;
};

// Browsers already provide storage for larger strings, so web does not need
// the native chunk manifest used for Keychain-backed SecureStore.
export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    return getWebStorage().getItem(key);
  },
  async removeItem(key: string): Promise<void> {
    getWebStorage().removeItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    getWebStorage().setItem(key, value);
  },
};
