import { state } from '../store.js';
import { AxisSlider } from './common.js';

// ステップ2(仮)・ステップ5(確定)で共用。mode: 'draft' | 'confirm'
export const PolicyStep = {
  components: { AxisSlider },
  props: { mode: { type: String, default: 'draft' } },
  setup() {
    return { state, p: state.draft.policy };
  },
  template: `
    <section class="card">
      <h2>{{ mode === 'draft' ? 'めざす方向を ざっくり きめよう(仮)' : 'めざす方向の 確認(確定)' }}</h2>
      <p v-if="mode === 'draft'" class="muted">目標をえらぶ前の「考え方の傾き」です。あとで確定するので、迷ったらスキップしても大丈夫です。</p>
      <p v-else-if="state.policy" class="muted">ステップ2で決めた内容です。変える場合はスライダーを動かしてください。</p>
      <p v-else class="muted">ステップ2をスキップしたので、ここで決めます。目標を見たうえでの、考え方の傾きを選んでください。</p>
      <p class="muted small">はじめは半分ずつ(5:5)です。スライダーを動かすと、重視する側の割合が増えます。</p>

      <div class="axis-block">
        <h3>セーフティ ⇔ チャレンジ</h3>
        <AxisSlider v-model="p.safety" left="セーフティ重視" right="チャレンジ重視" leftIcon="🛡️" rightIcon="🚀" />
      </div>
      <div class="axis-block">
        <h3>個人のペース ⇔ 集団のペース</h3>
        <AxisSlider v-model="p.pace" left="個人のペース重視" right="集団のペース重視" leftIcon="🐢" rightIcon="👥" />
      </div>
    </section>`,
};
