// アプリの状態と操作。画面(components/)はここを呼ぶだけにする。
// 書き込みは「メモリ上のstate更新 + DBへ即保存」。IDはクライアントで採番する。
import { reactive, computed } from 'vue';
import { DEMO } from './config.js';
import { initDb, getDb } from './db.js';
import * as auth from './auth.js';
import { INITIAL_TAGS, GOLD_EXAMPLE_SEED, DEFAULT_ROLES, roleRank } from './data/master.js';
import { illustInfo } from './data/illustrations.js';
import { exportRosterXlsx } from './excel.js';

const uuid = () => crypto.randomUUID();
const db = () => getDb();

export const MAX_GOALS = 3;
export const MAX_STEPS = 5;

const freshDraft = () => ({
  roles: [...DEFAULT_ROLES], customRole: '', months: 6, customMonths: false,
  policy: { safety: 0, pace: 0 },
  goalDraft: [], // [{ ref, locs: ['学校', ...] }] 優先順位順
  reviewDate: '', // 最後の振り返り日(必須)
  midDate: '',    // 中間確認日(1つだけ・任意)
});

export const state = reactive({
  ready: false, busy: false, error: '', isDemo: DEMO,
  user: null, children: [], child: null,
  practice: [],        // やった日の記録(practice_log)
  latestSession: {},   // child_id -> その対象児の最新の回(カレンダーを開くため)
  calendarView: false, // true の間は、目標づくりの流れではなくカレンダーだけを表示
  roster: {}, // child_id -> 名前(自分の担当分だけ。名簿は目標データとは別テーブル)
  canExportRoster: false,
  step: 0, maxStep: 0,
  participants: [], session: null, sessionParticipants: [], selections: [],
  goals: [], goalLocations: [], subSteps: [], subStepTags: [], policy: null,
  tags: [], customIllustrations: [],
  draft: freshDraft(),
  activeSpId: null, // ステップ3で今操作している参加者(session_participant.id)
  activeUnit: null, // ステップ7で編集中の作業単位 key
  completedUnits: {},
});

/* ---------- 起動・ログイン ---------- */

export async function init() {
  try {
    await initDb();
    state.user = await auth.currentUser();
    if (state.user) await afterLogin();
  } catch (e) {
    state.error = `起動に失敗しました: ${e.message}`;
  }
  state.ready = true;
}

async function afterLogin() {
  await loadTags();
  await loadCustomIllustrations();
  state.children = await db().list('child', { therapist_id: state.user.id });
  const mine = new Set(state.children.map((c) => c.id));
  state.latestSession = {};
  for (const s of (await db().list('session')).filter((x) => mine.has(x.child_id)).sort((a, b) => a.held_at.localeCompare(b.held_at))) {
    state.latestSession[s.child_id] = s;
  }
  const names = await db().rosterMine();
  state.roster = Object.fromEntries(names.map((r) => [r.child_id, r.name]));
  state.canExportRoster = await db().canExportRoster().catch(() => false);
}

export const nameOf = (childId) => state.roster[childId] || '';

// 名簿の一括出力(権限者のみ。パスワードの再確認つき)
export const exportRoster = (password) => run(async () => {
  const rows = await db().rosterExport(password);
  await exportRosterXlsx(rows);
  return true;
});

export async function run(fn) {
  state.busy = true; state.error = '';
  try { return await fn(); } catch (e) { state.error = e.message || String(e); } finally { state.busy = false; }
}

export const login = (email, pw) => run(async () => { state.user = await auth.signIn(email, pw); await afterLogin(); });
export const register = (name, email, pw) => run(async () => { state.user = await auth.signUp(name, email, pw); await afterLogin(); });
export const demoLogin = (name) => run(async () => { state.user = await auth.demoLogin(name); await afterLogin(); });
export async function logout() {
  await auth.signOut();
  resetSession();
  Object.assign(state, { user: null, child: null, children: [], roster: {}, canExportRoster: false, latestSession: {}, calendarView: false, step: 0, maxStep: 0 });
}

/* ---------- マスタ(タグ・お手本・独自イラスト) ---------- */

