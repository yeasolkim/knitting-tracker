-- Knitting Pattern Tracker Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Patterns table
create table if not exists patterns (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  type text not null check (type in ('crochet', 'knitting')),
  file_url text not null default '',
  file_type text not null check (file_type in ('image', 'pdf')),
  thumbnail_url text,
  total_rows integer not null default 1,
  yarn text not null default '',
  needle text not null default '',
  file_size bigint,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Pattern progress table
create table if not exists pattern_progress (
  id uuid default uuid_generate_v4() primary key,
  pattern_id uuid references patterns(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  current_row integer not null default 0,
  ruler_position_y float not null default 50,
  ruler_height float not null default 5,
  ruler_direction text not null default 'up',
  completed_marks jsonb not null default '[]',
  notes jsonb not null default '{}',
  note_positions jsonb not null default '{}',
  sub_patterns jsonb not null default '[]',
  active_sub_pattern_id text not null default '',
  crochet_marks jsonb not null default '[]',
  knitting_marks jsonb not null default '[]',
  view_scale float,
  view_x float,
  view_y float,
  updated_at timestamptz default now() not null,
  unique(pattern_id, user_id)
);

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger patterns_updated_at
  before update on patterns
  for each row execute function update_updated_at();

create trigger pattern_progress_updated_at
  before update on pattern_progress
  for each row execute function update_updated_at();

-- RLS Policies
alter table patterns enable row level security;
alter table pattern_progress enable row level security;

-- Patterns: users can only access their own
create policy "Users can view own patterns"
  on patterns for select
  using (auth.uid() = user_id);

create policy "Users can insert own patterns"
  on patterns for insert
  with check (auth.uid() = user_id);

create policy "Users can update own patterns"
  on patterns for update
  using (auth.uid() = user_id);

create policy "Users can delete own patterns"
  on patterns for delete
  using (auth.uid() = user_id);

-- Pattern progress: users can only access their own
create policy "Users can view own progress"
  on pattern_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert own progress"
  on pattern_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own progress"
  on pattern_progress for update
  using (auth.uid() = user_id);

create policy "Users can delete own progress"
  on pattern_progress for delete
  using (auth.uid() = user_id);

-- Storage bucket (run in Supabase Dashboard > Storage)
-- Create bucket 'pattern-files' with public access
-- Or run:
insert into storage.buckets (id, name, public)
values ('pattern-files', 'pattern-files', true)
on conflict (id) do nothing;

-- Storage RLS
create policy "Users can upload own pattern files"
  on storage.objects for insert
  with check (
    bucket_id = 'pattern-files' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Anyone can view pattern files"
  on storage.objects for select
  using (bucket_id = 'pattern-files');

create policy "Users can delete own pattern files"
  on storage.objects for delete
  using (
    bucket_id = 'pattern-files' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Indexes
-- Composite index for dashboard query: WHERE user_id = ? ORDER BY updated_at DESC
create index if not exists idx_patterns_user_updated on patterns(user_id, updated_at desc);
-- pattern_progress is always accessed by (pattern_id, user_id) together via the unique constraint
create index if not exists idx_pattern_progress_pattern_id on pattern_progress(pattern_id);

-- Migration: multiple images per pattern
-- Run this if you already have an existing patterns table:
alter table patterns add column if not exists extra_image_urls jsonb not null default '[]';

-- Migration: per-image state isolation
-- Stores ruler/marks/notes state for each image index independently
alter table pattern_progress add column if not exists image_states jsonb not null default '[]';
