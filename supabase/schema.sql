-- ADOC-S連携 目標設定アプリ: Supabase スキーマ(設計まとめ 4章のER図に対応)
-- 使い方: Supabase の SQL Editor に貼って実行。まだ本番プロジェクトには適用していません。
-- 設計からの変更点(保留事項.md にも記載):
--   * SUB_STEP.order は予約語のため step_order に変更
--   * custom_illustration を追加(写真→イラスト化した独自イラストの保存先URL。illustration_ref='custom:<id>')
--   * CHILD.name は廃止し child_code(対象児ID)に変更。実名は child_roster(名簿)に分けて保存し、専用の関数(RPC)経由でしか読み書きできない
--   * 全テーブルに Row Level Security。セラピストは自分の CHILD 配下のデータだけ読み書きできる

create extension if not exists pgcrypto;

create table therapist_account (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  created_at timestamptz not null default now()
);

create table child (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references therapist_account(id) on delete cascade,
  child_code text not null unique, -- 対象児ID(全セラピスト通して一意。実名はここに持たない。名簿は child_roster)
  is_test boolean not null default false, -- テスト用の対象児(集計から除外するための印。IDの範囲とは別に持つ)
  age int,
  sex text,
  created_at timestamptz not null default now()
);

-- 対象児IDの連番。本番=001〜999(3桁)、テスト=1001〜(4桁)。番号はDBが振る(重複・取り合いを防ぐ)
create sequence child_code_seq start 1 maxvalue 999;
create sequence child_code_test_seq start 1001;

create function next_child_code(p_test boolean) returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_test then
    return nextval('child_code_test_seq')::text;
  end if;
  return lpad(nextval('child_code_seq')::text, 3, '0'); -- 999を超えるとエラー(テスト番号との衝突を防ぐ)
end $$;
revoke all on function next_child_code(boolean) from public;
grant execute on function next_child_code(boolean) to authenticated;

create table participant (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references child(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now()
);

create table session (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references child(id) on delete cascade,
  duration_months int not null,
  held_at timestamptz not null default now(),
  next_review_date date,
  created_at timestamptz not null default now()
);

create table session_participant (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references session(id) on delete cascade,
  participant_id uuid not null references participant(id) on delete cascade,
  turn_order int not null,
  turn_status text not null default 'pending' check (turn_status in ('pending', 'selected', 'skipped')),
  created_at timestamptz not null default now()
);

create table illustration_selection (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references session(id) on delete cascade,
  participant_id uuid not null references participant(id) on delete cascade,
  illustration_ref text not null,
  selected_at timestamptz not null default now(),
  reason text,
  created_at timestamptz not null default now()
);

create table goal (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references session(id) on delete cascade,
  illustration_ref text not null,
  priority int not null check (priority between 1 and 3),
  created_at timestamptz not null default now()
);

create table policy_weight (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references session(id) on delete cascade,
  safety_challenge_axis int not null check (safety_challenge_axis between -5 and 5),
  pace_axis int not null check (pace_axis between -5 and 5),
  decided_timing text not null check (decided_timing in ('before_goal', 'after_goal')),
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table goal_location (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goal(id) on delete cascade,
  location_category text not null,
  strategy_mode text not null default 'shared' check (strategy_mode in ('shared', 'per_location')),
  created_at timestamptz not null default now()
);

create table sub_step (
  id uuid primary key default gen_random_uuid(),
  goal_location_id uuid not null references goal_location(id) on delete cascade,
  step_order int not null,
  description text not null default '',
  difficulty_score int check (difficulty_score between 0 and 10),
  created_at timestamptz not null default now()
);

create table tag (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('tool_env', 'support_cue', 'activity_form')),
  description text not null,
  created_at timestamptz not null default now(),
  unique (category, description)
);

create table sub_step_tag (
  id uuid primary key default gen_random_uuid(),
  sub_step_id uuid not null references sub_step(id) on delete cascade,
  tag_id uuid not null references tag(id),
  memo text,
  created_at timestamptz not null default now(),
  unique (sub_step_id, tag_id)
);

-- お手本(Few-shot用)。他テーブルとは独立したマスタ
create table gold_example (
  id uuid primary key default gen_random_uuid(),
  goal_description text not null,
  sub_steps_json jsonb not null,
  created_at timestamptz not null default now()
);

create table custom_illustration (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references therapist_account(id) on delete cascade,
  label text not null,
  image_url text not null,
  created_at timestamptz not null default now()
);

create index on child (therapist_id);
create index on participant (child_id);
create index on session (child_id);
create index on session_participant (session_id);
create index on illustration_selection (session_id);
create index on goal (session_id);
create index on goal_location (goal_id);
create index on sub_step (goal_location_id);
create index on sub_step_tag (sub_step_id);

/* ---------- Row Level Security ---------- */
-- 所有判定ヘルパー(RLSの再帰を避けるため security definer)
create function owns_child(cid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from child where id = cid and therapist_id = auth.uid()) $$;

create function owns_session(sid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from session s join child c on c.id = s.child_id where s.id = sid and c.therapist_id = auth.uid()) $$;

create function owns_goal(gid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from goal g join session s on s.id = g.session_id join child c on c.id = s.child_id where g.id = gid and c.therapist_id = auth.uid()) $$;

create function owns_goal_location(glid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from goal_location gl join goal g on g.id = gl.goal_id join session s on s.id = g.session_id join child c on c.id = s.child_id where gl.id = glid and c.therapist_id = auth.uid()) $$;

create function owns_sub_step(ssid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from sub_step ss join goal_location gl on gl.id = ss.goal_location_id join goal g on g.id = gl.goal_id join session s on s.id = g.session_id join child c on c.id = s.child_id where ss.id = ssid and c.therapist_id = auth.uid()) $$;

alter table therapist_account enable row level security;
alter table child enable row level security;
alter table participant enable row level security;
alter table session enable row level security;
alter table session_participant enable row level security;
alter table illustration_selection enable row level security;
alter table goal enable row level security;
alter table policy_weight enable row level security;
alter table goal_location enable row level security;
alter table sub_step enable row level security;
alter table tag enable row level security;
alter table sub_step_tag enable row level security;
alter table gold_example enable row level security;
alter table custom_illustration enable row level security;

create policy own_account on therapist_account for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy own_child on child for all to authenticated using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy own_participant on participant for all to authenticated using (owns_child(child_id)) with check (owns_child(child_id));
create policy own_session on session for all to authenticated using (owns_child(child_id)) with check (owns_child(child_id));
create policy own_session_participant on session_participant for all to authenticated using (owns_session(session_id)) with check (owns_session(session_id));
create policy own_selection on illustration_selection for all to authenticated using (owns_session(session_id)) with check (owns_session(session_id));
create policy own_goal on goal for all to authenticated using (owns_session(session_id)) with check (owns_session(session_id));
create policy own_policy on policy_weight for all to authenticated using (owns_session(session_id)) with check (owns_session(session_id));
create policy own_goal_location on goal_location for all to authenticated using (owns_goal(goal_id)) with check (owns_goal(goal_id));
create policy own_sub_step on sub_step for all to authenticated using (owns_goal_location(goal_location_id)) with check (owns_goal_location(goal_location_id));
create policy own_sub_step_tag on sub_step_tag for all to authenticated using (owns_sub_step(sub_step_id)) with check (owns_sub_step(sub_step_id));
create policy own_custom_illustration on custom_illustration for all to authenticated using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());

