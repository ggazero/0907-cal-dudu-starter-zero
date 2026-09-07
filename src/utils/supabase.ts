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

  // 먼저 session 확인
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user) {
    const role = sessionData.session.user.app_metadata?.role;
    return role === 'admin';
  }

  // session이 없으면 user 확인
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return false;

  const role = userData.user.app_metadata?.role;
  return role === 'admin';
}

export async function getCurrentUserId(): Promise<string | null> {
  const client = getSupabase();

  // 먼저 session 확인
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user?.id) {
    return sessionData.session.user.id;
  }

  // session이 없으면 user 확인
  const { data: userData } = await client.auth.getUser();
  return userData.user?.id || null;
}

export async function signUp(email: string, password: string): Promise<{ error?: string; userId?: string }> {
  const client = getSupabase();
  const { data, error } = await client.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  // 회원가입 성공 후 session 확인
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user?.id) {
    return { userId: sessionData.session.user.id };
  }

  // session이 없으면 사용자 ID 직접 반환 (이메일 확인 필요한 경우)
  return { userId: data.user?.id };
}

export async function signIn(email: string, password: string): Promise<{ error?: string; userId?: string }> {
  const client = getSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  // 로그인 성공 후 session 확인
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user?.id) {
    return { userId: sessionData.session.user.id };
  }

  return { userId: data.user?.id };
}

export async function signOut(): Promise<{ error?: string }> {
  const client = getSupabase();
  const { error } = await client.auth.signOut();
  return { error: error?.message };
}

export async function getCurrentUser() {
  const client = getSupabase();

  // 먼저 session 확인
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user) {
    return sessionData.session.user;
  }

  // session이 없으면 user 확인
  const { data: userData } = await client.auth.getUser();
  return userData.user;
}
