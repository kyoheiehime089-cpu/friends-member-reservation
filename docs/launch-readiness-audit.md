# 会員予約システム ローンチ前監査レポート

監査日: 2026-05-12  
対象リポジトリ: `kyoheiehime089-cpu/friends-member-reservation`  
対象アプリ: friends 行徳 / blossom yoga 会員予約管理システム

## 監査サマリー

現時点のアプリは、Next.js の画面構成、Supabase 接続の土台、RLS を含む初期スキーマ、会員の予約作成・キャンセル処理の最小実装が入っています。一方で、実運用に必要な予約ルール、プラン制限、会員ステータス制限、管理者認可、管理画面の実データ操作、メール通知、運用手順は未完成です。

特に重要な点は、会員向け予約画面がまだデモ枠 `sampleSlots` を表示しており、実際の `reservation_slots` とは連動していないことです。また、RLS は「自分の予約だけ見る」「自分の予約だけ作る」という基本保護はありますが、予約可能期間、同時予約数、同日重複、プラン週回数、休会・未払いなどの制限は DB 側でもアプリ側でも強制されていません。

そのため、現状は「開発プレビュー・内部検証」には使えますが、「実会員へ公開して予約を受け付ける」段階ではありません。

## 監査時に確認した主なファイル

- `src/app/page.tsx`: トップページ、予約ルールの表示。
- `src/app/login/page.tsx`: Supabase Auth のメール・パスワードログイン。
- `src/app/reserve/page.tsx`: 会員予約画面、デモ枠表示、予約 insert 処理。
- `src/app/my-reservations/page.tsx`: 自分の予約一覧、キャンセル update 処理。
- `src/app/admin/*/page.tsx`: 管理者画面群。
- `src/components/AppShell.tsx`: 共通ヘッダー、会員・管理導線。
- `src/components/AdminPage.tsx`: 管理者画面の共通レイアウト。
- `src/lib/supabaseClient.ts`: Supabase クライアント初期化と環境変数判定。
- `src/lib/initialData.ts`: デモ表示用メニュー、予約枠、予約ルール、会員ステータス。
- `src/lib/mail.ts`: メール送信の未接続スタブ。
- `supabase/schema.sql`: テーブル、RLS、定員超過防止トリガー、初期データ。
- `.env.example`: 必要な環境変数の例。
- `README.md`: セットアップ・運用予定の説明。

## 実行したチェックコマンド

| コマンド | 結果 | メモ |
| --- | --- | --- |
| `npm run lint` | 成功 | ESLint warning/error なし。npm の `http-proxy` 設定警告のみ表示。 |
| `npx tsc --noEmit` | 成功 | TypeScript 型チェック成功。npm の `http-proxy` 設定警告のみ表示。 |
| `npm run build` | 成功 | Next.js production build 成功。14ページが静的生成された。npm の `http-proxy` 設定警告のみ表示。 |

## 1. 現在できていること

- Next.js App Router の基本ページが存在します。
  - `/`: トップページ。
  - `/login`: 会員・管理者共通ログイン画面。
  - `/reserve`: 会員予約画面。
  - `/my-reservations`: 自分の予約一覧・キャンセル画面。
  - `/admin`: 管理者ダッシュボード。
  - `/admin/reservations`: 予約一覧の管理画面モック。
  - `/admin/members`: 会員一覧の管理画面モック。
  - `/admin/menus`: メニュー管理モック。
  - `/admin/plans`: プラン管理モック。
  - `/admin/schedules`: 予約枠管理モック。
  - `/admin/settings`: 基本設定モック。
- Supabase 未設定時に `createClient('', '')` を呼ばず、画面上に設定不足メッセージを出す仕組みがあります。
- `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` がある場合だけ Supabase クライアントを作成します。
- ログイン画面では Supabase Auth の `signInWithPassword` を使っています。
- 予約画面では、ログイン済みユーザーの ID を `member_id` として `reservations` に insert する処理があります。
- 自分の予約一覧では、ログイン済みユーザーの `member_id` に一致する予約だけを取得する処理があります。
- キャンセル処理は、対象予約の `status` を `cancelled` に update する最小実装があります。
- Supabase スキーマには以下の主要テーブルがあります。
  - `stores`
  - `menus`
  - `plans`
  - `members`
  - `admin_users`
  - `reservation_rules`
  - `reservation_slots`
  - `reservations`
  - `notification_settings`
  - `mail_logs`
  - `audit_logs`
  - `settings_change_logs`
