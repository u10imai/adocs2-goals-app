import { ref } from 'vue';
import { state, addCustomIllustration, run } from '../store.js';
import { photoToIllustration, saveIllustrationImage } from '../photo.js';

// AI機能①: 写真→イラスト化して、独自イラストとして追加する。
// 写真は端末外に送らない。保存の直前に同意確認を出す。
export const PhotoDialog = {
  emits: ['close', 'added'],
  setup(props, { emit }) {
    const converted = ref('');
    const label = ref('');
    const err = ref('');
    const working = ref(false);
    const confirming = ref(false);

    const onFile = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      err.value = ''; working.value = true;
      try { converted.value = await photoToIllustration(file); } catch (x) { err.value = x.message; }
      working.value = false;
      e.target.value = '';
    };
    const save = async () => {
      confirming.value = false;
      await run(async () => {
        const url = await saveIllustrationImage(converted.value, { demo: state.isDemo });
        const ref_ = await addCustomIllustration(label.value, url);
        emit('added', ref_);
        emit('close');
      });
    };
    return { state, converted, label, err, working, confirming, onFile, save };
  },
  template: `
    <div class="modal-back" @click.self="$emit('close')">
      <div class="modal">
        <h3>📷 写真から イラストを つくる</h3>
        <p class="muted">写真はこの端末の中だけで イラストに変えます。写真そのものは、どこにも送られません。</p>

        <input type="file" accept="image/*" capture="environment" @change="onFile">
        <p v-if="working">へんかん中…</p>
        <p v-if="err" class="error">{{ err }}</p>

        <div v-if="converted" class="preview">
          <img :src="converted" alt="変換後のイラスト">
          <label>なまえ<input v-model="label" placeholder="例: あさごはん" maxlength="20"></label>
          <p class="muted small">※いまは簡易変換(仮)です。</p>
        </div>

        <div class="modal-actions">
          <button class="secondary" @click="$emit('close')">やめる</button>
          <button class="primary" :disabled="!converted || !label.trim()" @click="confirming = true">保存する</button>
        </div>

        <div v-if="confirming" class="modal-back inner" @click.self="confirming = false">
          <div class="modal small">
            <p><b>目標データは安全なクラウドに保存されますが、よろしいですか?</b></p>
            <p class="muted small">保存されるのは変換後のイラストだけです(元の写真は保存されません)。</p>
            <div class="modal-actions">
              <button class="secondary" @click="confirming = false">やめる</button>
              <button class="primary" @click="save">はい、保存する</button>
            </div>
          </div>
        </div>
      </div>
    </div>`,
};