async function loadTags() {
  let tags = await db().list('tag');
  if (!tags.length && DEMO) {
    const rows = Object.entries(INITIAL_TAGS).flatMap(([category, list]) => list.map((description) => ({ id: uuid(), category, description })));
    tags = await db().insert('tag', rows);
    await db().insert('gold_example', GOLD_EXAMPLE_SEED.map((g) => ({ id: uuid(), ...g })));
  }
  state.tags = tags;
}

async function loadCustomIllustrations() {
  state.customIllustrations = await db().list('custom_illustration', { therapist_id: state.user.id });
}

export async function createTag(category, description) {
  const d = description.trim();
  if (!d) return null;
  const dup = state.tags.find((t) => t.category === category && t.description === d);
  if (dup) return dup;
  const row = { id: uuid(), category, description: d };
  await db().insert('tag', row);
  state.tags.push(row);
  return row;
}

export async function addCustomIllustration(label, imageUrl) {
  const row = { id: uuid(), therapist_id: state.user.id, label: label.trim() || 'オリジナル', image_url: imageUrl };
  await db().insert('custom_illustration', row);
  state.customIllustrations.push(row);
  return `custom:${row.id}`;
}

export const info = (ref) => illustInfo(ref, state.customIllustrations);

/* ---------- 対象児 ---------- */

export function resetSession() {
  Object.assign(state, {
    participants: [], session: null, sessionParticipants: [], selections: [],
    goals: [], goalLocations: [], subSteps: [], subStepTags: [], policy: null, practice: [],
    draft: freshDraft(), activeSpId: null, activeUnit: null, completedUnits: {}, maxStep: 0,
  });
}

export async function pickChild(child) {
  resetSession();
  state.child = child;
  state.participants = await db().list('participant', { child_id: child.id });
  go(1);
}

// 対象児ID(本番=001〜、テスト=1001〜)はDBが連番で振る。実名は保存しない
// 名前は必須(フルネームでもイニシャルでも可)。名簿テーブルに分けて保存する
export const createChild = ({ name, age, sex, isTest }) => run(async () => {
  const n = (name || '').trim();
  if (!n) throw new Error('名前を入れてください(フルネームでもイニシャルでもOK)');
  const code = await db().nextChildCode(!!isTest);
  const row = { id: uuid(), therapist_id: state.user.id, child_code: code, is_test: !!isTest, age: age === '' || age == null ? null : Number(age), sex: sex || null };
  await db().insert('child', row);
  try {
    await db().rosterSet(row.id, n);
  } catch (e) {
    await db().remove('child', { id: row.id }); // 名前のない対象児を残さない
    throw new Error('名前の保存に失敗しました。もう一度お試しください');
  }
  state.roster[row.id] = n;
  state.children.push(row);
  await pickChild(row);
});

/* ---------- 画面遷移 ---------- */

const hasMultiLocation = () => state.goals.some((g) => state.goalLocations.filter((l) => l.goal_id === g.id).length > 1);

export function go(n) {
  state.step = n;
  state.maxStep = Math.max(state.maxStep, n);
  state.error = '';
  state.activeUnit = null;
  if (n === 3 && !state.activeSpId) state.activeSpId = firstPendingSpId();
  if (n === 4) initGoalDraft();
  if (n === 5 && state.policy) state.draft.policy = { safety: state.policy.safety_challenge_axis, pace: state.policy.pace_axis };
  if (n === 8 && !state.draft.reviewDate) state.draft.reviewDate = state.session.next_review_date || defaultReviewDate();
}

export function prev() {
  let n = state.step - 1;
  if (n === 6 && !hasMultiLocation()) n = 5;
  go(Math.max(n, 1));
}

export function next() {
  return run(async () => {
    const s = state.step;
    if (s === 1) await saveBasics();
    if (s === 2) await savePolicy('before_goal');
    if (s === 4) await saveGoals();
    if (s === 5) await savePolicy('after_goal');
    if (s === 8) await saveReviewDate();
    let n = s + 1;
    if (n === 6 && !hasMultiLocation()) n = 7;
    go(n);
  });
}