- RLS は有効化されています。
- 会員は自分の `members` レコードと自分の `reservations` を閲覧できるポリシーがあります。
- 会員は自分の `reservations` を insert/update できるポリシーがあります。
- 管理者判定用の `is_admin()` 関数と、管理者用の管理テーブル操作ポリシーがあります。
- `reservations_capacity_guard` トリガーにより、`status = 'booked'` の予約数が枠定員を超える insert/update を防ぐ設計があります。
- `reservations` には `(reservation_slot_id, member_id)` の unique 制約があり、同じ会員が同じ予約枠に二重予約することは防止されています。
- `members.status` には `有効`, `休会中`, `退会予定`, `退会済み`, `停止中`, `未払い` の check 制約があります。
- `plans` には `weekly_limit` と `unlimited` があり、プラン制限のデータ設計の土台があります。
- `reservation_rules` には、14日先まで、最大2件、同日複数不可、キャンセル期限などを表現するカラムがあります。
- メール送信関数は未接続ですが、`MAIL_API_KEY` 未設定時に送信をスキップするスタブがあります。
- README に Supabase 設定、Vercel 環境変数、初期オーナー作成、会員登録手順の説明があります。
- `npm run lint`, `npx tsc --noEmit`, `npm run build` は成功しました。

## 2. 一部できているが不完全なこと

- 予約画面は存在しますが、表示している枠は `src/lib/initialData.ts` の `sampleSlots` であり、Supabase の `reservation_slots` から取得していません。
- 予約 insert は実装されていますが、画面上の `slotId` がデモ文字列のため、実 Supabase の UUID と一致しない限り保存に失敗します。
- 残席表示は `initialMenus.capacity - sampleSlots.reserved` で計算しており、実際の `reservations` 件数を反映していません。
- 自分の予約一覧は `reservations` を取得しますが、`reservation_slots` や `menus` を join していません。表示日時はデモ `sampleSlots` と ID が一致する場合のみ正しく出ます。
- キャンセル処理は `status = 'cancelled'` への update のみで、`cancelled_at` や `cancelled_by` を設定していません。
- キャンセル期限の案内は README やデモ文言にありますが、実際の制御としては実装されていません。
- 管理者画面はページと導線がありますが、多くはデモ表示であり、Supabase 実データの CRUD には接続されていません。
- RLS には管理者ポリシーがありますが、Next.js 側で `/admin` 配下へのアクセス制御がありません。
- 管理者リンクは共通ヘッダーに常時表示されており、一般会員にも見えます。
- 予約ルールは `reservation_rules` テーブルと `initialData` にありますが、予約時の実処理では参照していません。
- プラン・会員ステータスは DB にありますが、予約可否判定では参照していません。
- メール通知の環境変数とログ用テーブルはありますが、実メール送信・予約完了メール・キャンセルメール・管理者通知は未実装です。
- エラー表示は一部日本語ですが、Supabase から返る英語エラーをそのまま表示する箇所があります。

## 3. 未実装の重要機能

- 予約グリッド UI。
  - 横軸に日付、縦軸に時間、セルに予約ボタンを表示する本来の予約 UI は未実装です。
- 実 Supabase の `reservation_slots` と `reservations` を使った空き枠一覧表示。
- 枠ごとの実予約数集計と残席表示。
- 満席枠の予約不可制御の DB レベル・アプリレベル両方での明確化。
- 14日先までの予約制限。
- 過去枠の予約禁止。
- `is_open = false` のクローズ枠予約禁止。
- 最大2件の有効な未来予約数制限。
- 同日複数予約禁止。
- 週1・週2・通い放題のプラン制限。
- `休会中`, `退会済み`, `停止中`, `未払い` などの非アクティブ会員の予約禁止。
- キャンセル期限の強制。
- 再予約時の扱い整理。
  - 同じ枠をキャンセル後に再予約できるかどうか、現在の unique 制約では同じ `(reservation_slot_id, member_id)` の再 insert ができません。
  - 再予約を許可するなら cancelled レコードを booked に戻すか、部分 unique index に変更する必要があります。
