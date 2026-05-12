export const storeName = 'friends 行徳';
export const ownerEmail = 'kyohei.ehime089@gmail.com';

export const initialMenus = [
  { id: 'semi-personal', name: 'セミパーソナル', capacity: 5, description: '少人数でフォーム確認を受けながらトレーニングできます。' },
  { id: 'yoga', name: 'ヨガ', capacity: 7, description: 'blossom yoga のレッスン枠です。' },
  { id: 'event', name: 'イベント', capacity: 8, description: '特別イベント・ワークショップ用の枠です。' }
];

export const initialPlans = [
  { name: 'セミパーソナル週1', weeklyLimit: '週1回まで' },
  { name: 'セミパーソナル週2', weeklyLimit: '週2回まで' },
  { name: 'ヨガ週1', weeklyLimit: '週1回まで' },
  { name: 'ヨガ週2', weeklyLimit: '週2回まで' },
  { name: 'ヨガ通い放題', weeklyLimit: '週回数制限なし' },
  { name: 'その他', weeklyLimit: '個別設定' }
];

export const memberStatuses = ['有効', '休会中', '退会予定', '退会済み', '停止中', '未払い'];

export const weekdaySlots = ['18:30', '19:20', '20:10', '21:00'];
export const weekendSlots = ['10:00', '10:50', '11:40', '12:30'];

export const reservationRules = [
  '週カウントは月曜〜日曜',
  '週1プランは週1回まで / 週2プランは週2回まで',
  '通い放題は週回数制限なし',
  '同時予約数は初期値2枠まで',
  '同日複数予約は初期設定では不可',
  '予約可能期間は初期値14日先まで',
  'キャンセル期限は前日22時まで',
  '予約受付開始日前の枠は予約不可'
];

type SampleSlot = {
  id: string;
  date: string;
  time: string;
  menuId: string;
  reserved: number;
  isOpen?: boolean;
  bookedByCurrentUser?: boolean;
};

export const sampleSlots: SampleSlot[] = [
  { id: '1', date: '2026-05-13', time: '18:30', menuId: 'semi-personal', reserved: 2 },
  { id: '2', date: '2026-05-13', time: '19:20', menuId: 'semi-personal', reserved: 5 },
  { id: '5', date: '2026-05-14', time: '18:30', menuId: 'semi-personal', reserved: 0, isOpen: false },
  { id: '6', date: '2026-05-15', time: '20:10', menuId: 'semi-personal', reserved: 1, bookedByCurrentUser: true },
  { id: '3', date: '2026-05-16', time: '10:00', menuId: 'yoga', reserved: 3 },
  { id: '4', date: '2026-05-17', time: '11:40', menuId: 'event', reserved: 1 }
];

export const sampleReservations = [
  { id: 'r1', date: '2026-05-13', time: '18:30', menu: 'セミパーソナル', status: '予約中', cancelable: true },
  { id: 'r2', date: '2026-05-16', time: '10:00', menu: 'ヨガ', status: '予約中', cancelable: false }
];
