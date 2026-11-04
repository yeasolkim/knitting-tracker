-- Library status for the dashboard: 진행 중 / 완성 / 보관
alter table patterns add column if not exists status text not null default 'active'
  check (status in ('active', 'done', 'archived'));
create index if not exists patterns_user_status_idx on patterns (user_id, status);
