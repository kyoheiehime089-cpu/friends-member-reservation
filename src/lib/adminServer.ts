import { createClient } from '@supabase/supabase-js';

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const allowedMemberStatuses = ['有効', '休止予定', '休止中', '停止中'];

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
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function isConfiguredOwnerEmail(email: string) {
  const configuredAdminEmail = normalizeEmail(process.env.ADMIN_EMAIL || process.env.ADMIN_NOTIFICATION_EMAIL);
  return Boolean(email && configuredAdminEmail && email === configuredAdminEmail);
}

export async function requireAdmin(request: Request) {
  const config = getAdminConfig();
  if (!config) return { ok: false as const, status: 500, message: 'Supabase環境変数が未設定です。', config: null, adminId: null, adminEmail: null };

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return { ok: false as const, status: 401, message: 'ログイン情報が確認できません。', config, adminId: null, adminEmail: null };

  const userClient = createUserClient(config.supabaseUrl, config.anonKey, token);
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return { ok: false as const, status: 401, message: 'ログイン情報を確認できません。', config, adminId: null, adminEmail: null };

  const userId = userData.user.id;
  const userEmail = normalizeEmail(userData.user.email);
  const serviceClient = createServiceClient(config.supabaseUrl, config.serviceKey);

  if (isConfiguredOwnerEmail(userEmail)) {
    return { ok: true as const, status: 200, message: 'OK', config, adminId: userId, adminEmail: userEmail };
  }

  const { data: adminById, error: idError } = await serviceClient.from('admin_users').select('id').eq('id', userId).maybeSingle();
  if (idError) return { ok: false as const, status: 500, message: `管理者権限の確認に失敗しました: ${idError.message}`, config, adminId: null, adminEmail: null };
  if (adminById) return { ok: true as const, status: 200, message: 'OK', config, adminId: userId, adminEmail: userEmail };

  if (userEmail) {
    const { data: adminByEmail, error: emailError } = await serviceClient.from('admin_users').select('id').eq('email', userEmail).maybeSingle();
    if (emailError) return { ok: false as const, status: 500, message: `管理者権限の確認に失敗しました: ${emailError.message}`, config, adminId: null, adminEmail: null };
    if (adminByEmail) return { ok: true as const, status: 200, message: 'OK', config, adminId: userId, adminEmail: userEmail };
  }

  const { data: memberById } = await serviceClient.from('members').select('id').eq('id', userId).maybeSingle();
  if (memberById) {
    return { ok: false as const, status: 403, message: '会員アカウントでは管理者画面に入れません。管理者専用アカウントでサインインしてください。', config, adminId: null, adminEmail: null };
  }

  if (userEmail) {
    const { data: memberByEmail } = await serviceClient.from('members').select('id').eq('email', userEmail).maybeSingle();
    if (memberByEmail) {
      return { ok: false as const, status: 403, message: '会員アカウントでは管理者画面に入れません。管理者専用アカウントでサインインしてください。', config, adminId: null, adminEmail: null };
    }
  }

  return { ok: false as const, status: 403, message: '管理者権限がありません。会員アカウントでは管理者画面に入れません。', config, adminId: null, adminEmail: null };
}
