import { ref } from 'vue';
import { state, login, register, demoLogin, createChild, pickChild, nameOf, exportRoster } from '../store.js';

// ステップ0: ログイン + 対象児の選択
export const LoginStep = {
  setup() {
    const mode = ref('login'); // login | register
    const f = ref({ name: '', email: '', password: '' });
    const newChild = ref({ name: '', isTest: state.isDemo, age: '', sex: '' });
    const query = ref('');
    const showExport = ref(false);
    const pw = ref('');
    const exported = ref(false);
    const doExport = async () => { exported.value = false; exported.value = !!(await exportRoster(pw.value)); pw.value = ''; }; // デモモードは最初から「テスト」
    const openAdd = () => { adding.value = true; };
    const sorted = () => {
      const q = query.value.trim().toLowerCase();
      return [...state.children]
        .filter((c) => !q || c.child_code.includes(q) || nameOf(c.id).toLowerCase().includes(q))
        .sort((a, b) => a.is_test - b.is_test || a.child_code.localeCompare(b.child_code));
    };
    const adding = ref(false);
    const submit = () => (mode.value === 'login' ? login(f.value.email, f.value.password) : register(f.value.name, f.value.email, f.value.password));
    return { state, mode, f, newChild, adding, openAdd, sorted, query, showExport, pw, exported, doExport, nameOf, submit, demoLogin, createChild, pickChild };
  },
  template: `
    <section class="card center-card">
      <template v-if="!state.user">
        <h1>🌈 もくひょうを いっしょに きめよう</h1>
        <p class="lead">セラピストのログイン</p>

        <form v-if="!state.isDemo" @submit.prevent="submit" class="form">
          <label v-if="mode==='register'">お名前<input v-model="f.name" required autocomplete="name"></label>
          <label>メールアドレス<input v-model="f.email" type="email" required autocomplete="email"></label>
          <label>パスワード<input v-model="f.password" type="password" required minlength="8" autocomplete="current-password"></label>
          <button class="primary big" :disabled="state.busy">{{ mode==='login' ? 'ログイン' : '新規登録' }}</button>
          <button type="button" class="link" @click="mode = mode==='login' ? 'register' : 'login'">
            {{ mode==='login' ? 'はじめての方はこちら(新規登録)' : 'アカウントをお持ちの方はこちら' }}
          </button>
        </form>

        <form v-else @submit.prevent="demoLogin(f.name)" class="form">
          <div class="notice">🧪 デモモードです。データはこのブラウザの中だけに保存されます(Supabase未接続)。</div>
          <label>お名前(なくてもOK)<input v-model="f.name" placeholder="例: 今井"></label>
          <button class="primary big">はじめる</button>
        </form>
      </template>

      <template v-else>
        <h1>だれの もくひょう?</h1>
        <p class="lead">{{ state.user.name }} さん、対象児をえらんでください</p>

        <input v-if="state.children.length > 3" v-model="query" class="search" placeholder="🔍 名前またはIDで検索">
        <div v-if="state.children.length" class="child-list">
          <button v-for="c in sorted()" :key="c.id" class="child-btn" @click="pickChild(c)">
            <span class="child-emoji">🧒</span>
            <span><b>{{ nameOf(c.id) || '(名前なし)' }}</b><span v-if="c.is_test" class="test-badge">テスト</span><small>ID {{ c.child_code }}　{{ c.age != null ? c.age + '歳' : '' }} {{ c.sex || '' }}</small></span>
            <span class="hint">既存の対象児で目標を再設定 →</span>
          </button>
        </div>
        <p v-else class="muted">まだ対象児がいません。下から登録してください。</p>

        <button v-if="!adding" class="secondary" @click="openAdd">＋ 新しい対象児を登録</button>
        <form v-else class="form box" @submit.prevent="createChild(newChild)">
          <label>名前(必須)
            <input v-model="newChild.name" required maxlength="40" placeholder="フルネームでもイニシャルでもOK">
          </label>
          <div class="chip-row">
            <button type="button" class="big-chip" :class="{ on: !newChild.isTest }" @click="newChild.isTest = false">本番</button>
            <button type="button" class="big-chip" :class="{ on: newChild.isTest }" @click="newChild.isTest = true">🧪 テスト</button>
          </div>
          <p class="muted small">IDは自動で振られます(本番は001から、テストは1001から)。名前は、目標のデータとは別の「名簿」に分けて保存されます。</p>
          <div class="row">
            <label>年齢<input v-model="newChild.age" type="number" min="0" max="30"></label>
            <label>性別
              <select v-model="newChild.sex"><option value="">未選択</option><option>男</option><option>女</option><option>その他</option></select>
            </label>
          </div>
          <button class="primary" :disabled="state.busy">IDを発行してはじめる</button>
        </form>

        <div v-if="state.canExportRoster" class="roster-export">
          <button v-if="!showExport" class="link" @click="showExport = true">🔐 名簿を出力(権限者のみ)</button>
          <form v-else class="inline-form" @submit.prevent="doExport">
            <input v-model="pw" type="password" required placeholder="もう一度パスワードを入力" autocomplete="current-password">
            <button class="secondary small" :disabled="state.busy">名簿をExcelで出力</button>
          </form>
          <p v-if="exported" class="ok small">✅ 出力しました。保管場所に注意してください。</p>
        </div>
      </template>
    </section>`,
};