- 管理者ログイン後の認可チェック。
- 管理者による実データの予約一覧、会員一覧、枠作成・編集・クローズ、定員変更、プラン・ステータス変更、代理予約、会員予約キャンセル。
- 監査ログ・設定変更ログへの実書き込み。
- メール通知。
- 本番運用手順書。
- Supabase SQL 適用後の検証手順。
- 手動 QA チェックリストの正式版。
- Vercel 本番公開前チェックリスト。

## 4. ローンチ前の重大ブロッカー

1. 予約画面が実予約枠ではなくデモデータを表示している。
   - 実会員が正しい日時を選べないため、本番公開不可です。
2. 予約 insert にデモ ID を使っている。
   - Supabase の `reservation_slot_id` は UUID のため、現状の `sampleSlots` ID では通常は予約保存できません。
3. 予約ルールが強制されていない。
   - 14日先、最大2件、同日不可、過去不可、クローズ枠不可などが未実装です。
4. プラン制限・会員ステータス制限が強制されていない。
   - 未払い・休会中の会員でも、RLS 上は自分の予約を insert できる可能性があります。
   - friends の実運用ルールは週の区切りが日曜〜土曜ですが、現状のスキーマ/監査上は `reservation_rules.week_starts_on = 'monday'` が参照されています。週1・週2プラン制限を実装する前に、DB 設定を日曜開始へ変更するか、業務ルールとして月曜開始でよいかを必ず確定する必要があります。
5. 管理者画面にアクセス制御がない。
   - `/admin` 配下が静的な管理画面として誰でも閲覧できる状態です。
6. 管理者画面が実運用機能として未完成。
   - 枠作成、枠停止、定員変更、会員ステータス変更、代理予約、キャンセル処理が実データに反映されません。
7. キャンセル期限・当日キャンセル消化ルールが強制されていない。
   - 会員が期限後もキャンセルできる可能性があります。
   - friends の実運用では、当日キャンセルは利用済み/消化扱いにする必要がありますが、現状のキャンセル処理は `status = 'cancelled'` にするだけで、消化扱いか振替対象かを記録していません。
8. キャンセル後の再予約・振替仕様が未整理。
   - unique 制約により同じ枠への再予約ができない可能性があります。
   - 怪我・体調不良などの例外時に1回だけ振替を認める運用は未実装です。これは会員が自動操作する機能ではなく、管理者だけが手動調整できる例外処理として設計すべきです。
9. 予約一覧の日時表示が実データに紐づいていない。
   - 会員が自分の予約日時を正しく確認できません。
10. 本番用の運用ドキュメントと手動テスト手順が不足している。

## 5. 予約機能のリスク

### overbooking / 定員超過

- DB トリガー `ensure_reservation_capacity()` は、`status = 'booked'` の件数が `reservation_slots.capacity` 以上なら例外を出します。
- cancelled 予約は `status = 'booked'` ではないため、定員カウントから除外されます。この点は設計上は良いです。
- ただし、画面側の残席表示は実データではなくデモの `reserved` 値です。本番では画面表示と DB の実定員が食い違う可能性があります。
- 同時アクセス時の競合に対して、現在のトリガーだけで完全に安全かは追加検証が必要です。必要に応じて RPC、行ロック、トランザクション、DB 関数化を検討してください。

### duplicate booking / 重複予約

- 同じ会員が同じ予約枠を二重予約することは、`reservations` の unique 制約で防げます。
- ただし、同じ日付の別時間枠を複数予約することは防げません。
- 最大2件以上の未来予約を持つことも防げません。
- 同じ週に週1・週2制限を超えて予約することも防げません。

### cancelled reservations counting incorrectly / キャンセル済み予約の扱い

- 定員トリガーは `status = 'booked'` のみ数えるため、キャンセル済み予約は定員に含まれません。
- しかし、会員予約数制限、週回数制限、同日重複制限が未実装なので、キャンセル済みをどう除外するかの仕様がまだ処理に入っていません。
- キャンセル後の同じ枠への再予約は unique 制約が障害になる可能性があります。
- friends の実運用では、当日キャンセルは利用済み/消化扱いにする必要があります。しかし現状は `status = 'cancelled'` のみで、当日キャンセルを週回数・月会費上の消化として扱うか、例外振替として扱うかの情報を保持していません。
- 怪我・体調不良などによる例外振替は未実装です。自動で会員が振替できる仕組みではなく、管理者が事情を確認して手動で1回分を移す運用として設計する必要があります。

