export type AuthConfig = {
  apiUrl: string;
  supabasePublishableKey: string;
  supabaseUrl: string;
};

type PublicAuthEnvironment = {
  EXPO_PUBLIC_API_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
};

export type AuthSetup =
  | { config: AuthConfig; error: null }
  | { config: null; error: string | null };

export function readAuthConfig(
  environment: PublicAuthEnvironment,
  development = false
): AuthConfig | null {
  const apiUrl = environment.EXPO_PUBLIC_API_URL?.trim() ?? '';
  const supabasePublishableKey =
    environment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  const supabaseUrl = environment.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';

  if (!apiUrl && !supabasePublishableKey && !supabaseUrl) return null;
  if (!apiUrl || !supabasePublishableKey || !supabaseUrl) {
    throw new Error('Cloud account configuration is incomplete.');
  }

  return {
    apiUrl: readBaseUrl(apiUrl, 'EXPO_PUBLIC_API_URL', development),
    supabasePublishableKey,
    supabaseUrl: readBaseUrl(
      supabaseUrl,
      'EXPO_PUBLIC_SUPABASE_URL',
      development
    ),
  };
}

export function loadAuthSetup(
  environment: PublicAuthEnvironment,
  development = false
): AuthSetup {
  try {
    return { config: readAuthConfig(environment, development), error: null };
  } catch {
    return { config: null, error: 'Cloud account configuration is invalid.' };
  }
}

function readBaseUrl(value: string, name: string, development: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  const allowedProtocol =
    url.protocol === 'https:' || (development && url.protocol === 'http:');
  if (
    !allowedProtocol ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error(`${name} must be a plain HTTPS origin.`);
  }

  return url.origin;
}

export const authSetup = loadAuthSetup(
  {
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  },
  process.env.NODE_ENV !== 'production'
);
