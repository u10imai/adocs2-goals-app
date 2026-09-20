import { info } from '../store.js';

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

// 基本方針スライダー用(-5〜+5)
export const AxisSlider = {
  props: { modelValue: Number, left: String, right: String, leftIcon: String, rightIcon: String },
  emits: ['update:modelValue'],
  template: `
    <div class="axis">
      <div class="axis-ends"><span>{{ leftIcon }} {{ left }}</span><span>{{ right }} {{ rightIcon }}</span></div>
      <input type="range" min="-5" max="5" step="1" :value="modelValue" @input="$emit('update:modelValue', Number($event.target.value))">
      <div class="axis-scale"><span>-5</span><span>0</span><span>+5</span></div>
    </div>`,
};