export const skipPolicy = () => go(3);

export const canNext = computed(() => {
  const d = state.draft;
  switch (state.step) {
    case 1: return d.roles.length >= 1 && Number(d.months) >= 1;
    case 3: return state.sessionParticipants.length > 0 && state.sessionParticipants.every((sp) => sp.turn_status !== 'pending');
    case 4: return d.goalDraft.length >= 1 && d.goalDraft.every((g) => g.locs.length >= 1);
    case 7: return !state.activeUnit && unitList.value.length > 0 && unitList.value.every((u) => state.completedUnits[u.key]);
    case 8: return !!d.reviewDate;
    default: return true;
  }
});

/* ---------- ステップ1: 基本情報 ---------- */

export const sortedSps = computed(() => [...state.sessionParticipants].sort((a, b) => a.turn_order - b.turn_order));
export const roleOfPid = (pid) => state.participants.find((p) => p.id === pid)?.role || '';

async function saveBasics() {
  const d = state.draft;
  const months = Number(d.months);
  const roles = [...d.roles].sort((a, b) => roleRank(a) - roleRank(b));

  for (const role of roles) {
    if (!state.participants.find((p) => p.role === role)) {
      const p = { id: uuid(), child_id: state.child.id, role };
      await db().insert('participant', p);
      state.participants.push(p);
    }
  }
  if (!state.session) {
    const row = { id: uuid(), child_id: state.child.id, duration_months: months, held_at: new Date().toISOString(), next_review_date: null };
    await db().insert('session', row);
    state.session = row;
    state.latestSession[state.child.id] = row;
  } else {
    state.session.duration_months = months;
    await db().update('session', state.session.id, { duration_months: months });
  }

  const wantPids = roles.map((r) => state.participants.find((p) => p.role === r).id);
  // 外れた参加者は、その回の選択ごと消す
  for (const sp of [...state.sessionParticipants]) {
    if (!wantPids.includes(sp.participant_id)) {
      await db().remove('illustration_selection', { session_id: state.session.id, participant_id: sp.participant_id });
      await db().remove('session_participant', { id: sp.id });
      state.selections = state.selections.filter((x) => x.participant_id !== sp.participant_id);
      state.sessionParticipants = state.sessionParticipants.filter((x) => x.id !== sp.id);
    }
  }
  for (const [i, pid] of wantPids.entries()) {
    const sp = state.sessionParticipants.find((x) => x.participant_id === pid);
    if (!sp) {
      const row = { id: uuid(), session_id: state.session.id, participant_id: pid, turn_order: i + 1, turn_status: 'pending' };
      await db().insert('session_participant', row);
      state.sessionParticipants.push(row);
    } else if (sp.turn_order !== i + 1) {
      sp.turn_order = i + 1;
      await db().update('session_participant', sp.id, { turn_order: i + 1 });
    }
  }
  state.activeSpId = firstPendingSpId();
}

export function addCustomRole() {
  const r = state.draft.customRole.trim();
  if (r && !state.draft.roles.includes(r)) state.draft.roles.push(r);
  state.draft.customRole = '';
}

/* ---------- ステップ2・5: 基本方針 ---------- */

async function savePolicy(timing) {
  const { safety, pace } = state.draft.policy;
  if (state.policy) {
    state.policy.safety_challenge_axis = Number(safety);
    state.policy.pace_axis = Number(pace);
    await db().update('policy_weight', state.policy.id, { safety_challenge_axis: Number(safety), pace_axis: Number(pace) });
  } else {
    const row = {
      id: uuid(), session_id: state.session.id, safety_challenge_axis: Number(safety), pace_axis: Number(pace),
      decided_timing: timing, decided_at: new Date().toISOString(),
    };
    await db().insert('policy_weight', row);
    state.policy = row;
  }
}

/* ---------- ステップ3: 目標選択(ターン制) ---------- */

const firstPendingSpId = () => sortedSps.value.find((sp) => sp.turn_status === 'pending')?.id || null;

