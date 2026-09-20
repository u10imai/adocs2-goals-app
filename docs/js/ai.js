// AI機能②: 工程分解支援。Gemini APIは Supabase Edge Function 経由(キーをブラウザに出さない)。
// 送るのは「目標の説明文」と「場所」だけ。氏名・写真などの個人情報は送らない。
import { CONFIG, DEMO } from './config.js';
import { getDb } from './db.js';

export const AI_UNAVAILABLE = '現在この機能は利用できません。手入力で進めてください。';

export async function decomposeSteps({ goalText, location }) {
  if (DEMO) {
    // デモモード: 実際のAIは呼ばず、動作確認用の仮案を返す
    await new Promise((r) => setTimeout(r, 600));
    return [
      { description: `${goalText}の準備をする(デモ用の仮案)` },
      { description: `${goalText}を始める` },
      { description: `${goalText}を続ける` },
      { description: `${goalText}を終えて片付ける` },
    ];
  }
  try {
    const { data, error } = await getDb().sb.functions.invoke(CONFIG.AI_FUNCTION_NAME, {
      body: { goal: goalText, location },
    });
    if (error || !Array.isArray(data?.steps) || !data.steps.length) throw error || new Error('empty');
    return data.steps.slice(0, 5).map((s) => ({ description: String(s.description || s).slice(0, 100) }));
  } catch (e) {
    console.warn('AI decompose failed', e);
    throw new Error(AI_UNAVAILABLE);
  }
}
