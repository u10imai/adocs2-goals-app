import { computed } from 'vue';
import { state } from '../store.js';
import { googleCalendarUrl, downloadIcs } from '../calendar.js';

// ステップ8: 振り返り日の設定(参加者自身が「今、この場で」決める)
export const ReviewDateStep = {
  setup() {
    const title = 'ADOC-S 目標の振り返り';
    const details = 'ADOC-Sで決めた目標の振り返りの日です。';
    const gcal = computed(() => (state.draft.reviewDate ? googleCalendarUrl(state.draft.reviewDate, title, details) : '#'));
    const ics = () => downloadIcs(state.draft.reviewDate, title, details);
    return { state, gcal, ics };
  },
  template: `
    <section class="card center-card">
      <h2>📅 つぎは いつ ふりかえりますか?</h2>
      <p class="lead">みんなで 日にちを きめましょう</p>
      <p class="muted">はじめに「{{ state.session.duration_months }}か月後」の日づけを入れてあります。変えてもOKです。</p>
      <input type="date" class="date-input" v-model="state.draft.reviewDate">

      <div v-if="state.draft.reviewDate" class="cal-actions">
        <a class="secondary btn" :href="gcal" target="_blank" rel="noopener">Googleカレンダーに追加</a>
        <button class="secondary" @click="ics">.icsファイルをダウンロード</button>
      </div>
      <p class="muted small">カレンダーに入れるのは日付だけです(お子さんの名前は入りません)。</p>
    </section>`,
};
