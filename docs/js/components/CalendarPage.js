import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { state, stampsOn, toggleStamp, setFinalDate, setMidDate, suggestMidDate, todayStr, ymdLocal, goalsSorted } from '../store.js';
import { LOCATIONS } from '../data/master.js';
import { googleCalendarUrl, downloadIcs } from '../calendar.js';
import { Illust } from './common.js';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const toDate = (s) => new Date(`${s}T00:00:00`);
const jp = (s) => { const d = toDate(s); return `${d.getMonth() + 1}月${d.getDate()}日(${DOW[d.getDay()]})`; };

// 1枚のカレンダーに「最後の日」「中間確認日」「やった日のスタンプ」を全部載せる。
//   mode='wizard'     : 目標づくりのステップ8。日程は「次へ」で保存。最初は「最後の日」を選ぶ状態
//   mode='standalone' : 目標づくりのあとに開くカレンダー。日程もスタンプも、押すたびに保存
export const CalendarPage = {
  components: { Illust },
  props: { mode: { type: String, default: 'wizard' } },
  setup(props) {
    const standalone = props.mode === 'standalone';
    const today = todayStr();
    const tool = ref(standalone ? 'stamp' : 'final');
    const selected = ref(null);
    const msg = ref('');
    const popKey = ref('');
    const monthOf = (s) => { const d = toDate(s); return new Date(d.getFullYear(), d.getMonth(), 1); };
    const month = ref(monthOf(!standalone && state.draft.reviewDate ? state.draft.reviewDate : today));

    // 画面が広い(PC・タブレット)ときは、マスの中の枠を直接タップして印をつけられる。スマホは「日→大きなボタン」の2回タップ
    const mq = window.matchMedia('(min-width: 768px)');
    const wide = ref(mq.matches);
    const onMq = () => { wide.value = mq.matches; };
    onMounted(() => mq.addEventListener('change', onMq));
    onBeforeUnmount(() => mq.removeEventListener('change', onMq));

    const tools = [
      { key: 'stamp', icon: '⭐', label: 'やった日' },
      { key: 'final', icon: '🏁', label: '最後の日' },
      { key: 'mid', icon: '📌', label: '中間確認日' },
    ];
    const help = computed(() => ({
      stamp: wide.value
        ? '日のマスの中の枠(学校・家・デイ・その他)を直接タップして、印をつけます。過去の日もつけられます(あとから聞き取った分もOK)。'
        : '取り組んだ日をタップして、出てくる場所のボタンで印をつけます。過去の日もつけられます(あとから聞き取った分もOK)。',
      final: '🏁 最後の振り返り日を、カレンダーからえらびます(かならず1つ)。',
      mid: '📌 途中の確認日をえらびます(なくてもOK・1つだけ)。もう一度タップすると外れます。',
    }[tool.value]));

    const flash = (t) => { msg.value = t; setTimeout(() => { if (msg.value === t) msg.value = ''; }, 2600); };

    const cells = computed(() => {
      const y = month.value.getFullYear(); const m = month.value.getMonth();
      const list = Array(new Date(y, m, 1).getDay()).fill(null);
      for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) list.push(ymdLocal(new Date(y, m, d)));
      while (list.length % 7) list.push(null);
      return list;
    });
    const start = computed(() => ymdLocal(new Date(state.session.held_at)));
    const final = computed(() => state.draft.reviewDate);
    const mid = computed(() => state.draft.midDate);
    const has = (date, place) => stampsOn(date).includes(place);
    const cls = (date) => ({
      today: date === today, future: date > today, final: date === final.value, mid: date === mid.value,
      sel: date === selected.value, period: date >= start.value && (!final.value || date <= final.value),
    });
    const label = (date) => {
      const st = stampsOn(date);
      return `${jp(date)}${date === final.value ? ' 最後の日' : ''}${date === mid.value ? ' 中間確認日' : ''}${st.length ? ' やった: ' + st.join('・') : ''}`;
    };
    const shift = (n) => { month.value = new Date(month.value.getFullYear(), month.value.getMonth() + n, 1); };

    const onDay = async (date) => {
      selected.value = date;
      if (tool.value === 'final') {
        flash((await setFinalDate(date)) === 'past' ? '今日より前の日は、えらべません' : '🏁 最後の日を きめました');
      } else if (tool.value === 'mid') {
        const r = await setMidDate(date);
        flash({ set: '📌 中間確認日を きめました', cleared: '📌 中間確認日を はずしました', no_final: '先に「🏁 最後の日」をえらんでください', after_final: '中間確認日は、最後の日より前にしてください' }[r]);
      }
    };
    const stamp = async (place) => {
      const r = await toggleStamp(selected.value, place);
      if (r === 'future') return flash('まだ先の日には、印をつけられません');
      if (r === 'added') { popKey.value = `${selected.value}|${place}`; setTimeout(() => { popKey.value = ''; }, 700); }
    };
    // マスの中の枠(場所)をタップ。広い画面の「やった日」モードだけ直接印をつける。それ以外は、日をタップしたのと同じ
    const onQuad = async (date, place) => {
      if (!wide.value || tool.value !== 'stamp') return onDay(date);
      selected.value = date;
      await stamp(place);
    };
    const pickSuggested = async () => { flash({ set: '📌 真ん中あたりの日を入れました', after_final: '期間が短いので、日付を自分でえらんでください' }[await setMidDate(suggestMidDate())] || ''); tool.value = 'mid'; month.value = monthOf(mid.value || final.value); };

    // 「中間も決めますか?」の促し(最後の日を決めたあと、まだ中間がないとき)
    const midHint = computed(() => !standalone && tool.value === 'final' && !!final.value && !mid.value);

    const daysLeft = computed(() => (final.value ? Math.round((toDate(final.value) - toDate(today)) / 86400000) : null));
    const stampDays = computed(() => new Set(state.practice.map((p) => p.log_date)).size);
    const monthStampDays = computed(() => {
      const prefix = ymdLocal(month.value).slice(0, 7);
      return new Set(state.practice.filter((p) => p.log_date.startsWith(prefix)).map((p) => p.log_date)).size;
    });

    const events = computed(() => [
      ...(mid.value ? [{ date: mid.value, title: 'ADOC-S 目標の中間確認', details: 'ADOC-Sで決めた目標の、途中の確認日です。' }] : []),
      ...(final.value ? [{ date: final.value, title: 'ADOC-S 目標の振り返り', details: 'ADOC-Sで決めた目標の、最後の振り返りの日です。' }] : []),
    ]);
    const gcal = (e) => googleCalendarUrl(e.date, e.title, e.details);

    return {
      state, LOCATIONS, DOW, tools, tool, help, selected, msg, popKey, month, cells, cls, has, label, shift, onDay, onQuad, wide, stamp, pickSuggested,
      midHint, final, mid, daysLeft, stampDays, monthStampDays, events, gcal, downloadIcs, today, jp, goals: goalsSorted, standalone,
      goToday: () => { month.value = monthOf(today); },
      goFinal: () => { month.value = monthOf(final.value); },
    };
  },
  template: `
    <section class="cal">
      <div v-if="goals.length" class="cal-goals">
        <span class="muted small">いまの目標:</span>
        <Illust v-for="g in goals" :key="g.id" :value="g.illustration_ref" :size="36" />
      </div>

      <div class="cal-tools" role="tablist">
        <button v-for="t in tools" :key="t.key" role="tab" :aria-selected="tool === t.key" :class="{ on: tool === t.key }" @click="tool = t.key">{{ t.icon }} {{ t.label }}</button>
      </div>
      <p class="cal-help">{{ help }}</p>

      <div v-if="midHint" class="notice cal-hint">
        📌 <b>中間確認日も決めますか?</b>(なくてもOKです。あとで決めることもできます)
        <div class="row">
          <button class="secondary small" @click="tool = 'mid'">中間の日をえらぶ</button>
          <button class="secondary small" @click="pickSuggested">おすすめ(期間の真ん中)を入れる</button>
        </div>
      </div>

      <div class="cal-head">
        <button class="secondary small" @click="shift(-1)" aria-label="前の月">◀</button>
        <b>{{ month.getFullYear() }}年{{ month.getMonth() + 1 }}月</b>
        <button class="secondary small" @click="shift(1)" aria-label="次の月">▶</button>
        <button class="link" @click="goToday">今日</button>
        <button v-if="final" class="link" @click="goFinal">🏁 最後の日へ</button>
      </div>

      <div class="cal-grid">
        <div v-for="w in DOW" :key="w" class="dow">{{ w }}</div>
        <div v-for="(date, i) in cells" :key="i" class="cell-wrap">
          <div v-if="date" class="cell" :class="cls(date)" :data-date="date">
            <button class="dayhit" :aria-label="label(date)" @click="onDay(date)"></button>
            <span class="dn">{{ Number(date.slice(8)) }}</span>
            <span v-if="date === final" class="flag">🏁</span><span v-if="date === mid" class="flag">📌</span>
            <span class="quad">
              <button v-for="l in LOCATIONS" :key="l.key" class="qbtn" :class="{ on: has(date, l.key), pop: popKey === date + '|' + l.key }"
                :style="has(date, l.key) ? { background: l.color } : {}" :title="l.key"
                :tabindex="wide ? 0 : -1" :aria-hidden="wide ? 'false' : 'true'" :aria-label="jp(date) + ' ' + l.key + (has(date, l.key) ? ' やった' : '')"
                @click.stop="onQuad(date, l.key)"><span class="qi">{{ l.icon }}</span><span class="qs">{{ has(date, l.key) ? '★' : '' }}</span></button>
            </span>
          </div>
        </div>
      </div>

      <div v-if="tool === 'stamp' && selected" class="day-panel">
        <b>{{ jp(selected) }}</b>
        <span v-if="selected > today" class="muted small">(まだ先の日です)</span>
        <div class="place-btns">
          <button v-for="l in LOCATIONS" :key="l.key" class="place-btn" :class="{ on: has(selected, l.key) }" :style="has(selected, l.key) ? { background: l.color, borderColor: l.color } : { borderColor: l.color }" :disabled="selected > today" @click="stamp(l.key)">
            <span class="pi">{{ l.icon }}</span>{{ l.key }}<span class="pm">{{ has(selected, l.key) ? '⭐ やった!' : 'おす' }}</span>
          </button>
        </div>
      </div>
      <p v-else-if="tool === 'stamp'" class="muted small">日にちをタップしてください。</p>

      <div class="cal-summary">
        <span v-if="daysLeft !== null">🏁 {{ daysLeft > 0 ? 'あと ' + daysLeft + '日' : daysLeft === 0 ? '今日が最後の日です' : '最後の日を すぎました' }}</span>
        <span>⭐ やった日 <b>{{ stampDays }}</b>日<span class="muted">(この月 {{ monthStampDays }}日)</span></span>
      </div>

      <div class="cal-legend muted small">
        <span v-for="l in LOCATIONS" :key="l.key"><i class="lg" :style="{ background: l.color }"></i>{{ l.icon }} {{ l.key }}</span>
        <span>🏁 最後の日</span><span>📌 中間確認日</span>
      </div>

      <div v-if="events.length" class="cal-export">
        <div v-for="e in events" :key="e.date" class="row">
          <span>{{ e.title.includes('中間') ? '📌' : '🏁' }} {{ jp(e.date) }}</span>
          <a class="secondary small btn" :href="gcal(e)" target="_blank" rel="noopener">Googleカレンダーに追加</a>
        </div>
        <button class="secondary small" @click="downloadIcs(events)">すべて .ics でダウンロード</button>
        <p class="muted small">カレンダーに入れるのは日付だけです(お子さんの名前は入りません)。</p>
      </div>

      <div v-if="msg" class="toast" role="status">{{ msg }}</div>
    </section>`,
};
