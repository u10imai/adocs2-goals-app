// 名簿(ID ⇔ 実名)の一括出力。権限のあるセラピストだけが、パスワードを入れ直したときにだけ使える。
//   1. ログイン中のユーザーを確認(JWT)
//   2. roster_export_permission に登録されているか確認(オーナーがSQLで付与)
//   3. パスワードを、その場でもう一度確認(自動更新されたログイン状態だけでは通らない)
//   4. service_role で名簿を読み、JSONで返す(画面側でExcelにする)
// ※ Deno/Supabase 上で未実行(この環境では検証できていない)。デプロイ後に動作確認すること。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const { password } = await req.json();
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. 誰が呼んだか
    const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user?.email) return json({ error: 'unauthorized' }, 401);

    // 2. 出力の権限があるか
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: perm } = await admin.from('roster_export_permission').select('therapist_id').eq('therapist_id', user.id).maybeSingle();
    if (!perm) return json({ error: 'forbidden' }, 403);

    // 3. パスワードの再確認(セッションは保存しない。試行回数はSupabase Authのレート制限に従う)
    const verifier = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: pwErr } = await verifier.auth.signInWithPassword({ email: user.email, password: String(password ?? '') });
    if (pwErr) return json({ error: 'wrong_password' }, 401);

    // 4. 名簿を読んで返す
    const [{ data: roster, error: e1 }, { data: children, error: e2 }, { data: therapists, error: e3 }] = await Promise.all([
      admin.from('child_roster').select('child_id, name'),
      admin.from('child').select('id, child_code, is_test, age, sex, therapist_id'),
      admin.from('therapist_account').select('id, name'),
    ]);
    if (e1 || e2 || e3) throw e1 || e2 || e3;
    const childById = new Map((children ?? []).map((c) => [c.id, c]));
    const therapistById = new Map((therapists ?? []).map((t) => [t.id, t.name]));
    const rows = (roster ?? []).map((r) => {
      const c = childById.get(r.child_id);
      return {
        child_code: c?.child_code ?? '', is_test: !!c?.is_test, name: r.name,
        therapist: therapistById.get(c?.therapist_id) ?? '', age: c?.age ?? '', sex: c?.sex ?? '',
      };
    });
    return json({ rows });
  } catch (_e) {
    return json({ error: 'failed' }, 500);
  }
});
