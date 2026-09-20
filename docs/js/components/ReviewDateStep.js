import { CalendarPage } from './CalendarPage.js';

// ステップ8: 振り返り日の設定。「みんなで、いま・この場で」カレンダーに日を置く。
//   🏁 最後の日(かならず) → 📌 中間確認日を決めるかどうかの促し(なくてもOK)
export const ReviewDateStep = {
  components: { CalendarPage },
  template: `
    <section class="card">
      <h2>📅 つぎは いつ ふりかえりますか?</h2>
      <p class="muted">みんなで日にちを決めましょう。はじめに期間の終わりの日が入っています。変えてもOKです。決めた日は、このカレンダーにのこります。途中の確認日も決めたいときは、「📌 中間確認日」をおしてください(なくてもOK)。</p>
      <CalendarPage mode="wizard" />
    </section>`,
};
