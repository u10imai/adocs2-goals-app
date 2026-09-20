import { multiLocGoals, locsOf, strategyModeOf, setStrategyMode, tooManyCards, unitList, state, go } from '../store.js';
import { Illust } from './common.js';

// ステップ6の上の部分: 「場所ごとに工夫を変えますか?」(場所が複数ある目標ごと)と、カードが多すぎるときの確認
export const StrategyPanel = {
  components: { Illust },
  setup() {
    const moreCards = () => { state.ackMany = true; };
    return { multiLocGoals, locsOf, strategyModeOf, setStrategyMode, tooManyCards, unitList, go, moreCards };
  },
  template: `
    <div class="strategy-panel">
      <template v-if="multiLocGoals.length">
        <h3>場所ごとに、やり方(工夫)を かえますか?</h3>
        <div v-for="g in multiLocGoals" :key="g.id" class="strategy-row">
          <Illust :value="g.illustration_ref" :size="56" />
          <div>
            <div class="muted small">{{ locsOf(g.id).map(l => l.location_category).join('・') }}</div>
            <div class="chip-row">
              <button class="big-chip" :class="{ on: strategyModeOf(g.id) === 'shared' }" @click="setStrategyMode(g.id, 'shared')">🤝 かえない(どこでも同じ)</button>
              <button class="big-chip" :class="{ on: strategyModeOf(g.id) === 'per_location' }" @click="setStrategyMode(g.id, 'per_location')">🔀 かえる(場所ごとに)</button>
            </div>
          </div>
        </div>
        <p class="muted small">「かえない」は カードが1枚(入力は1回で、ほかの場所にもコピーされます)。「かえる」は 場所の数だけ カードが ふえます。</p>
      </template>

      <div v-if="tooManyCards" class="warn-box" role="alert">
        <b>⚠ カードが {{ unitList.length }}枚になりました。</b>
        <p>目標が多すぎて、手順が複雑になります。一部を「次回の目標」にしてはどうでしょうか?(「どこでも同じ」にすると、カードが減ります)</p>
        <div class="row">
          <button class="secondary" @click="go(3)">目標を減らす</button>
          <button class="secondary" @click="go(4)">場所を減らす</button>
          <button class="secondary" @click="moreCards">このまま続ける</button>
        </div>
      </div>
    </div>`,
};
