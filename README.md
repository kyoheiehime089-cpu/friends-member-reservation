# friends-member-reservation

friends 行徳 / blossom yoga 専用の会員予約管理システムです。Next.js、TypeScript、Tailwind CSS、Supabase を使い、会員予約・予約確認・管理者運用を第1版としてローンチ直前まで進めるための構成にしています。

## 1. アプリ概要

- 会員向け: トップ、ログイン、予約、メニュー選択、空き枠表示、予約完了表示、自分の予約一覧、キャンセル案内。
- 管理者向け: 管理者ダッシュボード、今日の予約、予約一覧、会員一覧、予約枠管理、メニュー管理、プラン管理、基本設定、管理者予約追加、管理者キャンセル処理の導線。
- Supabase未設定時も `createClient('', '')` を呼ばず、画面に「Supabase環境変数を設定してください」と表示してVercelビルドを通します。
- Supabase設定後は `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` で実データへ接続します。service_role key はクライアントに出しません。

## 2. ローカル起動方法

```bash
npm install
cp .env.example .env.local
npm run dev
```

Supabase接続前でも主要画面はデモデータで表示できます。実データで確認する場合のみ `.env.local` に以下を設定してください。

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
MAIL_API_KEY=
MAIL_FROM_FRIENDS=
MAIL_FROM_YOGA=
ADMIN_NOTIFICATION_EMAIL=
```

## 3. Supabaseプロジェクト作成方法

1. Supabaseで新規プロジェクトを作成します。
2. Project Settings > API で Project URL と anon public key を確認します。
3. URLを `NEXT_PUBLIC_SUPABASE_URL`、anon public key を `NEXT_PUBLIC_SUPABASE_ANON_KEY` に設定します。
4. service_role key はブラウザへ出さず、必要になった時だけサーバー専用環境変数として扱ってください。

## 4. Supabase SQL実行方法

1. Supabase SQL Editor を開きます。
2. `supabase/schema.sql` の全文を貼り付けて実行します。
3. `stores`、`menus`、`plans`、`members`、`admin_users`、`reservation_slots`、`reservations`、`reservation_rules`、`notification_settings`、`audit_logs`、`settings_change_logs`、`mail_logs` が作成されます。
4. RLSは有効化済みです。会員は自分の会員情報と予約のみ閲覧し、管理者は管理テーブルを扱えます。
5. 予約定員超過は `reservations_capacity_guard` トリガーで防止します。

## 5. Vercel環境変数設定方法

Vercel Project Settings > Environment Variables に以下を設定します。値はGitHubやPR本文に書かないでください。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `MAIL_API_KEY`
- `MAIL_FROM_FRIENDS`
- `MAIL_FROM_YOGA`
- `ADMIN_NOTIFICATION_EMAIL`

Supabase変数が未設定でもビルドは成功しますが、予約保存・ログインはできません。

## 6. Vercel公開方法

1. 作業ブランチをGitHubへpushします。
2. Pull Requestを作成します。
3. Vercel Preview Deployment のURLで主要画面を確認します。
4. 問題なければPRをレビュー後にmainへマージします。mainへ直接コミットしないでください。
5. Production Deployment が成功したら公開URLを会員へ案内します。

## 7. 初期オーナー作成手順

1. Supabase Authentication > Users で `kyohei.ehime089@gmail.com` のユーザーを作成します。
2. 作成されたユーザーUUIDを控えます。
3. SQL Editor で次を実行します。

```sql
insert into public.admin_users (id, email, role)
values ('AUTH_USER_UUID', 'kyohei.ehime089@gmail.com', 'owner')
on conflict (id) do update set role = excluded.role;
```

## 8. 会員登録手順

1. Supabase Authenticationで会員ユーザーを作成します。
2. `members` テーブルへ Auth user UUID、氏名、メール、プラン、ステータスを登録します。
3. 初期ステータスは `有効`、`休会中`、`退会予定`、`退会済み`、`停止中`、`未払い` から選択します。

## 9. ログインID・仮パスワード送信手順

第1版では実メール送信は未接続です。管理者がSupabaseで仮パスワードを発行し、メールAPI接続後に送信してください。

1. 会員のメールアドレスをログインIDにします。
2. 仮パスワードを発行します。
3. メールAPI設定後、送信関数からログインIDと仮パスワードを送ります。
4. 送信結果は `mail_logs` へ保存する設計です。

## 10. 会員予約画面の使い方

1. `/login` からログインします。
2. `/reserve` でメニューを選択します。
3. 空き枠の残席を確認して「予約する」を押します。
4. 完了メッセージが表示されます。
5. `/my-reservations` で予約を確認できます。
6. キャンセル期限後は「管理者へご連絡ください」と表示します。

## 11. 管理者画面の使い方

- `/admin`: 今日の予約、管理者予約追加、キャンセル処理、基本設定への導線。
- `/admin/reservations`: 予約一覧、検索、管理者による予約追加、キャンセル処理。
- `/admin/members`: 会員一覧、登録、プラン変更、ステータス管理。
- `/admin/menus`: セミパーソナル、ヨガ、イベントの管理。
- `/admin/plans`: 週1、週2、通い放題、その他プランの管理。
- `/admin/schedules`: 平日・土日祝の予約枠、木曜定休、一括設定。
- `/admin/settings`: 予約受付開始日、同時予約数、キャンセル期限、通知設定。

## 12. メール通知設定方法

`.env.local` と Vercel に以下を設定します。

- `MAIL_API_KEY`: SendGrid / Resend などのAPIキー。
- `MAIL_FROM_FRIENDS`: friends用送信元。
- `MAIL_FROM_YOGA`: blossom yoga用送信元。
- `ADMIN_NOTIFICATION_EMAIL`: 管理者通知先。

`src/lib/mail.ts` は雛形です。実API接続を追加するまで実メールは送信されません。APIキーはGitHubへコミットしないでください。

## 13. ローンチ前チェックリスト

- [ ] Vercel Previewで `/`、`/login`、`/reserve`、`/my-reservations`、`/admin`、`/admin/reservations`、`/admin/members`、`/admin/menus`、`/admin/plans`、`/admin/schedules` が表示される。
- [ ] Supabase SQLを実行済み。
- [ ] 初期オーナーを `admin_users` に登録済み。
- [ ] 会員データを登録済み。
- [ ] 予約枠を本番日程で作成済み。
- [ ] Vercel環境変数を設定済み。
- [ ] `npm run build` と `npm run lint` が成功済み。
- [ ] 実予約・キャンセル・期限後キャンセル案内を確認済み。
- [ ] メール送信文面と送信元を確認済み。

## 14. 会員への案内文テンプレート

> 〇月〇日以降のご予約については、新しい会員予約システムからお願いいたします。  
> ログインIDと仮パスワードをメールでお送りしますので、初回ログイン後にご予約をお願いいたします。  
> 〇月〇日以前のご予約については、これまで通りの方法で確認をお願いいたします。

## 15. 本番反映手順

1. PR上でVercel Previewを確認します。
2. Supabase本番プロジェクトのSQL・初期データ・RLSを確認します。
3. Vercel Production環境変数を設定します。
4. PRをレビューし、問題なければmainへマージします。
5. Production URLで主要画面と予約操作を確認します。

## 16. トラブルシューティング

### `supabaseUrl is required`

`NEXT_PUBLIC_SUPABASE_URL` が未設定の状態で `createClient('', '')` を呼ぶと発生します。本アプリでは `src/lib/supabaseClient.ts` で未設定時に `null` を返し、主要画面は案内UIを表示します。

### ログインできない

- Vercel / `.env.local` の `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を確認してください。
- Supabase Authにユーザーが存在するか確認してください。
- 管理者は `admin_users` に登録されているか確認してください。

