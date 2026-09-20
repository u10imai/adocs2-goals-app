import { ref, computed } from 'vue';
import { state, sortedSps, roleOfPid, currentTurn, selectionsOf, toggleSelection, saveReason, finishTurn, reopenTurn, candidates, toggleGoalDraft, placeGoalDraft, MAX_GOALS } from '../store.js';
import { BUILTIN_ILLUSTRATIONS, ILLUSTRATION_CATEGORIES } from '../data/illustrations.js';
import { roleIcon, askExamplesFor, STAMPS } from '../data/master.js';
import { Illust } from './common.js';
import { PhotoDialog } from './PhotoDialog.js';

// ステップ3: 目標選択(ターン制)+ みんな選んだあと、そのまま話し合って「枠1〜3」に絞り込む
export const PickStep = {
  components: { Illust, PhotoDialog },
  setup() {
    const category = ref('すべて');
    const showPhoto = ref(false);
    const stamp = ref(null); // { ref, text }
    const toast = ref('');

    const all = computed(() => [
      ...BUILTIN_ILLUSTRATIONS,
      ...state.customIllustrations.map((c) => ({ ref: `custom:${c.id}`, label: c.label, category: 'オリジナル' })),
    ]);
    const categories = computed(() => ['すべて', ...ILLUSTRATION_CATEGORIES, ...(state.customIllustrations.length ? ['オリジナル'] : [])]);
    const shown = computed(() => all.value.filter((x) => category.value === 'すべて' || x.category === category.value));
    const mine = computed(() => (currentTurn.value ? selectionsOf(currentTurn.value.pid) : []));
    const isMine = (r) => mine.value.some((x) => x.illustration_ref === r);
    const askText = computed(() => {
      const list = currentTurn.value ? askExamplesFor(currentTurn.value.role) : [];
      return list[0] || '';
    });

    const pick = async (r) => {
      const res = await toggleSelection(currentTurn.value.pid, r);
      if (res === 'added') {
        stamp.value = { ref: r, text: STAMPS[Math.floor(Math.random() * STAMPS.length)] };
        setTimeout(() => { if (stamp.value?.ref === r) stamp.value = null; }, 1000);
      } else if (res === 'max') {
        toast.value = `えらべるのは ${MAX_GOALS}つまでです`;
        setTimeout(() => { toast.value = ''; }, 1800);
      }
    };
    const statusIcon = (s) => ({ pending: '⏳', selected: '✅', skipped: '⏭️' }[s]);
    const onAdded = (r) => { if (currentTurn.value) pick(r); };

    // ---- 絞り込み: 下のカードを、上の枠(1〜3)へ置く。タップでも、ドラッグでもOK ----
    const slots = computed(() => Array.from({ length: MAX_GOALS }, (_, i) => state.draft.goalDraft[i]?.ref || null));
    const slotOf = (r) => state.draft.goalDraft.findIndex((g) => g.ref === r);
    const say = (t) => { toast.value = t; setTimeout(() => { if (toast.value === t) toast.value = ''; }, 2200); };
    const tapCard = (r) => { if (slotOf(r) < 0 && state.draft.goalDraft.length >= MAX_GOALS) return say(`枠は ${MAX_GOALS}つまで。どれかをはずしてください`); toggleGoalDraft(r); };
    const dragging = ref('');
    const onDrop = (i) => {
      if (dragging.value && !placeGoalDraft(dragging.value, i)) say(`枠は ${MAX_GOALS}つまで。どれかをはずしてください`);
      dragging.value = '';
    };
    const pickersOf = (r) => candidates.value.find((c) => c.ref === r)?.pickers || [];

    return { candidates, slots, slotOf, tapCard, dragging, onDrop, pickersOf, toggleGoalDraft, state, sortedSps, roleOfPid, currentTurn, selectionsOf, category, categories, shown, mine, isMine, askText, pick, stamp, toast, showPhoto, onAdded, finishTurn, reopenTurn, saveReason, roleIcon, statusIcon, MAX_GOALS };
  },
  template: `
    <section class="card">
      <div class="turn-bar">
        <button v-for="sp in sortedSps" :key="sp.id" class="turn-chip"
          :class="{ active: currentTurn?.sp.id === sp.id, done: sp.turn_status !== 'pending' }"
          @click="reopenTurn(sp.id)">
          <span class="turn-avatar">{{ roleIcon(roleOfPid(sp.participant_id)) }}</span>
          <span class="turn-role">{{ roleOfPid(sp.participant_id) }}</span>
          <span class="turn-status">{{ statusIcon(sp.turn_status) }}</span>
        </button>
      </div>

      <template v-if="currentTurn">
        <div class="ask-example">💡 <b>{{ currentTurn.role }}</b>への聞き方の例:「{{ askText }}」</div>
        <p class="muted">気になるものを、{{ MAX_GOALS }}つまで えらべます(えらばなくてもOK)。いまの選択: {{ mine.length }} / {{ MAX_GOALS }}</p>

        <div class="cat-filter">
          <button v-for="c in categories" :key="c" :class="{ on: category === c }" @click="category = c">{{ c }}</button>
          <button class="add-photo" @click="showPhoto = true">📷 写真からイラストを追加</button>
        </div>

        <div class="illust-grid">
          <button v-for="x in shown" :key="x.ref" class="illust-card" :class="{ picked: isMine(x.ref) }" @click="pick(x.ref)">
            <Illust :value="x.ref" :size="88" />
            <span v-if="isMine(x.ref)" class="check">✓</span>
            <span v-if="stamp && stamp.ref === x.ref" class="stamp">⭐ {{ stamp.text }}</span>
          </button>
        </div>

        <div v-if="mine.length" class="picked-tray">
          <h4>{{ currentTurn.role }}がえらんだもの</h4>
          <div v-for="s in mine" :key="s.id" class="picked-row">
            <Illust :value="s.illustration_ref" :size="44" :label="false" />
            <input v-model="s.reason" placeholder="えらんだ理由(なくてもOK)" @change="saveReason(s)">
          </div>
        </div>

        <div class="turn-actions">
          <button class="secondary" @click="finishTurn('skipped')">スキップ</button>
          <button class="primary big" @click="finishTurn()">{{ mine.length ? 'えらびおわった → つぎの人へ' : 'つぎの人へ' }}</button>
        </div>
      </template>

      <div v-else class="narrow">
        <h3>🎉 みんな えらびおわりました。はなしあって、もくひょうを しぼろう</h3>
        <p class="muted">下のカードを、上の枠(1〜{{ MAX_GOALS }})へ もっていきます(タップでも、ドラッグでもOK)。カードの人のマークは、えらんだ人です。</p>

        <div class="slots">
          <div v-for="(r, i) in slots" :key="i" class="slot" :class="{ filled: !!r }" @dragover.prevent @drop.prevent="onDrop(i)">
            <span class="slot-no">{{ i + 1 }}</span>
            <template v-if="r">
              <button class="slot-card" @click="toggleGoalDraft(r)" :aria-label="'枠' + (i + 1) + 'からはずす'">
                <Illust :value="r" :size="80" />
                <span class="pickers"><span v-for="(p, k) in pickersOf(r)" :key="k" class="picker" :title="p.reason">{{ roleIcon(p.role) }}</span></span>
                <span class="slot-x">×</span>
              </button>
            </template>
            <span v-else class="slot-empty">ここに おく</span>
          </div>
        </div>

        <p v-if="!candidates.length" class="notice">まだ候補がありません。上の人のアイコンをタップして、えらびなおしてください。</p>
        <div class="cand-grid">
          <button v-for="c in candidates" :key="c.ref" class="cand-card" :class="{ kept: slotOf(c.ref) >= 0 }" draggable="true"
            @dragstart="dragging = c.ref" @dragend="dragging = ''" @click="tapCard(c.ref)">
            <Illust :value="c.ref" :size="96" />
            <div class="pickers">
              <span v-for="(p, i) in c.pickers" :key="i" class="picker" :title="p.reason">{{ roleIcon(p.role) }}<small>{{ p.role }}</small></span>
            </div>
            <span v-if="slotOf(c.ref) >= 0" class="kept-badge">{{ slotOf(c.ref) + 1 }}</span>
          </button>
        </div>
        <p class="muted small">直したいときは、上の人のアイコンをタップすると、その人の選びなおしができます。</p>
      </div>

      <div v-if="toast" class="toast">{{ toast }}</div>
      <PhotoDialog v-if="showPhoto" @close="showPhoto = false" @added="onAdded" />
    </section>`,
};