### past slot booking / 過去枠予約

- 過去の `starts_at` を持つ予約枠への予約禁止が実装されていません。
- RLS の insert policy でも、過去枠かどうかを確認していません。

### closed slot booking / クローズ枠予約

- `reservation_slots` の select policy は `is_open = true` の枠だけ公開します。
- しかし、予約 insert policy は `reservation_slot_id` の参照先が `is_open = true` か確認していません。
- UUID を知っている、または別経路で取得したクローズ枠 ID に対して insert できる可能性があります。

### same-day duplicate booking / 同日重複

- `reservation_rules.allow_multiple_same_day` はありますが、予約処理で参照していません。
- 同じ日付に複数枠を予約できる可能性があります。

### holding more than 2 reservations / 2件超の保持

- `reservation_rules.max_active_reservations` はありますが、予約処理で参照していません。
- 未来の有効予約を3件以上保持できる可能性があります。

## 6. プラン制限・会員ステータスのリスク

- `plans.weekly_limit` と `plans.unlimited` は存在しますが、予約 insert 時に参照されていません。
- `members.status` は check 制約で値の種類を制限していますが、`有効` 以外の会員の予約を禁止していません。
- `休会中`, `退会済み`, `停止中`, `未払い` の会員でも、Supabase Auth にログインでき、自分の `member_id` で insert できれば予約できる可能性があります。
- `退会予定` を予約可能にするかどうかの business rule が未確定です。現状は `memberStatuses` に表示されるだけです。
- 週1・週2の週カウントは `reservation_rules.week_starts_on = 'monday'` の設計がありますが、実計算はありません。
- friends の実運用ルールは日曜〜土曜で週を数えるため、現状の `monday` 設定のまま週1・週2制限を実装すると、日曜予約のカウント週がずれて誤って予約を許可/拒否するリスクがあります。プラン制限実装前に、DB の `week_starts_on` を `sunday` 相当に変えるか、設定値と業務ルールを明示的に一致させる必要があります。
- 当日キャンセルは本来「利用済み/消化」扱いにすべきですが、現在は cancelled 予約を週回数に含める/含めない判断材料がありません。通常キャンセル、当日キャンセル、管理者承認済み振替を区別できるデータ設計が必要です。
- 怪我・体調不良などの例外振替は、会員自身が自由に実行する機能ではなく、管理者が手動で付与・調整・記録する運用にする必要があります。
- 通い放題は `unlimited = true` としてデータ表現できますが、予約ロジックでは未使用です。
- プラン未設定会員、`plan_id = null` 会員の扱いが未定義です。

## 7. 管理者画面のリスク

- `/admin` 配下のページは存在しますが、Next.js 側でログイン必須・管理者必須のガードがありません。
- 管理者画面は共通ヘッダーから一般会員にも見える導線になっています。
- 管理者ページの多くは `initialData` / `sampleReservations` によるデモ表示です。
- 管理者は現状、画面から実予約一覧を確認できません。
- 管理者は現状、画面から予約枠を作成・編集・クローズできません。
- 管理者は現状、画面から定員を変更できません。
- 管理者は現状、画面から会員のプラン・ステータスを変更できません。
- 管理者は現状、画面から会員予約をキャンセルできません。
- 管理者は現状、画面から会員の代理予約を作成できません。
- 監査ログや設定変更ログはテーブルのみで、管理画面操作と連動していません。
- 実店舗運用では、当日予約確認、満席枠、キャンセル待ち、休業日、臨時変更、会員への連絡履歴が必要になる可能性があります。

## 8. セキュリティ・RLSのリスク

### 通常会員が他会員を見られないか

- `members` の select policy は `id = auth.uid()` または admin のみです。
- 基本的に通常会員は他会員プロフィールを読めない設計です。
- ただし、`members update own profile` により会員が自分の `members` レコードを update できます。対象カラム制限がないため、会員が自分の `status`, `plan_id`, `store_id`, `email`, `full_name` を変更できる可能性があります。これは重大リスクです。