-- タグ・お手本は全セラピスト共通の辞書(閲覧・追加のみ。編集・削除は不可)。誰が登録できるかは保留事項
create policy tag_read on tag for select to authenticated using (true);
create policy tag_add on tag for insert to authenticated with check (true);
create policy gold_read on gold_example for select to authenticated using (true);
create policy gold_add on gold_example for insert to authenticated with check (true);

-- 休止防止のpingは Edge Function「health-check」が担当(supabase/functions/health-check)

/* ---------- 名簿(ID ⇔ 実名) ---------- */
-- 目標データと分けた別テーブル。RLSを有効にして「ポリシーを1つも作らない」ので、
-- 一般ユーザーは表を直接読み書きできない(service_role と、下の関数(security definer)だけが触れる)。
create table child_roster (
  child_id uuid primary key references child(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0), -- フルネームでもイニシャルでも可(形式は自由)
  updated_at timestamptz not null default now()
);
alter table child_roster enable row level security;

-- 名簿の一括出力ができるセラピスト。クライアントからは見えない(ポリシーなし)。オーナーがSQL Editorで追加する:
--   insert into roster_export_permission (therapist_id) select id from therapist_account where email = 'あなたのメール';
create table roster_export_permission (
  therapist_id uuid primary key references therapist_account(id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table roster_export_permission enable row level security;

-- 自分の担当の対象児の名前を登録・修正
create function roster_set(p_child_id uuid, p_name text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not owns_child(p_child_id) then raise exception 'forbidden'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'name is required'; end if;
  insert into child_roster (child_id, name) values (p_child_id, btrim(p_name))
  on conflict (child_id) do update set name = excluded.name, updated_at = now();
end $$;

-- 自分の担当の対象児の名前だけを返す(画面での表示・検索用)
create function roster_mine() returns table (child_id uuid, name text) language sql stable security definer set search_path = public as $$
  select r.child_id, r.name from child_roster r join child c on c.id = r.child_id where c.therapist_id = auth.uid()
$$;

-- 一括出力の権限があるか(ボタンを出すかどうかの判定用)
create function roster_can_export() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from roster_export_permission where therapist_id = auth.uid())
$$;

revoke all on function roster_set(uuid, text), roster_mine(), roster_can_export() from public;
grant execute on function roster_set(uuid, text), roster_mine(), roster_can_export() to authenticated;
-- 全体の一括出力は Edge Function「roster-export」だけが行う(権限の確認 + パスワード再確認つき)。

/* ---------- 初期データ(設計まとめ 7章 / 3章) ---------- */
insert into tag (category, description) values
  ('tool_env', '補助具を使う'), ('tool_env', '道具の形状・素材を変える'), ('tool_env', '配置を変える'),
  ('tool_env', '照明・音を調整する'), ('tool_env', '実施場所を変える'),
  ('support_cue', '支援量を増減する'), ('support_cue', '支援のタイミングを変える'), ('support_cue', '声かけの量を増減する'),
  ('support_cue', '視覚的な手がかりを使う(絵カード・タイマー)'), ('support_cue', '支援者を変える'),
  ('activity_form', '手順を増減する'), ('activity_form', '取り組む量・回数を増減する'), ('activity_form', '実施する姿勢・体勢を変える'),
  ('activity_form', '別の活動に置き換える'), ('activity_form', '目標水準を調整する')
on conflict do nothing;

insert into gold_example (goal_description, sub_steps_json) values
  ('食事動作(自分で食事を食べる)', '[
    {"order":1,"description":"今日の食事を認識する"},
    {"order":2,"description":"食具を手に取る"},
    {"order":3,"description":"食具から食事に向かって手を伸ばす"},
    {"order":4,"description":"食事をすくう"},
    {"order":5,"description":"口元に持ってきて口に取り込んで食べる"}
  ]'::jsonb);
