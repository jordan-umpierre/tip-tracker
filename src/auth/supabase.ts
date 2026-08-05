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

export function createSupabaseAuthClient(
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
export const supabaseClient = authSetup.config
  ? createSupabaseAuthClient(authSetup.config)
  : null;
