import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function initSupabase(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const url = (import.meta as any).env.VITE_SUPABASE_URL;
  const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase credentials not found in environment');
  }

  supabaseClient = createClient(url, anonKey);
  return supabaseClient;
}

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error('Supabase not initialized');
  }
  return supabaseClient;
}

export async function isAdmin(): Promise<boolean> {
  const client = getSupabase();
  const { data } = await client.auth.getUser();
  if (!data.user) return false;

  const role = data.user.app_metadata?.role;
  return role === 'admin';
}

export async function getCurrentUserId(): Promise<string | null> {
  const client = getSupabase();
  const { data } = await client.auth.getUser();
  return data.user?.id || null;
}
