import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

let providersPromise = null;

export function getOAuthProviders() {
  if (!isSupabaseConfigured) return Promise.resolve(null);
  if (!providersPromise) {
    providersPromise = fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((settings) => settings?.external || null)
      .catch(() => null);
  }
  return providersPromise;
}

export async function startOAuth(provider, redirectTo) {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Social sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild the frontend.'
    );
  }

  const providers = await getOAuthProviders();
  if (providers && providers[provider] === false) {
    const label = provider === 'github' ? 'GitHub' : 'Google';
    throw new Error(
      `${label} sign-in is not enabled for this Supabase project. Enable it in Supabase → Authentication → Providers.`
    );
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });

  if (error) throw error;
  return data;
}
