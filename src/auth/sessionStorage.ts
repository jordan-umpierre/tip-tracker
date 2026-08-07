import * as SecureStore from 'expo-secure-store';
import { createChunkedStorage } from './chunkedStorage';

// SecureStore encrypts each native chunk. The adapter keeps individual values
// small because iOS Keychain can reject large strings on some OS versions.
export const sessionStorage = createChunkedStorage({
  deleteItemAsync: SecureStore.deleteItemAsync,
  getItemAsync: SecureStore.getItemAsync,
  setItemAsync: SecureStore.setItemAsync,
});