### 予約できない

- `reservation_slots` に対象枠があるか確認してください。
- `members` に会員データがあるか確認してください。
- 定員超過、週回数制限、同日複数予約不可、同時予約数制限に該当しないか確認してください。

### メールが送れない

- `MAIL_API_KEY` がVercelに設定されているか確認してください。
- `src/lib/mail.ts` に利用するメールAPIの実装を追加してください。
- `mail_logs` に送信結果が残っているか確認してください。

## 初期データ

- 店舗: friends 行徳
- メニュー: セミパーソナル（5名）、ヨガ（7名）、イベント（8名）
- 平日: 18:30 / 19:20 / 20:10 / 21:00
- 土日祝: 10:00 / 10:50 / 11:40 / 12:30
- 木曜定休
- プラン: セミパーソナル週1、セミパーソナル週2、ヨガ週1、ヨガ週2、ヨガ通い放題、その他

## 予約ルール

- 週カウントは月曜〜日曜。
- 週1プランは週1回まで、週2プランは週2回まで。
- 通い放題は週回数制限なし。
- 同時予約数は初期値2枠まで。
- 同日複数予約は初期設定では不可。
- 予約可能期間は初期値14日先まで。
- キャンセル期限は前日22時まで。
- 予約受付開始日前の枠は予約不可。
