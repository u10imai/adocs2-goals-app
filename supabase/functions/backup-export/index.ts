// 自動バックアップ用の全データ出力。GitHub Actions からだけ呼ばれる(固定の共有シークレットで認証)。
//   {"set":"data"}   ... 目標データ(名前を含まない)
//   {"set":"roster"} ... 名簿(ID ⇔ 名前)。目標データとは別のファイルとして保存するため、別々に取得する
// デプロイ: supabase functions deploy backup-export --no-verify-jwt   /   supabase secrets set BACKUP_EXPORT_SECRET=...
// ※ Deno/Supabase 上で未実行(この環境では検証できていない)。デプロイ後に動作確認すること。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 許可リスト方式: ここに書いた表だけを出す。名簿(child_roster)は 'roster' のときだけ別枠で出す
const DATA_TABLES = [
  'therapist_account', 'child', 'participant', 'session', 'session_participant', 'illustration_selection',
  'goal', 'policy_weight', 'goal_location', 'sub_step', 'tag', 'sub_step_tag', 'gold_example', 'custom_illustration',
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const sha256 = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
async function validSecret(provided: string | null): Promise<boolean> {
  const expected = Deno.env.get('BACKUP_EXPORT_SECRET');
  if (!expected || !provided) return false;
  const [a, b] = await Promise.all([sha256(provided), sha256(expected)]);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Supabaseは1回で1000行までしか返さないので、順番に取り切る
async function fetchAll(admin: ReturnType<typeof createClient>, table: string, orderBy = 'id') {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select('*').order(orderBy, { ascending: true }).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405);
  if (!(await validSecret(req.headers.get('X-Backup-Secret')))) return json({ ok: false }, 401);
  try {
    const { set } = await req.json();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const tables: Record<string, unknown[]> = {};
    if (set === 'data') {
      for (const t of DATA_TABLES) tables[t] = await fetchAll(admin, t);
    } else if (set === 'roster') {
      const [roster, children] = await Promise.all([fetchAll(admin, 'child_roster', 'child_id'), fetchAll(admin, 'child')]);
      const codeById = new Map(children.map((c) => [c.id as string, c]));
      tables.child_roster = roster.map((r) => {
        const c = codeById.get(r.child_id as string);
        return { child_id: r.child_id, child_code: c?.child_code ?? null, is_test: c?.is_test ?? null, name: r.name, updated_at: r.updated_at };
      });
    } else {
      return json({ ok: false }, 400);
    }
    return json({ ok: true, exported_at: new Date().toISOString(), tables });
  } catch (e) {
    console.error('backup-export failed:', String(e)); // 名前などの内容はログに出さない
    return json({ ok: false }, 500);
  }
});
