import { createApp, computed, onMounted } from 'vue';
import { state, init, next, prev, go, logout, skipPolicy, canNext, nameOf, closeCalendar } from './store.js';
import { STEP_TITLES } from './data/master.js';
import { LoginStep } from './components/LoginStep.js';
import { BasicsStep } from './components/BasicsStep.js';
import { PolicyStep } from './components/PolicyStep.js';
import { PickStep } from './components/PickStep.js';
import { NarrowStep } from './components/NarrowStep.js';
import { StrategyStep } from './components/StrategyStep.js';
import { DecomposeStep } from './components/DecomposeStep.js';
import { ReviewDateStep } from './components/ReviewDateStep.js';
import { ExportStep } from './components/ExportStep.js';
import { CalendarPage } from './components/CalendarPage.js';

const App = {
  components: { LoginStep, BasicsStep, PolicyStep, PickStep, NarrowStep, StrategyStep, DecomposeStep, ReviewDateStep, ExportStep, CalendarPage },
  setup() {
    onMounted(init);
    // 進捗バーに出す画面(ステップ6は複数場所があるときだけ)
    const nextLabel = computed(() => (state.step === 8 ? '計画書へ →' : '次へ →'));
    const showNav = computed(() => state.step > 0 && state.step < 9 && !state.activeUnit);
    return { state, STEP_TITLES, next, prev, go, logout, skipPolicy, canNext, nextLabel, showNav, nameOf, closeCalendar };
  },
  template: `
    <div class="app" :class="{ clinical: state.step === 7 }">
      <header class="topbar">
        <div class="brand">🌈 もくひょうアプリ <span v-if="state.isDemo" class="demo-badge">デモ</span></div>
        <div v-if="state.child" class="who">🧒 {{ nameOf(state.child.id) }}({{ state.child.child_code }}) <span v-if="state.child.is_test" class="test-badge">テスト</span></div>
        <button v-if="state.user" class="link" @click="logout">ログアウト</button>
      </header>

      <nav v-if="state.step > 0" class="progress" aria-label="進み具合">
        <button v-for="n in 9" :key="n" class="dot" :class="{ now: state.step === n, done: n < state.step }"
          :disabled="n >= state.step || state.busy" :title="STEP_TITLES[n]" @click="go(n)">{{ n }}</button>
        <span class="progress-title">{{ state.step }}/9 {{ STEP_TITLES[state.step] }}</span>
      </nav>

      <main>
        <div v-if="!state.ready" class="card center-card">よみこみ中…</div>
        <template v-else>
          <div v-if="state.error" class="error-banner" role="alert">{{ state.error }}</div>
          <section v-if="state.calendarView" class="card">
            <button class="link" @click="closeCalendar">← 対象児の選択へもどる</button>
            <h2>📅 カレンダー</h2>
            <CalendarPage mode="standalone" />
          </section>
          <LoginStep v-else-if="state.step === 0" />
          <BasicsStep v-else-if="state.step === 1" />
          <PolicyStep v-else-if="state.step === 2" mode="draft" />
          <PickStep v-else-if="state.step === 3" />
          <NarrowStep v-else-if="state.step === 4" />
          <PolicyStep v-else-if="state.step === 5" mode="confirm" />
          <StrategyStep v-else-if="state.step === 6" />
          <DecomposeStep v-else-if="state.step === 7" />
          <ReviewDateStep v-else-if="state.step === 8" />
          <ExportStep v-else-if="state.step === 9" />
        </template>
      </main>

      <footer v-if="showNav" class="navbar">
        <button v-if="state.step > 1" class="secondary" :disabled="state.busy" @click="prev">← 戻る</button>
        <span class="spacer"></span>
        <button v-if="state.step === 2" class="secondary" @click="skipPolicy">スキップ(あとで決める)</button>
        <button class="primary big" :disabled="!canNext || state.busy" @click="next">{{ nextLabel }}</button>
      </footer>
      <footer v-else-if="state.step === 9" class="navbar">
        <button class="secondary" @click="prev">← 戻る</button>
      </footer>
    </div>`,
};

createApp(App).mount('#app');
