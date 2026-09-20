import { state, moveGoalDraft, toggleLoc } from '../store.js';
import { LOCATIONS } from '../data/master.js';
import { Illust } from './common.js';

// ステップ4: 優先順位 + どこでやるか(絞り込みはステップ3で済んでいる)
export const NarrowStep = {
  components: { Illust },
  setup() {
    return { state, moveGoalDraft, toggleLoc, LOCATIONS };
  },
  template: `
    <section class="card">
      <h2>ゆうせんじゅんいと、どこでやるかを きめよう</h2>
      <p class="muted">上にあるほど、先にとりくみます。順番は ↑↓ で入れかえられます。</p>

      <p v-if="!state.draft.goalDraft.length" class="notice">まだ もくひょうが ありません。「戻る」で、もくひょうを しぼってください。</p>

      <div class="goal-list">
        <div v-for="(g, i) in state.draft.goalDraft" :key="g.ref" class="goal-row">
          <div class="goal-head">
            <span class="prio">{{ i + 1 }}</span>
            <Illust :value="g.ref" :size="64" />
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
