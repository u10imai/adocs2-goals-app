// データ層。テーブル名は supabase/schema.sql と同じ。
// デモモード(localStorage)と Supabase を同じインターフェースで切り替える。
import { CONFIG, DEMO } from './config.js';

const LS_KEY = 'adocs_demo_db_v1';
let db = null;

export const getDb = () => db;

export async function initDb() {
  db = DEMO ? makeLocal() : await makeSupabase();
  return db;
}

function makeLocal() {
  const load = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
  };
  const save = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));
  const match = (row, f) => Object.entries(f || {}).every(([k, v]) => row[k] === v);
  return {
    mode: 'local',
    async list(table, filter) {
      return (load()[table] || []).filter((r) => match(r, filter));
    },
    async insert(table, rows) {
      const arr = [].concat(rows).map((r) => ({ created_at: new Date().toISOString(), ...r }));
      const d = load();
      d[table] = (d[table] || []).concat(arr);
      save(d);
      return arr;
    },
    async update(table, id, patch) {
      const d = load();
      d[table] = (d[table] || []).map((r) => (r.id === id ? { ...r, ...patch } : r));
      save(d);
    },
    async remove(table, filter) {
      const d = load();
      d[table] = (d[table] || []).filter((r) => !match(r, filter));
      save(d);
    },
    // 対象児IDの連番(本番=001〜、テスト=1001〜)。Supabaseでは next_child_code() が同じ役目
    async nextChildCode(isTest) {
      const nums = (load().child || []).filter((c) => !!c.is_test === isTest).map((c) => Number(c.child_code)).filter((n) => !Number.isNaN(n));
      if (isTest) return String(Math.max(1000, ...nums) + 1);
      const n = Math.max(0, ...nums) + 1;
      if (n > 999) throw new Error('本番IDの上限(999)に達しました');
      return String(n).padStart(3, '0');
    },
    // ---- 名簿(child_roster)。Supabaseでは専用の関数経由。デモではブラウザ内 ----
    async rosterSet(childId, name) {
      const d = load();
      d.child_roster = (d.child_roster || []).filter((r) => r.child_id !== childId).concat({ child_id: childId, name });
      save(d);
    },
    async rosterMine() { return load().child_roster || []; },
    async canExportRoster() { return true; },
    async rosterExport(password) {
      if (!password) throw new Error('パスワードを入れてください(デモモードでは内容は検証しません)');
      const d = load();
      return (d.child_roster || []).map((r) => {
        const c = (d.child || []).find((k) => k.id === r.child_id) || {};
        return { child_code: c.child_code, is_test: !!c.is_test, name: r.name, therapist: 'デモ用セラピスト', age: c.age ?? '', sex: c.sex ?? '' };
      });
    },
    reset() { localStorage.removeItem(LS_KEY); },
  };
}

async function makeSupabase() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  const check = ({ data, error }) => { if (error) throw error; return data; };
  return {
    mode: 'supabase',
    sb,
    async list(table, filter) {
      let q = sb.from(table).select('*');
      for (const [k, v] of Object.entries(filter || {})) q = q.eq(k, v);
      return check(await q);
    },
    async insert(table, rows) {
      return check(await sb.from(table).insert(rows).select());
    },
    async update(table, id, patch) {
      check(await sb.from(table).update(patch).eq('id', id));
    },
    async remove(table, filter) {
      check(await sb.from(table).delete().match(filter));
    },
    async nextChildCode(isTest) {
      return check(await sb.rpc('next_child_code', { p_test: isTest }));
    },
    // ---- 名簿(child_roster)。表は直接触れず、専用の関数だけを使う ----
    async rosterSet(childId, name) { check(await sb.rpc('roster_set', { p_child_id: childId, p_name: name })); },
    async rosterMine() { return check(await sb.rpc('roster_mine')); },
    async canExportRoster() { return check(await sb.rpc('roster_can_export')) === true; },
    // 全体の出力は Edge Function。権限の確認とパスワードの再確認はサーバー側で行う
    async rosterExport(password) {
      const { data, error } = await sb.functions.invoke('roster-export', { body: { password } });
      if (error || !Array.isArray(data?.rows)) throw new Error('パスワードが違うか、名簿を出力する権限がありません');
      return data.rows;
    },
  };
}
