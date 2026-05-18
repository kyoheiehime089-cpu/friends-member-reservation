import { getSupabaseClient } from '@/lib/supabaseClient';

type JsonBody = { ok?: boolean; message?: string } & Record<string, unknown>;

export type AdminClientError = Error & { needsLogin?: boolean; status?: number };

function makeError(message: string, status?: number, needsLogin = false) {
  const error = new Error(message) as AdminClientError;
  error.status = status;
  error.needsLogin = needsLogin;
  return error;
}

async function sleep(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isLoginError(error: unknown) {
  return Boolean((error as AdminClientError | undefined)?.needsLogin);
}

export async function getAdminAccessToken() {
  const client = getSupabaseClient();
  if (!client) throw makeError('Supabase環境変数を設定してください。', 500, false);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data } = await client.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
    const refreshed = await client.auth.refreshSession();
    if (refreshed.data.session?.access_token) return refreshed.data.session.access_token;
    await sleep(250);
  }

  throw makeError('ログイン情報を確認できません。もう一度ログインしてください。', 401, true);
}

export async function adminFetch(path: string, init?: RequestInit) {
  const token = await getAdminAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store'
  });

  if (response.status !== 401) return response;

  const client = getSupabaseClient();
  const refreshed = await client?.auth.refreshSession();
  const retryToken = refreshed?.data.session?.access_token;
  if (!retryToken) return response;

  return fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${retryToken}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store'
  });
}

export async function adminJson<T extends JsonBody = JsonBody>(path: string, init?: RequestInit): Promise<T> {
  const response = await adminFetch(path, init);
  const body = await response.json().catch(() => ({})) as T;
  if (!response.ok || body.ok === false) {
    const message = typeof body.message === 'string' ? body.message : '処理に失敗しました。';
    throw makeError(message, response.status, response.status === 401 || message.includes('ログイン情報'));
  }
  return body;
}

export async function signOutAndGoLogin() {
  const client = getSupabaseClient();
  await client?.auth.signOut();
  window.location.href = '/login';
}
