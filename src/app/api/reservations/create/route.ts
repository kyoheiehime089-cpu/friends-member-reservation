import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sendMail } from '@/lib/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const gridTimeZone = 'Asia/Tokyo';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  timeZone: gridTimeZone
});
const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: gridTimeZone
});
const jstDatePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: gridTimeZone
});

type CreateRequestBody = {
  slotId?: string;
};

type SlotRow = {
  id: string;
  store_id: string | null;
  menu_id: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number;
  is_open: boolean | null;
};

type MenuRow = {
  id: string;
  name: string;
};

type ReservationRow = {
  id: string;
  reservation_slot_id: string | null;
  member_id: string | null;
  status: string | null;
};

type BookedReservationRow = {
  id: string;
  reservation_slot_id: string | null;
};

type BookedSlotRow = {
  id: string;
  starts_at: string | null;
};

type MemberRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  plan_id: string | null;
};

type PlanRow = {
  id: string;
  name: string;
  weekly_limit: number | null;
  unlimited: boolean | null;
  is_active: boolean | null;
};

type MailLogRow = {
  reservation_id: string;
  to_email: string;
  subject: string;
  status: string;
  provider_response: unknown;
};

type JstDateParts = {
  year: number;
  month: number;
  day: number;
};

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  };
}

function createUserClient(supabaseUrl: string, supabaseAnonKey: string, accessToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function createDbClient(supabaseUrl: string, supabaseAnonKey: string, serviceKey: string, accessToken: string) {
  if (serviceKey) {
    return createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return createUserClient(supabaseUrl, supabaseAnonKey, accessToken);
}

function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function getJstDateParts(value: Date | string): JstDateParts {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = jstDatePartsFormatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '0');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '0');
  return { year, month, day };
}

function getJstDateKey(value: Date | string) {
  const parts = getJstDateParts(value);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function getJstDayRange(value: Date | string) {
  const { year, month, day } = getJstDateParts(value);
  const start = new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, -9, 0, 0, 0));
  return { start, end };
}

function getPreviousDay22JstDeadline(value: Date | string) {
  const { year, month, day } = getJstDateParts(value);
  return new Date(Date.UTC(year, month - 1, day - 1, 13, 0, 0, 0));
}

function hasPassedPreviousDay22Deadline(value: Date | string) {
  return new Date() >= getPreviousDay22JstDeadline(value);
}

function getJstWeekRange(value: Date | string) {
  const { year, month, day } = getJstDateParts(value);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysFromMonday = (weekday + 6) % 7;
  const start = new Date(Date.UTC(year, month - 1, day - daysFromMonday, -9, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day - daysFromMonday + 7, -9, 0, 0, 0));
  return { start, end };
}

function friendlyMessage(message: string) {
  if (message.includes('duplicate key') || message.includes('unique') || message.includes('already exists')) {
    return 'この枠はすでに予約済みです。予約一覧をご確認ください。';
  }
  if (message.includes('同じ日に予約できるのは1枠まで')) {
    return '同じ日に予約できるのは1枠までです。予約一覧をご確認ください。';
  }
  if (message.includes('定員') || message.includes('capacity')) {
    return 'この枠は満席になりました。別の枠をお選びください。';
  }
  if (message.includes('row-level security')) {
    return '予約を保存できませんでした。SupabaseのRLSまたは会員データ設定を確認してください。';
  }
  if (message.includes('foreign key')) {
    return '予約を保存できませんでした。会員情報または予約枠情報の紐づけを確認してください。';
  }
  return `予約処理でエラーが発生しました: ${message}`;
}

function getUserName(user: { email?: string; user_metadata?: Record<string, unknown> }) {
  const metadata = user.user_metadata ?? {};
  const fullName = metadata.full_name ?? metadata.name;
  if (typeof fullName === 'string' && fullName.trim()) {
    return fullName.trim();
  }
  return user.email ?? '会員';
}

