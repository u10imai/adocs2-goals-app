import { ref, computed } from 'vue';
import Sortable from 'sortablejs';
import {
  state, unitList, stepsOf, tagLinksOf, addStep, saveStep, deleteStep, moveStep, reorderSteps,
  toggleStepTag, removeStepTag, saveMemo, createTag, completeUnit, reopenUnit, applyAiSteps,
  registerGoldExample, run, info, MAX_STEPS,
} from '../store.js';
import { CATEGORIES, catOf } from '../data/master.js';
import { decomposeSteps } from '../ai.js';
import { Illust } from './common.js';

// ドラッグ&ドロップ(タブレット・PC)。Vueが描画するDOMと競合しないよう、ドロップ後にDOMを元に戻してからstateを更新する
const vSortable = {
  mounted(el, binding) {
    el._onSort = binding.value;
    el._sortable = Sortable.create(el, {
      handle: '.drag-handle', animation: 150, ghostClass: 'drag-ghost',
      onEnd(evt) {
        const { oldIndex, newIndex, item, from } = evt;
        from.removeChild(item);
        from.insertBefore(item, from.children[oldIndex] || null);
        el._onSort(oldIndex, newIndex);
      },
    });
  },
  updated(el, binding) { el._onSort = binding.value; },
  unmounted(el) { el._sortable?.destroy(); },
};

// 工程1つ分のカード(現状レベル + 調整戦略タグ)
const StepCard = {
  components: { Illust },
  props: { step: Object, goalRef: String, index: Number, count: Number },
  emits: ['up', 'down', 'remove'],
  setup(props) {
    const openCat = ref(null);
    const newTag = ref('');
    const links = computed(() => tagLinksOf(props.step.id));
    const chips = computed(() => state.tags.filter((t) => t.category === openCat.value));
    const has = (tagId) => state.subStepTags.some((l) => l.sub_step_id === props.step.id && l.tag_id === tagId);
    const addNew = async () => {
      const t = await createTag(openCat.value, newTag.value);
      if (t && !has(t.id)) await toggleStepTag(props.step.id, t);
      newTag.value = '';
    };
    const levelText = (v) => (v <= 2 ? 'イージー' : v >= 8 ? 'ハード' : 'ふつう');
    return { state, openCat, newTag, links, chips, has, addNew, levelText, CATEGORIES, catOf, saveStep, toggleStepTag, removeStepTag, saveMemo };
  },
  template: `
    <div class="step-card">
      <div class="step-head">
        <span class="drag-handle" title="ドラッグで並び替え">⠿</span>
        <span class="step-no">{{ index + 1 }}</span>
        <Illust :value="goalRef" :size="36" :label="false" />
        <input class="step-desc" v-model="step.description" placeholder="工程(短い文で)例: 食具を手に取る" maxlength="60" @change="saveStep(step)">
        <div class="updown">
          <button :disabled="index === 0" @click="$emit('up')" aria-label="上へ">↑</button>
          <button :disabled="index === count - 1" @click="$emit('down')" aria-label="下へ">↓</button>
          <button class="danger" @click="$emit('remove')" aria-label="削除">🗑</button>
        </div>
      </div>

      <div class="level">
        <span class="level-label">現状レベル</span>
        <span class="muted small">イージー 0</span>
        <input type="range" min="0" max="10" v-model.number="step.difficulty_score" @change="saveStep(step)">
        <span class="muted small">10 ハード</span>
        <b class="level-val">{{ step.difficulty_score }}<small>({{ levelText(step.difficulty_score) }})</small></b>
      </div>

      <div class="tagbox">
        <div v-for="x in links" :key="x.link.id" class="sel-tag" :style="{ borderColor: catOf(x.tag.category).color }">
          <span class="cat-ic" :title="catOf(x.tag.category).label">{{ catOf(x.tag.category).icon }}</span>
          <b>{{ x.tag.description }}</b>
          <input class="memo" v-model="x.link.memo" placeholder="補足メモ(任意)" @change="saveMemo(x.link)">
          <button class="x" @click="removeStepTag(x.link)" aria-label="外す">×</button>
        </div>

        <div class="cat-tabs">
          <span class="muted small">工夫を足す:</span>
          <button v-for="c in CATEGORIES" :key="c.key" :class="{ on: openCat === c.key }" :style="openCat === c.key ? { background: c.color, borderColor: c.color } : { borderColor: c.color }" @click="openCat = openCat === c.key ? null : c.key">
            {{ c.icon }} {{ c.short }}
          </button>
        </div>
        <div v-if="openCat" class="chips">
          <button v-for="t in chips" :key="t.id" class="chip" :class="{ on: has(t.id) }" @click="toggleStepTag(step.id, t)">{{ t.description }}</button>
          <form class="chip-add" @submit.prevent="addNew">
            <input v-model="newTag" placeholder="＋新しいタグ">
            <button class="secondary small" :disabled="!newTag.trim()">追加</button>
          </form>
        </div>
      </div>
    </div>`,
};

