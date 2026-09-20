// マスタ類(設計まとめ 7章・8章)
export const STEP_TITLES = [
  'ログイン', '基本情報', '基本方針(仮)', '目標選択・絞り込み', '優先順位・場所',
  '基本方針(確定)', '工程・工夫づくり', '振り返り日', '計画書出力',
];

// 基本方針スライダーの値(-4〜+4。内部は-5〜+5の整数で保存)を、合計10の割合にして見せる。0のとき 5:5
export const axisShares = (v) => {
  const x = Math.max(-4, Math.min(4, Number(v) || 0));
  return { left: 5 - x, right: 5 + x };
};

// 調整カテゴリ(3分類・固定)。icon は絵文字の仮置き(アイコンライブラリ選定は保留)
export const CATEGORIES = [
  { key: 'tool_env', label: '道具・周囲の環境を変更する', short: '道具・環境', icon: '🔧', color: '#d98a1f' },
  { key: 'support_cue', label: '支援方法・言葉かけの方法を変更する', short: '支援・声かけ', icon: '💬', color: '#3d86c6' },
  { key: 'activity_form', label: '活動自体の形式・規模を変更する', short: '活動の形式・規模', icon: '➡️', color: '#4c9a5e' },
];
export const catOf = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[0];

export const INITIAL_TAGS = {
  tool_env: ['補助具を使う', '道具の形状・素材を変える', '配置を変える', '照明・音を調整する', '実施場所を変える'],
  support_cue: ['支援量を増減する', '支援のタイミングを変える', '声かけの量を増減する', '視覚的な手がかりを使う(絵カード・タイマー)', '支援者を変える'],
  activity_form: ['手順を増減する', '取り組む量・回数を増減する', '実施する姿勢・体勢を変える', '別の活動に置き換える', '目標水準を調整する'],
};

export const GOLD_EXAMPLE_SEED = [{
  goal_description: '食事動作(自分で食事を食べる)',
  sub_steps_json: [
    { order: 1, description: '今日の食事を認識する' },
    { order: 2, description: '食具を手に取る' },
    { order: 3, description: '食具から食事に向かって手を伸ばす' },
    { order: 4, description: '食事をすくう' },
    { order: 5, description: '口元に持ってきて口に取り込んで食べる' },
  ],
}];

// 実施する場所。カレンダーの「1日を4つに分けた印」にも同じ4つを使う
export const LOCATIONS = [
  { key: '学校', icon: '🏫', color: '#7fb3e6' },
  { key: '家', icon: '🏠', color: '#f4a261' },
  { key: '放課後等デイ', icon: '🚌', color: '#7cc9a0' },
  { key: 'その他', icon: '📍', color: '#b39ddb' },
];

// ターン順のデフォルト: 本人 → 保護者 → 支援者(8章)
export const ROLE_OPTIONS = ['本人', '保護者', '支援者1', '支援者2'];
export const DEFAULT_ROLES = ['本人', '保護者', '支援者1'];
export const roleRank = (role) => {
  const i = ROLE_OPTIONS.indexOf(role);
  return i === -1 ? 99 : i;
};
export const roleIcon = (role) => (role === '本人' ? '🧒' : role.startsWith('保護者') ? '👪' : '🧑‍⚕️');

// 聞き方の例文(8章・Easy)。文言は仮(保留事項に記載)
export const ASK_EXAMPLES = {
  本人: ['どれが すき? どれを がんばりたい?', 'やってみたいなって おもうのは どれかな?', 'どれが たのしそう?'],
  保護者: ['お子さんに できるようになってほしいこと、生活の中で気になっていることはどれですか?', 'お子さんが好きそうだと思うものはどれですか?'],
  支援者: ['関わっている中で、伸ばしたい・大切だと感じる場面はどれですか?', '本人の強みが活かせそうなものはどれですか?'],
};
export const askExamplesFor = (role) => (role === '本人' ? ASK_EXAMPLES.本人 : role.startsWith('保護者') ? ASK_EXAMPLES.保護者 : ASK_EXAMPLES.支援者);

export const STAMPS = ['いいね!', 'すてき!', 'やったね!', 'それだ!', 'ばっちり!'];
