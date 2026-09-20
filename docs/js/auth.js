// セラピストのログイン。デモモードでは名前だけの簡易ログイン。
import { DEMO } from './config.js';
import { getDb } from './db.js';

const DEMO_USER_KEY = 'adocs_demo_user';

// therapist_account の行を保証して返す
async function toTherapist(u) {
  if (!u) return null;
  const db = getDb();
  let rows = await db.list('therapist_account', { id: u.id });
  if (!rows.length) {
    const row = { id: u.id, email: u.email, name: u.user_metadata?.name || u.email };
    await db.insert('therapist_account', row);
    rows = [row];
  }
  return rows[0];
}

export async function currentUser() {
  if (DEMO) {
    try { return JSON.parse(localStorage.getItem(DEMO_USER_KEY)); } catch { return null; }
  }
  const { data } = await getDb().sb.auth.getSession();
  return toTherapist(data.session?.user);
}

export async function demoLogin(name) {
  const u = { id: 'demo-therapist', email: 'demo@example.com', name: name || 'デモ用セラピスト' };
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(u));
  return u;
}

export async function signIn(email, password) {
  const { data, error } = await getDb().sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error('メールアドレスかパスワードが違います');
  return toTherapist(data.user);
}

export async function signUp(name, email, password) {
  const { data, error } = await getDb().sb.auth.signUp({ email, password, options: { data: { name } } });
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error('確認メールを送りました。メール内のリンクを開いてからログインしてください。');
  return toTherapist(data.user);
}

export async function signOut() {
  if (DEMO) { localStorage.removeItem(DEMO_USER_KEY); return; }
  await getDb().sb.auth.signOut();
}
