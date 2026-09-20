// AI機能①: 写真→イラスト化。処理はすべてブラウザ内。生の写真は端末の外に出さない。
// 【仮実装】本物のモデル(TensorFlow.js等)の選定は保留。今は「色数を減らして輪郭を強調する」だけの簡易フィルタ。
// canvasに描き直すのでEXIF(撮影位置など)は自動的に消える。
import { CONFIG } from './config.js';

const MAX = 400;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
    img.src = url;
  });
}

export async function photoToIllustration(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * src.data[i * 4] + 0.587 * src.data[i * 4 + 1] + 0.114 * src.data[i * 4 + 2];
  }
  const levels = 5;
  const step = 255 / (levels - 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Sobel で輪郭を検出
      let edge = 0;
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        const gx = -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
        const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
        edge = Math.hypot(gx, gy);
      }
      for (let c = 0; c < 3; c++) {
        const v = Math.round(src.data[i * 4 + c] / step) * step; // 色数を減らす
        out.data[i * 4 + c] = edge > 90 ? 40 : v;
      }
      out.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL('image/png');
}

// 変換後のイラストだけを保存する。Cloudinary未設定のデモモードでは dataURL のまま返す。
export async function saveIllustrationImage(dataUrl, { demo }) {
  if (!CONFIG.CLOUDINARY_CLOUD_NAME || !CONFIG.CLOUDINARY_UPLOAD_PRESET) {
    if (demo) return dataUrl;
    throw new Error('Cloudinaryの設定が未完了のため保存できません');
  }
  const form = new FormData();
  form.append('file', dataUrl);
  form.append('upload_preset', CONFIG.CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CONFIG.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('イラストの保存に失敗しました');
  const json = await res.json();
  return json.secure_url;
}