export const currentTurn = computed(() => {
  const sp = state.sessionParticipants.find((x) => x.id === state.activeSpId);
  return sp ? { sp, role: roleOfPid(sp.participant_id), pid: sp.participant_id } : null;
});

export const selectionsOf = (pid) => state.selections.filter((x) => x.participant_id === pid);

export async function toggleSelection(pid, ref) {
  const existing = state.selections.find((x) => x.participant_id === pid && x.illustration_ref === ref);
  if (existing) {
    await db().remove('illustration_selection', { id: existing.id });
    state.selections = state.selections.filter((x) => x.id !== existing.id);
    return 'removed';
  }
  if (selectionsOf(pid).length >= MAX_GOALS) return 'max';
  const row = { id: uuid(), session_id: state.session.id, participant_id: pid, illustration_ref: ref, selected_at: new Date().toISOString(), reason: '' };
  await db().insert('illustration_selection', row);
  state.selections.push(row);
  return 'added';
}

export const saveReason = (sel) => db().update('illustration_selection', sel.id, { reason: sel.reason });

export async function finishTurn(status) {
  const t = currentTurn.value;
  if (!t) return;
  const st = status || (selectionsOf(t.pid).length ? 'selected' : 'skipped');
  t.sp.turn_status = st;
  await db().update('session_participant', t.sp.id, { turn_status: st });
  const nxt = sortedSps.value.find((sp) => sp.turn_status === 'pending' && sp.turn_order > t.sp.turn_order) || sortedSps.value.find((sp) => sp.turn_status === 'pending');
  state.activeSpId = nxt?.id || null;
}

export async function reopenTurn(spId) {
  const sp = state.sessionParticipants.find((x) => x.id === spId);
  if (!sp) return;
  if (sp.turn_status !== 'pending') {
    sp.turn_status = 'pending';
    await db().update('session_participant', sp.id, { turn_status: 'pending' });
  }
  state.activeSpId = sp.id;
}

/* ---------- ステップ4: 絞り込み + 場所 ---------- */

// 選ばれたイラスト一覧。誰が選んだかを付ける(本人が先頭)
export const candidates = computed(() => {
  const map = new Map();
  for (const sel of state.selections) {
    if (!map.has(sel.illustration_ref)) map.set(sel.illustration_ref, []);
    map.get(sel.illustration_ref).push(sel);
  }
  return [...map.entries()].map(([ref, sels]) => ({
    ref,
    pickers: sels
      .map((s) => ({ role: roleOfPid(s.participant_id), reason: s.reason }))
      .sort((a, b) => roleRank(a.role) - roleRank(b.role)),
  }));
});

function initGoalDraft() {
  const refs = new Set(candidates.value.map((c) => c.ref));
  const fromGoals = [...state.goals].sort((a, b) => a.priority - b.priority).map((g) => ({
    ref: g.illustration_ref,
    locs: state.goalLocations.filter((l) => l.goal_id === g.id).map((l) => l.location_category),
  }));
  const base = state.draft.goalDraft.length ? state.draft.goalDraft : fromGoals;
  state.draft.goalDraft = base.filter((g) => refs.has(g.ref));
}

export function toggleGoalDraft(ref) {
  const gd = state.draft.goalDraft;
  const i = gd.findIndex((g) => g.ref === ref);
  if (i >= 0) { gd.splice(i, 1); return true; }
  if (gd.length >= MAX_GOALS) return false;
  gd.push({ ref, locs: [] });
  return true;
}

export function moveGoalDraft(i, dir) {
  const gd = state.draft.goalDraft;
  const j = i + dir;
  if (j < 0 || j >= gd.length) return;
  [gd[i], gd[j]] = [gd[j], gd[i]];
}

export function toggleLoc(g, loc) {
  const i = g.locs.indexOf(loc);
  if (i >= 0) g.locs.splice(i, 1); else g.locs.push(loc);
}

async function removeGoalLocation(loc) {
  for (const s of state.subSteps.filter((x) => x.goal_location_id === loc.id)) await removeSubStep(s, false);
  await db().remove('goal_location', { id: loc.id });
  state.goalLocations = state.goalLocations.filter((x) => x.id !== loc.id);
}

