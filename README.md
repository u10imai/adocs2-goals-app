# ADOC-S連携 目標設定アプリ

仕様は `目標設定アプリ_設計まとめ.md`、確認待ちの事項は `保留事項.md` を参照。

## 構成

```
docs/                     公開されるWebアプリ本体(GitHub Pages の公開元に指定する)
  index.html
  css/style.css
  js/config.js            Supabase / Cloudinary の接続設定(空ならデモモード)
  js/store.js             状態管理と全ステップの処理
  js/db.js, auth.js       データ層(デモ=ブラウザ内保存 / Supabase を自動切替)
  js/ai.js, photo.js, excel.js, calendar.js
  js/data/                イラスト(仮)・マスタ
  js/components/          ステップ0〜9の画面
supabase/schema.sql       DB定義 + RLS + 名簿 + 初期データ
supabase/functions/       Edge Function: decompose-steps(工程分解AI)/ roster-export(名簿の一括出力)/
                          backup-export(自動バックアップ用)/ health-check(休止対策のping)
scripts/                  backup-to-drive.mjs(Driveへ保存)/ get-refresh-token.mjs(Google認可・初回のみ)
.github/workflows/        keep-alive.yml(毎日2回ping)/ daily-backup.yml(毎日バックアップ)
package.json              バックアップ用スクリプトの依存(googleapis)のみ
```

ビルド不要の静的サイトです(Vue 3 / SortableJS / SheetJS はCDNから読み込み)。

## ローカルで動かす

```sh
cd docs && python3 -m http.server 8000
# → http://localhost:8000
```

`config.js` が空の間は「デモモード」で、データはブラウザ内(localStorage)だけに保存されます。

## 本番につなぐ手順

**注意: このフォルダはGoogleドライブの中にあります。** gitのリポジトリ(`.git`)や `node_modules` をドライブの中に作ると、同期が重くなったり壊れたりします。GitHubに置くときは、`~/Documents/GitHub/` など**ドライブの外**にコピーして、そこでリポジトリを作ってください。

### 1. Supabase(東京リージョン・無料プランの新しい組織)
1. 新しい組織(無料プラン)を作り、その中にプロジェクトを作る(リージョンは Northeast Asia (Tokyo))
2. SQL Editor で `supabase/schema.sql` を実行
3. 名簿の出力権限を、自分に付ける(SQL Editor で実行。自分のメールアドレスに置き換える)
   ```sql
   insert into roster_export_permission (therapist_id) select id from therapist_account where email = 'あなたのメールアドレス';
   ```
   ※ 先にアプリで自分のアカウントを登録・ログインしておくこと(therapist_account に行ができるため)
4. `docs/js/config.js` に URL と anon key(公開キー)を入れる。service_role キーは絶対に入れない

### 2. Edge Function(Supabase CLI)
```bash
supabase link --project-ref <プロジェクトref>
supabase secrets set BACKUP_EXPORT_SECRET=$(openssl rand -hex 32)   # この値は手順4のGitHub Secretsにも同じものを登録する
supabase secrets set GEMINI_API_KEY=<Geminiのキー>
supabase functions deploy health-check --no-verify-jwt    # 休止対策のping(ログイン不要で呼ぶ)
supabase functions deploy backup-export --no-verify-jwt   # 自動バックアップ(共有シークレットで認証)
supabase functions deploy roster-export                   # 名簿の一括出力(ログイン+権限+パスワード再確認)
supabase functions deploy decompose-steps                 # 工程分解AI
```

### 3. Google Drive のバックアップ先(新しくOAuthを作る。既存の研究アプリとは別)
1. [Google Cloud Console](https://console.cloud.google.com/) で**新しいプロジェクト**を作る(既存の研究アプリのものとは別。片付けを独立させるため)
2. 「APIとサービス」→「ライブラリ」→ **Google Drive API** を有効化
3. 「OAuth同意画面」(Google Auth Platform): External を選び、アプリ名とメールアドレスを入れて保存。
   スコープに `.../auth/drive.file` を追加(「非機密のスコープ」に分類される)。
   **「アプリを公開」(本番)に切り替える**(テスト状態のままだと、トークンが7日で失効してバックアップが止まる)。
   公開するには、ブランディングで次の3つが**必須**(Google公式: 外部の本番アプリは必須):
   アプリケーションのホームページ / プライバシーポリシーのリンク / 承認済みドメイン。
   → 先にGitHub Pagesでサイトを公開し、`about.html`(アプリの説明)と `privacy.html`(プライバシーポリシー)を置いてから設定する
4. 「認証情報」→「OAuthクライアントID」→ 種類は **デスクトップアプリ** で作成。クライアントIDとシークレットを控える
5. 自分のPCで(ドライブの外にコピーしたフォルダで `npm install` してから):
   ```bash
   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... node scripts/get-refresh-token.mjs
   ```
   表示されたURLをブラウザで開いて許可すると、リフレッシュトークンが表示される

許可範囲は `drive.file`(このアプリが作ったファイルとフォルダだけ)です。Drive全体は読み書きできません。
初回のバックアップで、マイドライブの直下に「adocs-goal-app-backup」フォルダが作られます(あとで好きな場所に移動しても、そのまま使えます)。共有設定は変えないでください(あなただけが見られる状態のまま)。

### 4. GitHub
1. リポジトリを作って push(`docs/` を GitHub Pages の公開元に指定)
2. Settings → Secrets and variables → Actions に登録:

| Secret名 | 値 |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `BACKUP_EXPORT_SECRET` | 手順2で設定したものと同じ値 |
| `GOOGLE_OAUTH_CLIENT_ID` | 手順3-4 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 手順3-4 |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | 手順3-5 |

3. Actions タブで `Supabase Keep-Alive` と `Daily Backup to Google Drive` を「Run workflow」で手動実行して、緑になることを確認

### 5. 動作確認
- Driveの「adocs-goal-app-backup」に `adocs_data_日付.json` と `adocs_roster_日付.json` が別ファイルで保存されている
- Actions のログには件数だけが出て、名前は出ていない
- 権限のないアカウントでは名簿を出力できない / パスワードを間違えると出力できない
- 間違ったシークレットで `backup-export` を呼ぶと 401 が返る

## 運用上の注意

- **60日ルール:** GitHubの公開リポジトリは、60日間リポジトリに動き(コミットなど)がないと、定期実行が自動で無効になります。止まっていないか、Actions タブを月に1回は見てください(再開は「Enable workflow」)。止まったままでも、Supabaseの休止の警告メール(停止の約1週間前)が届くので、そこで気づけます。
- **Driveのフォルダ:** 名簿を含むので、共有しない・他の人に権限を渡さない。
- **バックアップの保存期間:** 日付つきのファイルが毎日増えます(自動削除はしていません)。
- **復元:** バックアップはJSONです。ただし、セラピストのログイン情報(Supabase Auth)は含まれないため、復元には手作業(セラピストIDの対応づけ)が必要です。復元手順はまだ作っていません。
- **研究終了後・不要になったとき:** GitHub Secrets の削除、`supabase secrets unset BACKUP_EXPORT_SECRET`、workflow の無効化、GoogleのOAuthクライアント(またはGCPプロジェクト)の削除、Driveのフォルダの削除。
