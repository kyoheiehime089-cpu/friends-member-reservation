import { createClient } from '@supabase/supabase-js';

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const allowedMemberStatuses = ['有効', '休会中', '退会予定', '退会済み', '停止中', '未払い'];

export function getAdminConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !anonKey || !serviceKey) return null;
  return { supabaseUrl, anonKey, serviceKey };
}

export function createUserClient(supabaseUrl: string, anonKey: string, token: string) {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function createServiceClient(supabaseUrl: string, serviceKey: string) {
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function requireAdmin(request: Request) {
  const config = getAdminConfig();
  if (!config) {
    return { ok: false as const, status: 500, message: 'Supabase環境変数が未設定です。', config: null, adminId: null };
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) {
    return { ok: false as const, status: 401, message: 'ログイン情報が確認できません。', config, adminId: null };
  }

  const userClient = createUserClient(config.supabaseUrl, config.anonKey, token);
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, message: 'ログイン情報を確認できません。', config, adminId: null };
  }

  const serviceClient = createServiceClient(config.supabaseUrl, config.serviceKey);
  const { data: adminRow, error: adminError } = await serviceClient
    .from('admin_users')
    .select('id')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (adminError) {
    return { ok: false as const, status: 500, message: `管理者権限の確認に失敗しました: ${adminError.message}`, config, adminId: null };
  }

  if (!adminRow) {
    return { ok: false as const, status: 403, message: '管理者権限がありません。', config, adminId: null };
  }

  return { ok: true as const, status: 200, message: 'OK', config, adminId: userData.user.id };
}
