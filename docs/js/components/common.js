import { ref, computed, watch, onMounted } from 'vue';
import { info } from '../store.js';
import { axisShares } from '../data/master.js';

// イラスト表示。今は絵文字プレースホルダー、独自イラスト(custom:)は画像。
export const Illust = {
  props: { value: String, size: { type: Number, default: 96 }, label: { type: Boolean, default: true } },
  setup(props) {
    return { i: () => info(props.value) };
  },
  template: `
    <div class="illust" :style="{ width: size + 'px' }">
      <div class="illust-frame" :style="{ width: size + 'px', height: size + 'px', background: i().color }">
        <img v-if="i().image" :src="i().image" :alt="i().label">
        <span v-else :style="{ fontSize: size * 0.55 + 'px' }">{{ i().emoji }}</span>
      </div>
      <div v-if="label" class="illust-label">{{ i().label }}</div>
    </div>`,
};

// 基本方針スライダー用。数字の目盛りは出さず、合計10の割合(はじめは 5:5)で見せる。値は -5〜+5 の整数で保存(右へ動かすと右の割合が増える)
export const AxisSlider = {
  props: { modelValue: Number, left: String, right: String, leftIcon: String, rightIcon: String },
  emits: ['update:modelValue'],
  setup(props) {
    const shares = computed(() => axisShares(props.modelValue));
    const pos = computed(() => Math.max(-4, Math.min(4, Number(props.modelValue) || 0)));
    return { shares, pos };
  },
  template: `
    <div class="axis">
      <div class="axis-ends"><span>{{ leftIcon }} {{ left }}</span><span>{{ right }} {{ rightIcon }}</span></div>
      <div class="axis-bar" aria-hidden="true">
        <span class="l" :style="{ flexGrow: shares.left }"><b>{{ shares.left }}</b></span>
        <span class="r" :style="{ flexGrow: shares.right }"><b>{{ shares.right }}</b></span>
      </div>
      <input type="range" min="-4" max="4" step="1" :value="pos" :aria-label="left + ' ' + shares.left + ' 対 ' + shares.right + ' ' + right" @input="$emit('update:modelValue', Number($event.target.value))">
    </div>`,
};

// ドラムロール(くるくる回して選ぶ)。スマホは指で、PCはマウスホイール・クリック・↑↓キーで選べる
// options: [{ value, label }]。行の高さは40px固定(CSSの .wheel と合わせる)
const WHEEL_ROW = 40;
export const WheelPicker = {
  props: { modelValue: [Number, String], options: Array, ariaLabel: String },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const list = ref(null);
    let timer = 0;
    const index = () => Math.max(0, props.options.findIndex((o) => o.value === props.modelValue));
    const goTo = (i, smooth) => list.value?.scrollTo({ top: i * WHEEL_ROW, behavior: smooth ? 'smooth' : 'auto' });
    onMounted(() => goTo(index(), false));
    watch(() => props.modelValue, () => { if (list.value && Math.round(list.value.scrollTop / WHEEL_ROW) !== index()) goTo(index(), true); });
    const settle = () => {
      const i = Math.min(props.options.length - 1, Math.max(0, Math.round(list.value.scrollTop / WHEEL_ROW)));
      const v = props.options[i].value;
      if (v !== props.modelValue) emit('update:modelValue', v);
    };
    const onScroll = () => { clearTimeout(timer); timer = setTimeout(settle, 90); };
    const choose = (i) => { goTo(i, true); emit('update:modelValue', props.options[i].value); };
    const onKey = (e) => {
      const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      choose(Math.min(props.options.length - 1, Math.max(0, index() + d)));
    };
    return { list, onScroll, choose, onKey, index };
  },
  template: `
    <div class="wheel">
      <div ref="list" class="wheel-list" tabindex="0" role="listbox" :aria-label="ariaLabel" @scroll="onScroll" @keydown="onKey">
        <div v-for="(o, i) in options" :key="i" class="wheel-item" :class="{ on: i === index() }" role="option" :aria-selected="i === index()" @click="choose(i)">{{ o.label }}</div>
      </div>
    </div>`,
};