// ドラフトとDBの差分だけ反映する(下流の工程を不用意に消さないため)
async function saveGoals() {
  const draft = state.draft.goalDraft;
  for (const g of [...state.goals]) {
    if (!draft.find((d) => d.ref === g.illustration_ref)) {
      for (const loc of state.goalLocations.filter((l) => l.goal_id === g.id)) await removeGoalLocation(loc);
      await db().remove('goal', { id: g.id });
      state.goals = state.goals.filter((x) => x.id !== g.id);
    }
  }
  for (const [i, d] of draft.entries()) {
    let g = state.goals.find((x) => x.illustration_ref === d.ref);
    if (!g) {
      g = { id: uuid(), session_id: state.session.id, illustration_ref: d.ref, priority: i + 1 };
      await db().insert('goal', g);
      state.goals.push(g);
    } else if (g.priority !== i + 1) {
      g.priority = i + 1;
      await db().update('goal', g.id, { priority: i + 1 });
    }
    const locs = state.goalLocations.filter((l) => l.goal_id === g.id);
    for (const l of locs) if (!d.locs.includes(l.location_category)) await removeGoalLocation(l);
    for (const cat of d.locs) {
      if (!locs.find((l) => l.location_category === cat)) {
        const row = { id: uuid(), goal_id: g.id, location_category: cat, strategy_mode: 'shared' };
        await db().insert('goal_location', row);
        state.goalLocations.push(row);
      }
    }
    // 場所が1つに減った場合は共通扱いに戻す
    const now = state.goalLocations.filter((l) => l.goal_id === g.id);
    if (now.length === 1 && now[0].strategy_mode !== 'shared') {
      now[0].strategy_mode = 'shared';
      await db().update('goal_location', now[0].id, { strategy_mode: 'shared' });
    }
  }
  state.completedUnits = {};
}

/* ---------- ステップ6: 戦略モード ---------- */

export const goalsSorted = computed(() => [...state.goals].sort((a, b) => a.priority - b.priority));
export const locsOf = (goalId) => state.goalLocations.filter((l) => l.goal_id === goalId);
export const multiLocGoals = computed(() => goalsSorted.value.filter((g) => locsOf(g.id).length > 1));

export async function setStrategyMode(goalId, mode) {
  for (const l of locsOf(goalId)) {
    l.strategy_mode = mode;
    await db().update('goal_location', l.id, { strategy_mode: mode });
  }
  state.completedUnits = {};
}

/* ---------- ステップ7: 工程分解 + 調整戦略タグ ---------- */

// 作業単位: 「共通」なら目標1つ=1単位、「場所ごと」なら 目標×場所 = 1単位
export const unitList = computed(() => {
  const out = [];
  for (const g of goalsSorted.value) {
    const locs = locsOf(g.id);
    if (!locs.length) continue;
    if (locs.length === 1 || locs[0].strategy_mode === 'shared') {
      out.push({ key: g.id, goal: g, loc: locs[0], locs, shared: locs.length > 1, label: locs.map((l) => l.location_category).join('・') });
    } else {
      for (const l of locs) out.push({ key: l.id, goal: g, loc: l, locs: [l], shared: false, label: l.location_category });
    }
  }
  return out;
});

export const stepsOf = (locId) => state.subSteps.filter((s) => s.goal_location_id === locId).sort((a, b) => a.step_order - b.step_order);
export const tagLinksOf = (stepId) => state.subStepTags
  .filter((l) => l.sub_step_id === stepId)
  .map((link) => ({ link, tag: state.tags.find((t) => t.id === link.tag_id) }))
  .filter((x) => x.tag);

export async function addStep(locId, description = '') {
  const steps = stepsOf(locId);
  if (steps.length >= MAX_STEPS) return null;
  const row = { id: uuid(), goal_location_id: locId, step_order: steps.length + 1, description, difficulty_score: 5 };
  await db().insert('sub_step', row);
  state.subSteps.push(row);
  return row;
}

