import { multiLocGoals, locsOf, setStrategyMode } from '../store.js';
import { Illust } from './common.js';

// ステップ6: 戦略モード(場所が複数ある目標だけ表示される。1か所のみなら自動でスキップ)
export const StrategyStep = {
  components: { Illust },
  setup() {
    return { multiLocGoals, locsOf, setStrategyMode };
  },
  template: `
    <section class="card">
      <h2>場所ごとに 工夫を かえる?</h2>
      <p class="muted">複数の場所でやる目標だけ、ここで決めます。「同じ」にすると入力は1回でOK(裏で各場所にコピーされ、あとから場所ごとに直せます)。</p>
      <p v-if="!multiLocGoals.length" class="notice">場所が複数ある目標がないので、ここでの設定は不要です(そのまま次へ進めます)。</p>
      <div v-for="g in multiLocGoals" :key="g.id" class="strategy-row">
        <Illust :value="g.illustration_ref" :size="72" />
        <div>
          <div class="muted">{{ locsOf(g.id).map(l => l.location_category).join('・') }}</div>
          <div class="chip-row">
            <button class="big-chip" :class="{ on: locsOf(g.id)[0].strategy_mode === 'shared' }" @click="setStrategyMode(g.id, 'shared')">🤝 どこでも同じ工夫</button>
            <button class="big-chip" :class="{ on: locsOf(g.id)[0].strategy_mode === 'per_location' }" @click="setStrategyMode(g.id, 'per_location')">🔀 場所ごとに変える</button>
          </div>
        </div>
      </div>
    </section>`,
};