// ステップ7: 工程分解 + 調整戦略タグ付け(セラピスト向け・実用重視の画面)
export const DecomposeStep = {
  components: { Illust, StepCard },
  directives: { sortable: vSortable },
  setup() {
    const aiText = ref('');
    const aiBusy = ref(false);
    const aiMsg = ref('');
    const goldMsg = ref('');

    const active = computed(() => unitList.value.find((u) => u.key === state.activeUnit));
    const steps = computed(() => (active.value ? stepsOf(active.value.loc.id) : []));

    const open = async (u) => {
      state.activeUnit = u.key;
      aiText.value = info(u.goal.illustration_ref).label;
      aiMsg.value = ''; goldMsg.value = '';
      if (!stepsOf(u.loc.id).length) await addStep(u.loc.id);
    };
    const runAi = async () => {
      const u = active.value;
      if (steps.value.some((s) => s.description.trim()) && !confirm('いまの工程はAIの案で置き換わります。よろしいですか?')) return;
      aiBusy.value = true; aiMsg.value = '';
      try {
        const list = await decomposeSteps({ goalText: aiText.value.trim(), location: u.loc.location_category });
        await applyAiSteps(u.loc.id, list);
        aiMsg.value = 'AIの案を入れました。内容を確認して、必要なら直してください。';
      } catch (e) {
        aiMsg.value = e.message;
      }
      aiBusy.value = false;
    };
    const saveGold = () => run(async () => {
      await registerGoldExample(aiText.value, active.value.loc.id);
      goldMsg.value = 'お手本として登録しました。';
    });
    return { state, unitList, active, steps, aiText, aiBusy, aiMsg, goldMsg, open, runAi, saveGold, addStep, deleteStep, moveStep, reorderSteps, completeUnit, reopenUnit, info, MAX_STEPS };
  },
  template: `
    <section class="card clinical">
      <template v-if="!active">
        <h2>工程に分けて、工夫を つけよう</h2>
        <p class="muted">目標ごとに 1つずつ 作業します(順番は自由)。すべて「完了」になると次へ進めます。</p>
        <div class="unit-list">
          <button v-for="u in unitList" :key="u.key" class="unit-card" :class="{ done: state.completedUnits[u.key] }" @click="open(u)">
            <Illust :value="u.goal.illustration_ref" :size="64" />
            <div class="unit-meta">
              <b>{{ u.label }}<span v-if="u.shared" class="tag-pill">共通</span></b>
              <span class="muted">{{ state.completedUnits[u.key] ? '✅ 完了' : '未完了' }}</span>
            </div>
          </button>
        </div>
      </template>

      <template v-else>
        <div class="unit-head">
          <button class="link" @click="state.activeUnit = null">← 目標の一覧へ</button>
          <Illust :value="active.goal.illustration_ref" :size="56" />
          <h2>{{ info(active.goal.illustration_ref).label }} <small>@ {{ active.label }}</small></h2>
        </div>
        <p v-if="active.shared" class="notice small">「同じ工夫」モード: {{ active.label }} に同じ内容をコピーします(完了時)。</p>

        <div class="ai-panel">
          <div class="ai-title">🤖 AIで工程の案を作る <span class="muted small">(案を出すだけ。確認・修正はセラピストが行います)</span></div>
          <label>目標の説明<input v-model="aiText" maxlength="100" placeholder="例: 食事(スプーンで自分で食べる)"></label>
          <p class="warn small">⚠ 氏名・学校名・写真などの個人情報は書かないでください(この文だけが送信されます)。</p>
          <div class="row">
            <button class="secondary" :disabled="aiBusy || !aiText.trim()" @click="runAi">{{ aiBusy ? '考え中…' : '工程案を作る' }}</button>
            <button class="secondary" :disabled="!steps.length" title="今の工程を、AIが参考にするお手本として登録" @click="saveGold">⭐ この工程をお手本に登録</button>
          </div>
          <p v-if="aiMsg" class="small" :class="{ error: aiMsg.includes('利用できません') }">{{ aiMsg }}</p>
          <p v-if="goldMsg" class="small">{{ goldMsg }}</p>
        </div>

        <div class="steps" v-sortable="(from, to) => reorderSteps(active.loc.id, from, to)">
          <StepCard v-for="(s, i) in steps" :key="s.id" :step="s" :goal-ref="active.goal.illustration_ref" :index="i" :count="steps.length"
            @up="moveStep(active.loc.id, i, -1)" @down="moveStep(active.loc.id, i, 1)" @remove="deleteStep(s)" />
        </div>
        <div class="steps-foot">
          <button class="secondary" :disabled="steps.length >= MAX_STEPS" @click="addStep(active.loc.id)">＋ 工程を追加({{ steps.length }}/{{ MAX_STEPS }})</button>
          <button class="primary big" :disabled="state.busy" @click="completeUnit(active)">この目標を完了 ✔</button>
        </div>
      </template>
    </section>`,
};
