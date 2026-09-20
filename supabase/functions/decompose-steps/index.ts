// 工程分解AI(Gemini API)。Supabase Edge Function として配置する。
// デプロイ前に: supabase secrets set GEMINI_API_KEY=... (GEMINI_MODEL は任意。未指定なら下の既定値)
// 送られてくるのは「目標の説明文」と「場所」だけ。個人情報は受け取らない設計。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'; // 保留: 実際に使うモデル名は要確認
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// 文字2-gramのJaccard類似度(簡易。精度が足りなければ埋め込み検索に差し替える: 保留)
const grams = (s: string) => {
  const t = s.replace(/\s/g, '');
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
};
const similarity = (a: string, b: string) => {
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { goal, location } = await req.json();
    const goalText = String(goal ?? '').trim().slice(0, 100);
    if (!goalText) return json({ error: 'goal is required' }, 400);

    // ログイン中セラピストの権限でお手本を読む(RLSが効く)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: golds } = await supabase.from('gold_example').select('goal_description, sub_steps_json');
    const examples = (golds ?? [])
      .map((g) => ({ ...g, score: similarity(goalText, g.goal_description) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const shots = examples
      .map((e, i) => `【お手本${i + 1}】\n目標: ${e.goal_description}\n工程:\n${
        (e.sub_steps_json as { order: number; description: string }[]).map((s) => `${s.order}. ${s.description}`).join('\n')
      }`)
      .join('\n\n');

    const prompt = [
      'あなたは作業療法士を支援するアシスタントです。子どもの生活上の目標を、時系列の動作(工程)に分解して案を出します。',
      '- 工程は最大5つ。細かく分けすぎない。',
      '- 各工程は「〜する」で終わる短い日本語1文。',
      '- 医療的な断定や、個人を特定する内容は書かない。',
      shots ? `\n以下のお手本と同じ粒度・文体で答えてください。\n\n${shots}` : '',
      `\n【今回の目標】${goalText}${location ? `(場所: ${String(location).slice(0, 20)})` : ''}`,
    ].join('\n');

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') ?? '' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              steps: { type: 'ARRAY', maxItems: 5, items: { type: 'OBJECT', properties: { description: { type: 'STRING' } }, required: ['description'] } },
            },
            required: ['steps'],
          },
        },
      }),
    });
    if (!res.ok) return json({ error: 'upstream error' }, 502);
    const out = await res.json();
    const text = out?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = JSON.parse(text);
    return json({ steps: (parsed.steps ?? []).slice(0, 5) });
  } catch (_e) {
    return json({ error: 'failed' }, 500);
  }
});
