// 休止対策のping受け口。GitHub Actions が毎日2回呼ぶ。
// 無料プランは「ユーザーによるDBへのリクエスト」がないと1週間で休止するため、実際にDBを1回読む(中身は返さない)。
// デプロイ: supabase functions deploy health-check --no-verify-jwt   (ログイン不要で呼べるようにする)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { error } = await admin.from('tag').select('id', { count: 'exact', head: true });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, checked_at: new Date().toISOString() }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('health-check failed:', String(e));
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
