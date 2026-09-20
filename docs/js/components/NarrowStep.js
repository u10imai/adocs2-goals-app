import { state, candidates, toggleGoalDraft, moveGoalDraft, toggleLoc, MAX_GOALS } from '../store.js';
import { roleIcon, LOCATIONS } from '../data/master.js';
import { Illust } from './common.js';

// ステップ4: 絞り込み + 場所の紐付け(自動絞り込みはしない。協議で決める)
export const NarrowStep = {
  components: { Illust },
  setup() {
    const isKept = (ref) => state.draft.goalDraft.some((g) => g.ref === ref);
    const order = (ref) => state.draft.goalDraft.findIndex((g) => g.ref === ref) + 1;
    return { state, candidates, isKept, order, toggleGoalDraft, moveGoalDraft, toggleLoc, roleIcon, LOCATIONS, MAX_GOALS };
  },
  template: `
    <section class="card">
      <h2>はなしあって、もくひょうを しぼろう</h2>
      <p class="muted">{{ MAX_GOALS }}つまで えらべます。えらんだら、そのまま「どこでやるか」も きめます。</p>

      <p v-if="!candidates.length" class="notice">まだ候補がありません。「戻る」で目標選択にもどってください。</p>

      <div class="cand-grid">
        <button v-for="c in candidates" :key="c.ref" class="cand-card" :class="{ kept: isKept(c.ref) }" @click="toggleGoalDraft(c.ref)">
          <Illust :value="c.ref" :size="96" />
          <div class="pickers">
            <span v-for="(p, i) in c.pickers" :key="i" class="picker" :class="{ self: p.role === '本人' }" :title="p.reason">
              {{ roleIcon(p.role) }}<small>{{ p.role }}</small>
            </span>
          </div>
          <span v-if="isKept(c.ref)" class="kept-badge">{{ order(c.ref) }}</span>
        </button>
      </div>

      <div v-if="state.draft.goalDraft.length" class="goal-list">
        <h3>きめた もくひょう(上ほど ゆうせん)</h3>
        <div v-for="(g, i) in state.draft.goalDraft" :key="g.ref" class="goal-row">
          <div class="goal-head">
            <span class="prio">{{ i + 1 }}</span>
            <Illust :value="g.ref" :size="56" />
            <div class="updown">
              <button :disabled="i === 0" @click="moveGoalDraft(i, -1)" aria-label="上へ">↑</button>
              <button :disabled="i === state.draft.goalDraft.length - 1" @click="moveGoalDraft(i, 1)" aria-label="下へ">↓</button>
            </div>
          </div>
          <div class="loc-picker">
            <span class="muted">どこでやる?(いくつでも)</span>
            <div class="chip-row">
              <button v-for="l in LOCATIONS" :key="l.key" class="big-chip" :class="{ on: g.locs.includes(l.key) }" @click="toggleLoc(g, l.key)">{{ l.icon }} {{ l.key }}</button>
            </div>
            <p v-if="!g.locs.length" class="error small">場所を1つ以上えらんでください</p>
          </div>
        </div>
      </div>
    </section>`,
};