export const saveStep = (s) => db().update('sub_step', s.id, { description: s.description, difficulty_score: Number(s.difficulty_score) });

async function removeSubStep(s, renumber = true) {
  await db().remove('sub_step_tag', { sub_step_id: s.id });
  state.subStepTags = state.subStepTags.filter((l) => l.sub_step_id !== s.id);
  await db().remove('sub_step', { id: s.id });
  state.subSteps = state.subSteps.filter((x) => x.id !== s.id);
  if (renumber) await renumber_(s.goal_location_id);
}

export const deleteStep = (s) => removeSubStep(s, true);

async function renumber_(locId) {
  for (const [i, s] of stepsOf(locId).entries()) {
    if (s.step_order !== i + 1) {
      s.step_order = i + 1;
      await db().update('sub_step', s.id, { step_order: i + 1 });
    }
  }
}

export async function reorderSteps(locId, from, to) {
  if (from === to) return;
  const arr = stepsOf(locId);
  const [m] = arr.splice(from, 1);
  arr.splice(to, 0, m);
  for (const [i, s] of arr.entries()) {
    if (s.step_order !== i + 1) {
      s.step_order = i + 1;
      await db().update('sub_step', s.id, { step_order: i + 1 });
    }
  }
}

export const moveStep = (locId, index, dir) => reorderSteps(locId, index, index + dir);

export async function toggleStepTag(stepId, tag) {
  const ex = state.subStepTags.find((l) => l.sub_step_id === stepId && l.tag_id === tag.id);
  if (ex) return removeStepTag(ex);
  const row = { id: uuid(), sub_step_id: stepId, tag_id: tag.id, memo: '' };
  await db().insert('sub_step_tag', row);
  state.subStepTags.push(row);
}

export async function removeStepTag(link) {
  await db().remove('sub_step_tag', { id: link.id });
  state.subStepTags = state.subStepTags.filter((l) => l.id !== link.id);
}

export const saveMemo = (link) => db().update('sub_step_tag', link.id, { memo: link.memo });

// 「共通」戦略: 先頭の場所で作った内容を、他の場所にコピーする(案A)
async function syncShared(unit) {
  if (unit.locs.length < 2) return;
  const [primary, ...others] = unit.locs;
  const src = stepsOf(primary.id);
  for (const o of others) {
    for (const s of stepsOf(o.id)) await removeSubStep(s, false);
    for (const s of src) {
      const copy = { id: uuid(), goal_location_id: o.id, step_order: s.step_order, description: s.description, difficulty_score: s.difficulty_score };
      await db().insert('sub_step', copy);
      state.subSteps.push(copy);
      for (const { link } of tagLinksOf(s.id)) {
        const l = { id: uuid(), sub_step_id: copy.id, tag_id: link.tag_id, memo: link.memo || '' };
        await db().insert('sub_step_tag', l);
        state.subStepTags.push(l);
      }
    }
  }
}

export const completeUnit = (unit) => run(async () => {
  const steps = stepsOf(unit.loc.id);
  if (!steps.length || steps.some((s) => !s.description.trim())) throw new Error('工程を1つ以上、空欄なしで入れてください');
  await syncShared(unit);
  state.completedUnits[unit.key] = true;
  state.activeUnit = null;
});

export function reopenUnit(unit) {
  state.completedUnits[unit.key] = false;
  state.activeUnit = unit.key;
}

// AI案を工程に反映(既存の工程は置き換える)
export async function applyAiSteps(locId, list) {
  for (const s of stepsOf(locId)) await removeSubStep(s, false);
  for (const item of list.slice(0, MAX_STEPS)) await addStep(locId, item.description);
}

// GOLD_EXAMPLE(お手本)として登録
export async function registerGoldExample(goalDescription, locId) {
  const steps = stepsOf(locId).map((s) => ({ order: s.step_order, description: s.description }));
  if (!goalDescription.trim() || !steps.length) throw new Error('目標の説明と工程が必要です');
  await db().insert('gold_example', { id: uuid(), goal_description: goalDescription.trim(), sub_steps_json: steps });
}

