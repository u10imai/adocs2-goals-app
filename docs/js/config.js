// 接続設定。SUPABASE_URL が空の間は「デモモード」(ブラウザ内保存)で動く。
// anon key は公開されても良い設計(データ保護は Supabase 側の RLS で行う)。service_role キーは絶対に書かない。
export const CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  // 写真→イラスト化した画像の保存先(Cloudinary の unsigned upload preset)
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_UPLOAD_PRESET: '',

  // 工程分解AI(Supabase Edge Function 名)
  AI_FUNCTION_NAME: 'decompose-steps',
};

export const DEMO = !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY;