### 通常会員が他会員の予約を見られないか

- `reservations` の select policy は `member_id = auth.uid()` または admin のみです。
- 基本的に通常会員は他会員予約を読めない設計です。

### 通常会員が他会員の予約をキャンセルできないか

- `reservations` の update policy は `member_id = auth.uid()` または admin のみです。
- 基本的に他会員予約の update はできない設計です。
- ただし、自分の予約については任意の update ができる可能性があります。`status` を `attended` や `no_show` に変更できる、`reservation_slot_id` を別枠に変更できる、などの危険があるため、会員キャンセルは専用 RPC に閉じ込めるべきです。

### 通常会員が管理者ページへアクセスできないか

- 現状、Next.js 側の `/admin` 認可ガードがありません。
- 管理者ページは静的表示中心とはいえ、一般会員や未ログインユーザーが閲覧できます。
- 実データ操作を入れる前に、必ず admin guard を実装してください。

### 管理者が必要なデータを管理できるか

- RLS 上は `public.is_admin()` による管理者操作ポリシーがあります。
- ただし、画面側の CRUD が未実装のため、管理者は実運用に必要なデータ管理を画面から行えません。
- `admin_users` の初期作成は SQL 手順頼みです。

### service_role key が露出していないか

- `.env.example` と README には service_role key は含まれていません。
- クライアントコードでは `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` のみ参照しています。
- 現時点で service_role key 露出は確認されませんでした。

### RLS policies は適切か

- 最小限の保護はありますが、本番には不十分です。
- 予約 insert/update policy が予約ルール、会員ステータス、プラン制限、枠の open 状態、過去枠、14日先制限を確認していません。
- 会員が自分の `members` レコードを更新できる policy は本番前に見直しが必要です。
- 会員が自分の予約を update できる policy は広すぎます。キャンセル専用の DB 関数または RPC に限定すべきです。

## 9. 環境変数・Vercel・Supabase設定の確認点

### 必須または準必須の環境変数

- `NEXT_PUBLIC_SUPABASE_URL`
  - Supabase Project URL。
  - クライアント公開値です。
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Supabase anon public key。
  - RLS 前提で使う公開値です。
- `MAIL_API_KEY`
  - メール API 用。現状は未使用スタブです。
- `MAIL_FROM_FRIENDS`
  - friends 送信用 From アドレス予定。
- `MAIL_FROM_YOGA`
  - blossom yoga 送信用 From アドレス予定。
- `ADMIN_NOTIFICATION_EMAIL`
  - 管理者通知先予定。

### 設定リスク

- Supabase 環境変数が未設定でも build は通りますが、ログイン・予約保存はできません。
- Vercel Preview と Production の両方に Supabase 変数を設定する必要があります。
- 本番 DB と検証 DB を分けるかどうかを決める必要があります。
- Supabase SQL `supabase/schema.sql` をいつ、誰が、どの環境に適用したか記録する必要があります。
- service_role key は絶対に `NEXT_PUBLIC_` 付きで設定しないでください。
- メール API キーは現状設定しても送信処理が未実装のため、送信できません。
- 初期オーナー作成は Auth user UUID を使った SQL 手作業です。手順ミスがあると管理者権限が付与されません。

## 10. スマホUI・会員導線の改善点

- 主要画面は Tailwind の responsive class を使っており、カードやボタンはスマホでも一定程度表示できます。
- 予約画面は現在「メニュー選択 → 空き枠カード一覧」の構成です。本来の「日付×時間グリッド」ではありません。
- iPhone で実会員が使う場合、以下が不足しています。
  - ログイン後に自動で自分の予約可能メニューだけ見えること。
  - 予約可能な日付だけを直感的に選べること。
  - 満席、予約済み、予約不可、キャンセル期限切れが一目でわかること。
  - 予約完了後に「自分の予約一覧」へすぐ移動できること。
  - キャンセル時に確認ダイアログを出すこと。
  - Supabase 英語エラーを会員向け日本語メッセージに変換すること。
  - 横スクロールが必要なグリッドの場合、日付ヘッダーや時間列を見失わないこと。
  - ボタンサイズを親指操作しやすくすること。
  - ログアウト導線があること。
