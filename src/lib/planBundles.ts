import type { SupabaseClient } from '@supabase/supabase-js';

export type PlanLike = {
  id: string;
  name: string;
  weekly_limit?: number | null;
  unlimited?: boolean | null;
  is_active?: boolean | null;
};

const separator = '＋';

function planOrder(name: string) {
  if (name.includes('セミ')) return 0;
  if (name.includes('ヨガ')) return 1;
  if (name.includes('イベント')) return 2;
  if (name.includes('その他')) return 9;
  return 5;
}

export function isBundlePlanName(name?: string | null) {
  return Boolean(name && /[＋+]/.test(name));
}

export function splitBundlePlanName(name?: string | null) {
  return (name ?? '').split(/[＋+]/).map((part) => part.trim()).filter(Boolean);
}

export function selectableBasePlans(plans: PlanLike[]) {
  return plans
    .filter((plan) => plan.is_active !== false)
    .filter((plan) => !isBundlePlanName(plan.name))
    .sort((a, b) => planOrder(a.name) - planOrder(b.name) || a.name.localeCompare(b.name, 'ja'));
}

export function selectedPlanIdsFromMemberPlan(plans: PlanLike[], planId?: string | null) {
  if (!planId) return [];
  const current = plans.find((plan) => plan.id === planId);
  if (!current) return [planId];
  if (!isBundlePlanName(current.name)) return [current.id];

  const parts = splitBundlePlanName(current.name);
  return parts
    .map((part) => plans.find((plan) => plan.name === part)?.id)
    .filter((id): id is string => Boolean(id));
}

export function buildBundlePlanName(plans: PlanLike[], planIds: string[]) {
  return plans
    .filter((plan) => planIds.includes(plan.id))
    .sort((a, b) => planOrder(a.name) - planOrder(b.name) || a.name.localeCompare(b.name, 'ja'))
    .map((plan) => plan.name)
    .join(separator);
}

export async function ensurePlanForSelection(client: SupabaseClient, planIds: string[]) {
  const cleanIds = Array.from(new Set(planIds.filter(Boolean)));
  if (cleanIds.length === 0) return null;
  if (cleanIds.length === 1) return cleanIds[0];

  const { data: selectedPlans, error: readError } = await client
    .from('plans')
    .select('id,name,weekly_limit,unlimited,is_active')
    .in('id', cleanIds);

  if (readError) throw new Error(`プラン確認に失敗しました: ${readError.message}`);
  const plans = (selectedPlans ?? []) as PlanLike[];
  if (plans.length !== cleanIds.length) throw new Error('選択されたプランの一部が見つかりません。');

  const name = buildBundlePlanName(plans, cleanIds);
  const { data: existing, error: existingError } = await client.from('plans').select('id').eq('name', name).maybeSingle();
  if (existingError) throw new Error(`組み合わせプランの確認に失敗しました: ${existingError.message}`);
  if (existing?.id) return existing.id as string;

  const { data: created, error: createError } = await client
    .from('plans')
    .insert({ name, weekly_limit: null, unlimited: false, is_active: true })
    .select('id')
    .single();

  if (createError) throw new Error(`組み合わせプランの作成に失敗しました: ${createError.message}`);
  return created.id as string;
}
