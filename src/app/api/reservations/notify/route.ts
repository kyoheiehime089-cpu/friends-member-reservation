import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendMail } from '@/lib/mail';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
const gridTimeZone = 'Asia/Tokyo';

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

type NotifyRequestBody = {
  reservationId?: string;
};

type ReservationRow = {
  id: string;
  reservation_slot_id: string;
  member_id: string;
  status: string;
};

type SlotRow = {
  id: string;
  menu_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

type MenuRow = {
  id: string;
  name: string;
};

type MemberRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

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

  return `${params.memberName} 様\n\nご予約ありがとうございます。\n以下の内容で予約を受け付けました。\n\n【店舗】\nfriends 行徳\n\n【メニュー】\n${params.menuName}\n\n【予約日時】\n${dateLabel} ${startTimeLabel}〜${endTimeLabel}\n\nキャンセルや変更が必要な場合は、予約一覧からご確認ください。\n\n当日お会いできるのを楽しみにしております。`;
}

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, message: 'Supabase環境変数が未設定です。' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '') ?? '';
  if (!accessToken) {
    return NextResponse.json({ ok: false, message: 'ログイン情報が確認できません。' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as NotifyRequestBody;
  if (!body.reservationId) {
    return NextResponse.json({ ok: false, message: 'reservationId がありません。' }, { status: 400 });
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });

  const { data: userData, error: userError } = await client.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, message: 'ログイン情報を確認できません。' }, { status: 401 });
  }

  const { data: reservationData, error: reservationError } = await client
    .from('reservations')
    .select('id,reservation_slot_id,member_id,status')
    .eq('id', body.reservationId)
    .eq('member_id', userData.user.id)
    .single();

  if (reservationError || !reservationData) {
    return NextResponse.json({ ok: false, message: '予約情報が見つかりません。' }, { status: 404 });
  }

  const reservation = reservationData as ReservationRow;

  const [{ data: slotData }, { data: memberData }] = await Promise.all([
    client.from('reservation_slots').select('id,menu_id,starts_at,ends_at').eq('id', reservation.reservation_slot_id).single(),
    client.from('members').select('id,full_name,email').eq('id', reservation.member_id).single()
  ]);

  const slot = slotData as SlotRow | null;
  const member = memberData as MemberRow | null;

  let menuName = '予約枠';
  if (slot?.menu_id) {
    const { data: menuData } = await client.from('menus').select('id,name').eq('id', slot.menu_id).single();
    menuName = (menuData as MenuRow | null)?.name ?? menuName;
  }

  const memberName = member?.full_name ?? userData.user.email ?? '会員';
  const memberEmail = member?.email ?? userData.user.email;
  const subject = 'friends ご予約完了のお知らせ';
  const bodyText = buildReservationMail({
    memberName,
    menuName,
    startsAt: slot?.starts_at,
    endsAt: slot?.ends_at
  });

  const mailResults = [];
  if (memberEmail) {
    mailResults.push(await sendMail({
      to: memberEmail,
      subject,
      body: bodyText,
      from: process.env.MAIL_FROM_FRIENDS
    }));
  }

  if (process.env.ADMIN_NOTIFICATION_EMAIL) {
    mailResults.push(await sendMail({
      to: process.env.ADMIN_NOTIFICATION_EMAIL,
      subject: `【管理者通知】${subject}`,
      body: `${bodyText}\n\n会員ID: ${reservation.member_id}\n予約ID: ${reservation.id}`,
      from: process.env.MAIL_FROM_FRIENDS
    }));
  }

  const logRows = mailResults.map((result) => ({
    reservation_id: reservation.id,
    to_email: result.payload.to,
    subject: result.payload.subject,
    status: result.ok ? 'sent' : result.skipped ? 'skipped' : 'failed',
    provider_response: result
  }));

  if (logRows.length > 0) {
    await client.from('mail_logs').insert(logRows);
  }

  return NextResponse.json({
    ok: mailResults.every((result) => result.ok),
    skipped: mailResults.some((result) => result.skipped),
    message: mailResults.some((result) => result.skipped)
      ? '予約は完了しています。メール送信はAPIキー設定待ちです。'
      : '予約完了メールを処理しました。'
  });
}