- 管理画面のテーブルは一部 `overflow-x-auto` が入っていますが、スマホで管理運用するには、検索、フィルタ、詳細カード表示が必要です。

## 11. 推奨するPR順序

1. Reservation grid UI
   - 実 Supabase の `reservation_slots` と `reservations` を取得し、日付×時間のグリッドで表示する。
   - この段階では既存の予約 insert 行動を大きく変えず、表示と導線を本番に近づける。
2. Booking logic hardening
   - 予約作成を DB 関数または server action / route handler に集約する。
   - 満席、クローズ枠、過去枠、14日外を確実に拒否する。
   - キャンセルも専用処理にする。
3. Booking limits
   - 最大2件、同日複数不可、キャンセル済み除外、再予約仕様を実装する。
   - 通常キャンセル、当日キャンセル消化、管理者承認済み振替を区別できる状態管理を決める。
4. Plan limits and member status restrictions
   - 週1・週2・通い放題、`有効` 以外の予約不可を実装する。
   - friends の週区切りは日曜〜土曜であるため、`reservation_rules.week_starts_on` の DB 設定/実装を業務ルールと一致させてから週回数制限を実装する。
   - 怪我・体調不良などの例外振替は、管理者専用の手動調整として扱う。
5. Admin dashboard improvements
   - 予約一覧、会員一覧、予約枠作成・編集・クローズ、定員変更、プラン・ステータス変更、代理予約、管理者キャンセルを実データ対応にする。
6. Security/RLS hardening
   - `/admin` の認可ガード、RLS の insert/update 制限強化、会員自身による危険な更新の禁止、RPC 化を行う。
7. Email notifications
   - 予約完了、キャンセル、管理者通知、メールログ保存を実装する。
8. Mobile UI polish
   - iPhone での予約・キャンセル導線、エラー文言、ボタンサイズ、グリッド横スクロールを磨く。
9. Launch checklist and operation docs
   - オーナー向け本番運用手順、トラブル対応、日次確認、会員登録手順、Vercel/Supabase 設定確認を整備する。

## 12. オーナーが手動確認すべきチェックリスト

### ログイン

- [ ] 有効な会員メール・パスワードでログインできる。
- [ ] 間違ったパスワードでログインできない。
- [ ] 未ログイン状態で予約しようとすると、ログインが必要だとわかる。
- [ ] ログアウト導線が確認できる、または実装予定として認識している。

### 予約

- [ ] 会員が予約画面を開ける。
- [ ] 予約したいメニューを選べる。
- [ ] 実際の予約枠が表示される。
- [ ] 空き枠の残席が正しい。
- [ ] 予約ボタンを押すと予約が保存される。
- [ ] 予約完了メッセージが日本語でわかりやすい。
- [ ] 予約後、自分の予約一覧に正しい日時・メニューで表示される。

### キャンセル

- [ ] 自分の予約をキャンセルできる。
- [ ] キャンセル済み予約は「キャンセル済み」と表示される。
- [ ] キャンセル済み予約が残席に戻る。
- [ ] キャンセル期限後は会員がキャンセルできない。
- [ ] 当日キャンセルが利用済み/消化扱いとして記録・判定される。
- [ ] 怪我・体調不良などで例外振替を認める場合、会員の自動操作ではなく管理者が手動で1回分を調整できる。
- [ ] キャンセル時に確認表示がある。

### 再予約

- [ ] キャンセル後、同じ枠を再予約できる仕様かどうか確認する。
- [ ] 再予約を許可する場合、実際に再予約できる。
- [ ] 再予約を禁止する場合、会員にわかりやすい日本語メッセージが出る。

### 満席動作

- [ ] 残席0の枠は満席表示になる。
- [ ] 満席枠の予約ボタンは押せない。
- [ ] 複数端末で同時に最後の1枠を予約しても定員を超えない。
- [ ] キャンセル済み予約は定員にカウントされない。

### 重複予約

- [ ] 同じ枠を二重予約できない。
- [ ] 同じ日に別枠を予約できない設定になっている。
- [ ] 未来予約を3件以上持てない。
- [ ] 過去枠を予約できない。
- [ ] 14日より先の枠を予約できない。
- [ ] クローズした枠を予約できない。

### 週回数制限

