// ステップ9: Excel出力(SheetJS・ブラウザ内処理)。レイアウトは仮(保留事項に記載)。
import { catOf } from './data/master.js';
import { illustInfo } from './data/illustrations.js';

function loadSheetJs() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('Excel出力ライブラリを読み込めませんでした'));
    document.head.appendChild(s);
  });
}

const fmtDate = (iso) => (iso ? iso.slice(0, 10) : '');

// state から3つのシートの行データを作る(純粋関数)
export function buildSheets(st) {
  const label = (ref) => illustInfo(ref, st.customIllustrations).label;
  const roleOf = (pid) => st.participants.find((p) => p.id === pid)?.role || '';
  const tagOf = (id) => st.tags.find((t) => t.id === id);

  const info = [
    ['対象児ID', st.child.child_code], ['区分', st.child.is_test ? 'テスト' : '本番'], ['年齢', st.child.age ?? ''], ['性別', st.child.sex ?? ''],
    ['実施日', fmtDate(st.session.held_at)], ['期間(月)', st.session.duration_months],
    ['中間確認日', st.session.mid_review_date || ''], ['最後の振り返り日', st.session.next_review_date || ''],
    ['参加者', [...st.sessionParticipants].sort((a, b) => a.turn_order - b.turn_order).map((sp) => roleOf(sp.participant_id)).join('、')],
    ['担当セラピスト', st.user?.name || ''],
  ];

  const plan = [['優先順位', '目標', '場所', '戦略モード', '工程No.', '工程', '現状レベル(0=イージー〜10=ハード)', '調整カテゴリ', '工夫タグ', '補足メモ']];
  for (const g of [...st.goals].sort((a, b) => a.priority - b.priority)) {
    for (const loc of st.goalLocations.filter((l) => l.goal_id === g.id)) {
      const steps = st.subSteps.filter((s) => s.goal_location_id === loc.id).sort((a, b) => a.step_order - b.step_order);
      const mode = loc.strategy_mode === 'per_location' ? '場所ごとに変える' : '同一';
      for (const s of steps) {
        const links = st.subStepTags.filter((l) => l.sub_step_id === s.id);
        const base = [g.priority, label(g.illustration_ref), loc.location_category, mode, s.step_order, s.description, s.difficulty_score];
        if (!links.length) plan.push([...base, '', '', '']);
        for (const l of links) {
          const t = tagOf(l.tag_id);
          plan.push([...base, t ? catOf(t.category).label : '', t?.description || '', l.memo || '']);
        }
      }
    }
  }

  const picks = [['参加者(役割)', '順番', '状態', '選んだイラスト', '選んだ理由', '目標に採用']];
  const goalRefs = new Set(st.goals.map((g) => g.illustration_ref));
  for (const sp of [...st.sessionParticipants].sort((a, b) => a.turn_order - b.turn_order)) {
    const sels = st.selections.filter((x) => x.participant_id === sp.participant_id);
    const status = { pending: '未', selected: '選択', skipped: 'スキップ' }[sp.turn_status] || sp.turn_status;
    if (!sels.length) picks.push([roleOf(sp.participant_id), sp.turn_order, status, '', '', '']);
    for (const x of sels) picks.push([roleOf(sp.participant_id), sp.turn_order, status, label(x.illustration_ref), x.reason || '', goalRefs.has(x.illustration_ref) ? '○' : '']);
  }

  const pol = st.policy;
  const policy = [
    ['項目', '値', '説明'],
    ['セーフティ⇔チャレンジ', pol?.safety_challenge_axis ?? '', '-5=セーフティ重視 〜 +5=チャレンジ重視'],
    ['個人のペース⇔集団のペース', pol?.pace_axis ?? '', '-5=個人のペース重視 〜 +5=集団のペース重視'],
    ['決めたタイミング', pol ? (pol.decided_timing === 'before_goal' ? '目標選択の前' : '目標選択の後') : '', ''],
  ];
  return { info, plan, picks, policy };
}

export async function exportPlan(st) {
  const XLSX = await loadSheetJs();
  const { info, plan, picks, policy } = buildSheets(st);
  const wb = XLSX.utils.book_new();
  const planSheet = XLSX.utils.aoa_to_sheet([['目標設定 計画書'], [], ...info, [], ...plan]);
  planSheet['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 8 }, { wch: 36 }, { wch: 18 }, { wch: 30 }, { wch: 30 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, planSheet, '計画書');
  const pickSheet = XLSX.utils.aoa_to_sheet(picks);
  pickSheet['!cols'] = [{ wch: 16 }, { wch: 6 }, { wch: 10 }, { wch: 20 }, { wch: 30 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, pickSheet, '目標選択の記録');
  const polSheet = XLSX.utils.aoa_to_sheet(policy);
  polSheet['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(wb, polSheet, '基本方針');
  XLSX.writeFile(wb, `目標設定計画書_${fmtDate(st.session.held_at)}.xlsx`);
}

// 名簿(ID ⇔ 名前)の出力。IDは文字列のまま出す(「001」の先頭の0が消えないように)
export async function exportRosterXlsx(rows) {
  const XLSX = await loadSheetJs();
  const head = ['対象児ID', '区分', '名前', '担当セラピスト', '年齢', '性別'];
  const body = [...rows]
    .sort((a, b) => Number(a.is_test) - Number(b.is_test) || String(a.child_code).localeCompare(String(b.child_code)))
    .map((r) => [String(r.child_code), r.is_test ? 'テスト' : '本番', r.name, r.therapist || '', r.age ?? '', r.sex ?? '']);
  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  ws['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 24 }, { wch: 20 }, { wch: 6 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '名簿');
  XLSX.writeFile(wb, `名簿_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
