import { ref } from 'vue';
import { state, goalsSorted, locsOf, stepsOf, info, run, finishAll } from '../store.js';
import { exportPlan } from '../excel.js';
import { Illust } from './common.js';

// ステップ9: Excel出力(計画書)
export const ExportStep = {
  components: { Illust },
  setup() {
    const done = ref(false);
    const download = () => run(async () => { await exportPlan(state); done.value = true; });
    return { state, goalsSorted, locsOf, stepsOf, info, done, download, finishAll };
  },
  template: `
    <section class="card">
      <h2>📄 計画書を出力しよう</h2>
      <p class="muted">ここまでの内容をExcelにまとめます(この端末の中で作られます)。</p>

      <div class="summary">
        <div class="muted">期間 {{ state.session.duration_months }}か月 / 振り返り日 {{ state.session.next_review_date }}</div>
        <div v-for="g in goalsSorted" :key="g.id" class="summary-goal">
          <Illust :value="g.illustration_ref" :size="48" :label="false" />
          <div>
            <b>{{ g.priority }}. {{ info(g.illustration_ref).label }}</b>
            <div v-for="l in locsOf(g.id)" :key="l.id" class="muted small">{{ l.location_category }}: {{ stepsOf(l.id).length }}工程</div>
          </div>
        </div>
      </div>

      <div class="center-actions">
        <button class="primary big" :disabled="state.busy" @click="download">Excelをダウンロード</button>
        <p v-if="done" class="ok">✅ ダウンロードしました</p>
        <button class="secondary" @click="finishAll">おわる(対象児の選択にもどる)</button>
      </div>
    </section>`,
};