function buildReservationMail(params: {
  memberName: string;
  menuName: string;
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  const startsAt = params.startsAt ? new Date(params.startsAt) : null;
  const endsAt = params.endsAt ? new Date(params.endsAt) : null;
  const dateLabel = startsAt ? dateFormatter.format(startsAt) : '日時未設定';
  const startTimeLabel = startsAt ? timeFormatter.format(startsAt) : '';
  const endTimeLabel = endsAt ? timeFormatter.format(endsAt) : '';

  return `${params.memberName} 様\n\nご予約ありがとうございます。\n以下の内容で予約を受け付けました。\n\n【店舗】\nfriends 行徳\n\n【メニュー】\n${params.menuName}\n\n【予約日時】\n${dateLabel} ${startTimeLabel}〜${endTimeLabel}\n\n【予約・キャンセル締切】\n前日22:00まで\n\nキャンセルや変更が必要な場合は、予約一覧からご確認ください。\n\n当日お会いできるのを楽しみにしております。`;
}

async function ensureMember(dbClient: SupabaseClient, params: {
  userId: string;
  email: string;
  fullName: string;
  storeId: string | null;
}) {
  const { data: existingMember } = await dbClient
    .from('members')
    .select('id,full_name,email,plan_id')
    .eq('id', params.userId)
    .maybeSingle();

  if (existingMember) {
    return { ok: true, member: existingMember as MemberRow, errorMessage: null };
  }

  const { data, error } = await dbClient
    .from('members')
    .insert({
      id: params.userId,
      store_id: params.storeId,
      full_name: params.fullName,
      email: params.email,
      status: '有効'
    })
    .select('id,full_name,email,plan_id')
    .single();

  if (error) {
    return { ok: false, member: null, errorMessage: error.message };
  }

  return { ok: true, member: data as MemberRow, errorMessage: null };
}

async function writeMailLogs(dbClient: SupabaseClient, rows: MailLogRow[]) {
  if (rows.length === 0) {
    return { status: 'skipped', error: null };
  }

  const { error } = await dbClient.from('mail_logs').insert(rows);
  if (error) {
    return { status: 'failed', error: error.message };
  }
  return { status: 'recorded', error: null };
}

async function loadMemberPlan(dbClient: SupabaseClient, planId?: string | null) {
  if (!planId) return { plan: null as PlanRow | null, errorMessage: null as string | null };
  const { data, error } = await dbClient
    .from('plans')
    .select('id,name,weekly_limit,unlimited,is_active')
    .eq('id', planId)
    .maybeSingle();

  return { plan: (data as PlanRow | null) ?? null, errorMessage: error?.message ?? null };
}

async function loadBookedSlotsForMember(dbClient: SupabaseClient, userId: string) {
  const { data: reservationRows, error: reservationError } = await dbClient
    .from('reservations')
    .select('id,reservation_slot_id')
    .eq('member_id', userId)
    .eq('status', 'booked');

  if (reservationError) {
    return { ok: false, reservations: [] as BookedReservationRow[], slotsById: new Map<string, BookedSlotRow>(), errorMessage: reservationError.message };
  }

  const reservations = (reservationRows ?? []) as BookedReservationRow[];
  const slotIds = Array.from(new Set(
    reservations
      .map((reservation) => reservation.reservation_slot_id)
      .filter(isUuid)
  ));

  if (slotIds.length === 0) {
    return { ok: true, reservations, slotsById: new Map<string, BookedSlotRow>(), errorMessage: null };
  }

  const { data: slotRows, error: slotError } = await dbClient
    .from('reservation_slots')
    .select('id,starts_at')
    .in('id', slotIds);

  if (slotError) {
    return { ok: false, reservations, slotsById: new Map<string, BookedSlotRow>(), errorMessage: slotError.message };
  }

  return {
    ok: true,
    reservations,
    slotsById: new Map(((slotRows ?? []) as BookedSlotRow[]).map((slot) => [slot.id, slot])),
    errorMessage: null
  };
}

async function hasBookedSameDay(dbClient: SupabaseClient, params: { userId: string; startsAt: Date; currentSlotId: string }) {
  const { start, end } = getJstDayRange(params.startsAt);
  const { data: sameDaySlotRows, error: sameDaySlotError } = await dbClient
    .from('reservation_slots')
    .select('id')
    .gte('starts_at', start.toISOString())
    .lt('starts_at', end.toISOString());

  if (sameDaySlotError) {
    return { ok: false, hasBooking: false, errorMessage: sameDaySlotError.message };
  }

  const sameDaySlotIds = (sameDaySlotRows ?? [])
    .map((row) => row.id as string)
    .filter((id) => id !== params.currentSlotId);

  if (sameDaySlotIds.length === 0) {
    return { ok: true, hasBooking: false, errorMessage: null };
  }

  const { data: sameDayReservationRows, error: sameDayReservationError } = await dbClient
    .from('reservations')
    .select('id')
    .eq('member_id', params.userId)
    .eq('status', 'booked')
    .in('reservation_slot_id', sameDaySlotIds)
    .limit(1);

  if (sameDayReservationError) {
    return { ok: false, hasBooking: false, errorMessage: sameDayReservationError.message };
  }

  return { ok: true, hasBooking: (sameDayReservationRows ?? []).length > 0, errorMessage: null };
}

function countBookedInSameWeek(bookedSlots: BookedSlotRow[], startsAt: Date) {
  const { start, end } = getJstWeekRange(startsAt);
  return bookedSlots.filter((slot) => {
    if (!slot.starts_at) return false;
    const slotStartsAt = new Date(slot.starts_at);
    return slotStartsAt >= start && slotStartsAt < end;
  }).length;
}

export async function POST(request: Request) {
  const config = getSupabaseConfig();
  if (!config) {
    return NextResponse.json({ ok: false, message: 'Supabase環境変数が未設定です。' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '') ?? '';
  if (!accessToken) {
    return NextResponse.json({ ok: false, message: 'ログイン情報が確認できません。' }, { status: 401 });
  }

  const requestBody = await request.json().catch(() => ({})) as CreateRequestBody;
  const slotId = requestBody.slotId?.trim();
  if (!slotId) {
    return NextResponse.json({ ok: false, message: 'slotId がありません。' }, { status: 400 });
  }

  const userClient = createUserClient(config.supabaseUrl, config.supabaseAnonKey, accessToken);
  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, message: 'ログイン情報を確認できません。' }, { status: 401 });
  }

  const dbClient = createDbClient(config.supabaseUrl, config.supabaseAnonKey, config.serviceKey, accessToken);

  const { data: slotData, error: slotError } = await dbClient
    .from('reservation_slots')
    .select('id,store_id,menu_id,starts_at,ends_at,capacity,is_open')
    .eq('id', slotId)
    .single();

  if (slotError || !slotData) {
    return NextResponse.json({ ok: false, message: '予約枠が見つかりません。' }, { status: 404 });
  }

  const slot = slotData as SlotRow;
  const startsAt = new Date(slot.starts_at);
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
    return NextResponse.json({ ok: false, message: '開始済み、または過去の予約枠は予約できません。' }, { status: 400 });
  }

  if (hasPassedPreviousDay22Deadline(startsAt)) {
    return NextResponse.json({ ok: false, message: 'この枠の予約受付は終了しました。予約は前日22:00までです。' }, { status: 400 });
  }

  if (slot.is_open === false) {
    return NextResponse.json({ ok: false, message: 'この予約枠は受付停止中です。' }, { status: 400 });
  }

  const { data: ownBookedRows, error: ownBookedError } = await dbClient
    .from('reservations')
    .select('id')
    .eq('reservation_slot_id', slot.id)
    .eq('member_id', userData.user.id)
    .eq('status', 'booked')
    .limit(1);

  if (ownBookedError) {
    return NextResponse.json({ ok: false, message: friendlyMessage(ownBookedError.message) }, { status: 400 });
  }

  if ((ownBookedRows ?? []).length > 0) {
    return NextResponse.json({ ok: false, message: 'この枠はすでに予約済みです。予約一覧をご確認ください。' }, { status: 409 });
  }

  const sameDayResult = await hasBookedSameDay(dbClient, {
    userId: userData.user.id,
    startsAt,
    currentSlotId: slot.id
  });

  if (!sameDayResult.ok) {
    return NextResponse.json({ ok: false, message: friendlyMessage(sameDayResult.errorMessage ?? '同日予約の確認に失敗しました。') }, { status: 400 });
  }

  if (sameDayResult.hasBooking) {
    return NextResponse.json({ ok: false, message: '同じ日に予約できるのは1枠までです。予約一覧をご確認ください。' }, { status: 409 });
  }

  const { data: bookedRows, error: bookedError } = await dbClient
    .from('reservations')
    .select('id')
    .eq('reservation_slot_id', slot.id)
    .eq('status', 'booked');

  if (bookedError) {
    return NextResponse.json({ ok: false, message: friendlyMessage(bookedError.message) }, { status: 400 });
  }

  const bookedCount = bookedRows?.length ?? 0;
  if (bookedCount >= slot.capacity) {
    return NextResponse.json({ ok: false, message: 'この枠は満席になりました。別の枠をお選びください。' }, { status: 409 });
  }

  const memberEmail = userData.user.email ?? `${userData.user.id}@no-email.local`;
  const memberName = getUserName(userData.user);
  const memberResult = await ensureMember(dbClient, {
    userId: userData.user.id,
    email: memberEmail,
    fullName: memberName,
    storeId: slot.store_id
  });

  if (!memberResult.ok || !memberResult.member) {
    return NextResponse.json({
      ok: false,
      message: friendlyMessage(memberResult.errorMessage ?? '会員情報の作成に失敗しました。'),
      detail: 'members に会員行を作成できませんでした。SUPABASE_SERVICE_ROLE_KEY または members のRLS設定を確認してください。'
    }, { status: 400 });
  }

  const bookedSlotsResult = await loadBookedSlotsForMember(dbClient, userData.user.id);
  if (!bookedSlotsResult.ok) {
    return NextResponse.json({ ok: false, message: friendlyMessage(bookedSlotsResult.errorMessage ?? '予約履歴の確認に失敗しました。') }, { status: 400 });
  }

  const bookedSlots = bookedSlotsResult.reservations
    .map((reservation) => reservation.reservation_slot_id ? bookedSlotsResult.slotsById.get(reservation.reservation_slot_id) : null)
    .filter((slotRow): slotRow is BookedSlotRow => Boolean(slotRow?.starts_at));

  const { plan, errorMessage: planErrorMessage } = await loadMemberPlan(dbClient, memberResult.member.plan_id);
  if (planErrorMessage) {
    return NextResponse.json({ ok: false, message: `会員プランの確認に失敗しました: ${planErrorMessage}` }, { status: 400 });
  }

  if (plan?.is_active === false) {
    return NextResponse.json({ ok: false, message: '現在のプランは無効です。予約をご希望の場合はスタッフにご連絡ください。' }, { status: 403 });
  }

  if (plan && plan.unlimited !== true && typeof plan.weekly_limit === 'number') {
    const weeklyBookedCount = countBookedInSameWeek(bookedSlots, startsAt);
    if (weeklyBookedCount >= plan.weekly_limit) {
      return NextResponse.json({ ok: false, message: `${plan.name}では、この週の予約上限に達しています。` }, { status: 409 });
    }
  }

  // Insert reservations with the user-scoped client so DB triggers can still see auth.uid().
  // Reads/logging may use service_role, but the actual booking write should remain user-bound.
  const { data: reservationData, error: reservationError } = await userClient
    .from('reservations')
    .insert({
      reservation_slot_id: slot.id,
      member_id: userData.user.id,
      status: 'booked',
      created_by: userData.user.id
    })
    .select('id,reservation_slot_id,member_id,status')
    .single();

  if (reservationError || !reservationData) {
    return NextResponse.json({ ok: false, message: friendlyMessage(reservationError?.message ?? '予約保存に失敗しました。') }, { status: 400 });
  }

  const reservation = reservationData as ReservationRow;
  let menuName = '予約枠';
  if (slot.menu_id) {
    const { data: menuData } = await dbClient.from('menus').select('id,name').eq('id', slot.menu_id).maybeSingle();
    menuName = ((menuData as MenuRow | null)?.name) ?? menuName;
  }

  const subject = 'friends ご予約完了のお知らせ';
  const mailBody = buildReservationMail({
    memberName,
    menuName,
    startsAt: slot.starts_at,
    endsAt: slot.ends_at
  });

  const mailLogs: MailLogRow[] = [];
  const memberMailResult = await sendMail({
    to: memberEmail,
    subject,
    body: mailBody,
    from: process.env.MAIL_FROM_FRIENDS
  });
  mailLogs.push({
    reservation_id: reservation.id,
    to_email: memberMailResult.payload.to,
    subject: memberMailResult.payload.subject,
    status: memberMailResult.ok ? 'sent' : memberMailResult.skipped ? 'skipped' : 'failed',
    provider_response: memberMailResult
  });

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
  let adminMailStatus = 'skipped';
  if (adminEmail) {
    const adminMailResult = await sendMail({
      to: adminEmail,
      subject: `【管理者通知】${subject}`,
      body: `${mailBody}\n\n会員ID: ${reservation.member_id}\n予約ID: ${reservation.id}`,
      from: process.env.MAIL_FROM_FRIENDS
    });
    adminMailStatus = adminMailResult.ok ? 'sent' : adminMailResult.skipped ? 'skipped' : 'failed';
    mailLogs.push({
      reservation_id: reservation.id,
      to_email: adminMailResult.payload.to,
      subject: adminMailResult.payload.subject,
      status: adminMailStatus,
      provider_response: adminMailResult
    });
  }

  const mailLogResult = await writeMailLogs(dbClient, mailLogs);

  return NextResponse.json({
    ok: true,
    reservationId: reservation.id,
    remainingSeats: Math.max(slot.capacity - bookedCount - 1, 0),
    memberMail: memberMailResult.ok ? 'sent' : memberMailResult.skipped ? 'skipped' : 'failed',
    adminMail: adminMailStatus,
    mailLogs: mailLogResult.status,
    mailLogError: mailLogResult.error
  });
}