/* ---------- ステップ8: 振り返り日 ---------- */

function defaultReviewDate() {
  const d = new Date(state.session.held_at);
  d.setMonth(d.getMonth() + Number(state.session.duration_months));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const ymdLocal = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const todayStr = () => ymdLocal(new Date());

// 日程(最後の日・中間確認日)をDBへ保存。目標づくりの流れでは「次へ」で、カレンダーだけを開いているときは選ぶたびに保存
async function persistDates() {
  const fin = state.draft.reviewDate || null;
  const mid = state.draft.midDate || null;
  state.session.next_review_date = fin;
  state.session.mid_review_date = mid;
  await db().update('session', state.session.id, { next_review_date: fin, mid_review_date: mid });
}

async function saveReviewDate() {
  await persistDates();
}

// 最後の振り返り日を選ぶ(必ず1つ)。戻り値: 'ok' | 'past'
export async function setFinalDate(date) {
  if (date < todayStr()) return 'past';
  state.draft.reviewDate = date;
  if (state.draft.midDate && state.draft.midDate >= date) state.draft.midDate = ''; // 中間は最後より前でなければならない
  if (state.calendarView) await persistDates();
  return 'ok';
}

// 中間確認日を選ぶ(1つだけ・なくてもよい。もう一度同じ日を選ぶと外れる)。戻り値: 'set' | 'cleared' | 'no_final' | 'after_final'
export async function setMidDate(date) {
  if (state.draft.midDate === date) {
    state.draft.midDate = '';
    if (state.calendarView) await persistDates();
    return 'cleared';
  }
  if (!state.draft.reviewDate) return 'no_final';
  if (date >= state.draft.reviewDate) return 'after_final';
  state.draft.midDate = date;
  if (state.calendarView) await persistDates();
  return 'set';
}

// 「期間の真ん中の日」をおすすめとして返す
export function suggestMidDate() {
  const a = new Date(state.session.held_at);
  const b = new Date(`${state.draft.reviewDate}T00:00:00`);
  const mid = ymdLocal(new Date((a.getTime() + b.getTime()) / 2));
  return mid < todayStr() ? todayStr() : mid;
}

/* ---------- カレンダー: やった日のスタンプ ---------- */
// 「目標ごと」ではなく「その日・その場所で、何かに取り組んだ」印。過去の日はすべて押せる(あとから聞き取った分もOK)。未来の日は押せない

export const stampsOn = (date) => state.practice.filter((p) => p.log_date === date).map((p) => p.location_category);

// 戻り値: 'added' | 'removed' | 'future'
export async function toggleStamp(date, place) {
  if (date > todayStr()) return 'future';
  const ex = state.practice.find((p) => p.log_date === date && p.location_category === place);
  if (ex) {
    await db().remove('practice_log', { id: ex.id });
    state.practice = state.practice.filter((p) => p.id !== ex.id);
    return 'removed';
  }
  const row = { id: uuid(), session_id: state.session.id, log_date: date, location_category: place, logged_by: 'therapist' };
  await db().insert('practice_log', row);
  state.practice.push(row);
  return 'added';
}

// 目標づくりのあとに、カレンダーだけを開く(記録・見返し用)
export const openCalendar = (child) => run(async () => {
  const s = state.latestSession[child.id];
  if (!s) throw new Error('この対象児には、まだ目標がありません');
  resetSession();
  state.child = child;
  state.session = s;
  state.goals = await db().list('goal', { session_id: s.id });
  state.goalLocations = [];
  for (const g of state.goals) state.goalLocations.push(...(await db().list('goal_location', { goal_id: g.id })));
  state.practice = await db().list('practice_log', { session_id: s.id });
  state.draft.reviewDate = s.next_review_date || '';
  state.draft.midDate = s.mid_review_date || '';
  state.calendarView = true;
});

export function closeCalendar() {
  resetSession();
  state.child = null;
  state.calendarView = false;
}

/* ---------- 終了 ---------- */

export function finishAll() {
  resetSession();
  state.calendarView = false;
  state.child = null;
  state.step = 0;
}
