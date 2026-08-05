import 'react-native-url-polyfill/auto';
import {
  createClient,
  processLock,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { authSetup, type AuthConfig } from './config';
import { sessionStorage } from './sessionStorage';

type SessionStorage = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
};

function createSupabaseAuthClient(
  config: AuthConfig,
  storage: SessionStorage = sessionStorage
): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      lock: processLock,
      persistSession: true,
      storage,
    },
  });
}

// A missing or invalid cloud configuration must not prevent the local app from
// starting. Account UI checks this nullable singleton before offering sign-in.
export const supabaseClient = createConfiguredClient();

function createConfiguredClient(): SupabaseClient | null {
  if (!authSetup.config) return null;
  try {
    return createSupabaseAuthClient(authSetup.config);
  } catch {
    // A provider setup failure must not prevent the SQLite-only app from
    // opening. The account panel reports the feature as unavailable instead.
    return null;
  }
}
