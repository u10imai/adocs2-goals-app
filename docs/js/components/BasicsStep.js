import { state, addCustomRole } from '../store.js';
import { ROLE_OPTIONS, roleIcon } from '../data/master.js';

// ステップ1: 基本情報の確認(参加者 + 期間)
export const BasicsStep = {
  setup() {
    const d = state.draft;
    const roles = () => [...ROLE_OPTIONS, ...d.roles.filter((r) => !ROLE_OPTIONS.includes(r))];
    const toggleRole = (r) => {
      const i = d.roles.indexOf(r);
      if (i >= 0) d.roles.splice(i, 1); else d.roles.push(r);
    };
    const setMonths = (m) => { d.months = m; d.customMonths = false; };
    return { state, d, roles, toggleRole, setMonths, addCustomRole, roleIcon };
  },
  template: `
    <section class="card">
      <h2>きょうの はなしあいの まえおき</h2>

      <h3>いま いる人は?</h3>
      <p class="muted">ここでえらんだ人が、順番に目標をえらびます(本人 → 保護者 → 支援者の順)。</p>
      <div class="chip-row">
        <button v-for="r in roles()" :key="r" class="role-chip" :class="{ on: d.roles.includes(r) }" @click="toggleRole(r)">
          <span class="role-emoji">{{ roleIcon(r) }}</span>{{ r }}
        </button>
      </div>
      <form class="inline-form" @submit.prevent="addCustomRole()">
        <input v-model="d.customRole" placeholder="その他の役割を追加(例: 保護者2)">
        <button class="secondary small">追加</button>
      </form>

      <h3>どれくらいの 期間の もくひょう?</h3>
      <div class="chip-row">
        <button v-for="m in [3, 6, 12]" :key="m" class="big-chip" :class="{ on: !d.customMonths && d.months === m }" @click="setMonths(m)">{{ m }}か月</button>
        <button class="big-chip" :class="{ on: d.customMonths }" @click="d.customMonths = true">ほか</button>
      </div>
      <label v-if="d.customMonths" class="inline-label">月数 <input v-model.number="d.months" type="number" min="1" max="36"> か月</label>
    </section>`,
};
