// イラスト素材の【仮置き】。実際は Cloudinary 上のADOC-Sイラストを参照する(読み込み方法は保留)。
// 今は絵文字+色のプレースホルダーで表示する。
// illustration_ref の形式: 'builtin:<id>' = この一覧 / 'custom:<id>' = 写真から作った独自イラスト
export const ILLUSTRATION_CATEGORIES = ['身の回り', '学習・学校', '遊び・余暇', '手伝い・社会'];

const PALETTE = ['#ffe3d6', '#dff1e6', '#dbe9fb', '#fff1c7', '#eadcf7', '#ffdce5'];

const RAW = [
  ['eat', '食事', '🍚', '身の回り'],
  ['dress', '着替え', '👕', '身の回り'],
  ['brush', '歯みがき', '🪥', '身の回り'],
  ['toilet', 'トイレ', '🚽', '身の回り'],
  ['wash', '手洗い', '🧼', '身の回り'],
  ['bath', 'おふろ', '🛁', '身の回り'],
  ['sleep', 'ねる準備', '🛏️', '身の回り'],
  ['go_school', '登校', '🎒', '学習・学校'],
  ['class', '授業に参加', '📚', '学習・学校'],
  ['homework', '宿題', '✏️', '学習・学校'],
  ['write', '字を書く', '📝', '学習・学校'],
  ['read', '本を読む', '📖', '学習・学校'],
  ['presentation', '発表', '🎤', '学習・学校'],
  ['school_lunch', '給食', '🍱', '学習・学校'],
  ['craft', '工作', '✂️', '遊び・余暇'],
  ['draw', 'お絵かき', '🎨', '遊び・余暇'],
  ['music', '音楽・楽器', '🎹', '遊び・余暇'],
  ['ball', 'ボール遊び', '⚽', '遊び・余暇'],
  ['rope', 'なわとび', '🪢', '遊び・余暇'],
  ['bike', '自転車', '🚲', '遊び・余暇'],
  ['pool', 'プール', '🏊', '遊び・余暇'],
  ['game', 'ゲーム', '🎮', '遊び・余暇'],
  ['friends', '友だちと遊ぶ', '🧑‍🤝‍🧑', '遊び・余暇'],
  ['walk', 'おさんぽ', '🚶', '遊び・余暇'],
  ['greet', 'あいさつ', '👋', '手伝い・社会'],
  ['cook', 'お料理', '🍳', '手伝い・社会'],
  ['clean', 'そうじ', '🧹', '手伝い・社会'],
  ['tidy', 'かたづけ', '🧺', '手伝い・社会'],
  ['shopping', 'おかいもの', '🛒', '手伝い・社会'],
  ['pet', 'せわ(生き物・植物)', '🐶', '手伝い・社会'],
];

export const BUILTIN_ILLUSTRATIONS = RAW.map(([id, label, emoji, category], i) => ({
  ref: `builtin:${id}`, label, emoji, category, color: PALETTE[i % PALETTE.length],
}));

// ref から表示情報を得る。custom は store 側の一覧(customs)から引く
export function illustInfo(ref, customs = []) {
  if (!ref) return { label: '(未選択)', emoji: '❔', color: '#eee' };
  if (ref.startsWith('custom:')) {
    const c = customs.find((x) => `custom:${x.id}` === ref);
    return c
      ? { label: c.label, image: c.image_url, emoji: '🖼️', color: '#eee', category: 'オリジナル' }
      : { label: '(オリジナル)', emoji: '🖼️', color: '#eee', category: 'オリジナル' };
  }
  return BUILTIN_ILLUSTRATIONS.find((x) => x.ref === ref) || { label: ref, emoji: '❔', color: '#eee' };
}
