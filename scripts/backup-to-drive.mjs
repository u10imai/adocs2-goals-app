// GitHub Actions から毎日実行される。Supabase の Edge Function から全データを取得し、Google Drive に保存する。
//   adocs_data_YYYY-MM-DD.json   ... 目標データ(名前を含まない)
//   adocs_roster_YYYY-MM-DD.json ... 名簿(ID ⇔ 名前)。目標データとは別のファイル
// ログには件数だけを出し、中身(名前など)は出さない。
// Drive の許可範囲は drive.file(このアプリが作ったファイル・フォルダだけ)。トークンが漏れても Drive 全体には及ばない。
//
// 動作確認用: BACKUP_DRY_RUN=1 と BACKUP_DRY_RUN_DIR=<出力先> を付けると、Drive には送らずフォルダに書き出す。
import { google } from 'googleapis';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';

const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`環境変数 ${k} が設定されていません`); process.exit(1); }
  return v;
};

const DRY = process.env.BACKUP_DRY_RUN === '1';
const base = need('FUNCTIONS_BASE_URL');
const secret = need('BACKUP_EXPORT_SECRET');
const FOLDER_NAME = process.env.GDRIVE_FOLDER_NAME || 'adocs-goal-app-backup';
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 日本時間の日付

async function exportSet(set) {
  const res = await fetch(`${base}/backup-export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Backup-Secret': secret },
    body: JSON.stringify({ set }),
  });
  if (!res.ok) throw new Error(`backup-export(${set}) が失敗しました: HTTP ${res.status}`); // 本文は出さない
  const body = await res.json();
  if (!body?.ok || typeof body.tables !== 'object') throw new Error(`backup-export(${set}) の応答が想定と違います`);
  return body;
}

const counts = (body) => Object.entries(body.tables).map(([t, rows]) => `${t}=${rows.length}`).join(' ');

async function driveFolder(drive) {
  const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' });
  if (found.data.files?.length) return found.data.files[0].id;
  const created = await drive.files.create({ requestBody: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
  console.log(`Driveにフォルダ「${FOLDER_NAME}」を作成しました`);
  return created.data.id;
}

const files = [];
for (const [set, name] of [['data', `adocs_data_${today}.json`], ['roster', `adocs_roster_${today}.json`]]) {
  const body = await exportSet(set);
  console.log(`${name}: ${counts(body)}`);
  files.push({ name, text: JSON.stringify(body, null, 1) });
}

if (DRY) {
  const dir = need('BACKUP_DRY_RUN_DIR');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(dir, f.name), f.text);
  console.log(`(DRY RUN) ${dir} に書き出しました`);
} else {
  const auth = new google.auth.OAuth2(need('GOOGLE_OAUTH_CLIENT_ID'), need('GOOGLE_OAUTH_CLIENT_SECRET'));
  auth.setCredentials({ refresh_token: need('GOOGLE_OAUTH_REFRESH_TOKEN') });
  const drive = google.drive({ version: 'v3', auth });
  const folderId = await driveFolder(drive);
  for (const f of files) {
    await drive.files.create({
      requestBody: { name: f.name, parents: [folderId] },
      media: { mimeType: 'application/json', body: Readable.from([f.text]) },
      fields: 'id',
    });
    console.log(`Driveに保存しました: ${f.name}`);
  }
}