- [ ] friends の週区切りが日曜〜土曜として実装・設定されている。
- [ ] 週1プランは日曜〜土曜の同じ週に1件まで予約できる。
- [ ] 週2プランは日曜〜土曜の同じ週に2件まで予約できる。
- [ ] 通い放題プランは週回数制限なしで予約できる。
- [ ] 通常の期限内キャンセルは週回数にカウントされない。
- [ ] 当日キャンセルは利用済み/消化として週回数にカウントされる。
- [ ] 管理者が承認した怪我・体調不良などの例外振替は、通常の当日キャンセル消化とは区別して確認できる。

### 会員ステータス制限

- [ ] `有効` 会員は予約できる。
- [ ] `休会中` 会員は予約できない。
- [ ] `退会済み` 会員は予約できない。
- [ ] `停止中` 会員は予約できない。
- [ ] `未払い` 会員は予約できない。
- [ ] `退会予定` 会員の扱いをオーナーが確認する。

### 管理者ログイン

- [ ] 管理者メール・パスワードでログインできる。
- [ ] 管理者だけが `/admin` にアクセスできる。
- [ ] 一般会員は `/admin` を開けない。
- [ ] 未ログインユーザーは `/admin` を開けない。

### 管理者予約一覧

- [ ] 管理者が全予約を見られる。
- [ ] 日付、時間、会員名、メニュー、ステータスで確認できる。
- [ ] 予約検索・絞り込みができる。
- [ ] 管理者が会員予約をキャンセルできる。
- [ ] 管理者操作が監査ログに残る。

### 管理者枠管理

- [ ] 管理者が予約枠を作成できる。
- [ ] 管理者が予約枠を編集できる。
- [ ] 管理者が予約枠をクローズできる。
- [ ] 管理者が定員を変更できる。
- [ ] 休業日・臨時休業の運用ができる。
- [ ] 予約済み枠の定員変更時の扱いを確認できる。

### スマートフォン表示

- [ ] iPhone Safari でログインできる。
- [ ] iPhone Safari で予約グリッドが見やすい。
- [ ] iPhone Safari で予約ボタンが押しやすい。
- [ ] iPhone Safari でキャンセルが迷わずできる。
- [ ] 横スクロールがある場合でも日付・時間がわかる。
- [ ] エラーメッセージが画面内で読みやすい。

## 13. Codexへの次回指示案

次回 PR では、まず「実予約枠を使った会員向け予約グリッド UI」を作るのが安全です。予約ルールの全面実装は次々回以降に分け、今回の booking/cancellation 挙動を大きく変えずに、表示とデータ取得を本番に近づけることを推奨します。

以下を次回 Codex への指示として使ってください。

```text
Repository: kyoheiehime089-cpu/friends-member-reservation

Task: Implement reservation grid UI for the member reservation page.

Context:
This is a Next.js + TypeScript + Supabase member reservation system for friends 行徳 / blossom yoga.
Basic booking and cancellation exist, but /reserve currently uses demo sampleSlots from src/lib/initialData.ts.
The launch readiness audit is in docs/launch-readiness-audit.md.

Goal:
Implement the first production-oriented reservation grid UI without changing the core booking/cancellation rules yet.

Requirements:
1. Update /reserve to display a grid:
   - dates on the horizontal axis
   - times on the vertical axis
   - each cell shows availability and a reservation button when available
2. Fetch real reservation_slots from Supabase when Supabase is configured.
3. Fetch active booked reservations per slot to calculate remaining seats.
4. Keep a safe demo fallback only when Supabase env vars are missing.
5. Do not implement weekly plan limits or membership status restrictions in this PR.
6. Do not redesign the whole app.
7. Keep Japanese UI messages.
8. Preserve existing booking behavior as much as possible, but make booking use the real reservation_slot_id from Supabase when real data is loaded.
9. Make the grid usable on iPhone with horizontal scrolling if needed.
10. Add or update documentation if needed.
11. Run:
    - npm run lint
    - npx tsc --noEmit
    - npm run build
12. Create a PR after committing changes.

Acceptance criteria:
- /reserve no longer depends only on sampleSlots when Supabase is configured.
- Real slots can be shown by date/time grid.
- Remaining seats are calculated from real booked reservations.
- Full slots show as unavailable in the UI.
- Build, lint, and typecheck pass or failures are documented.
```
