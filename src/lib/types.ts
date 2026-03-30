export type PatternType = 'crochet' | 'knitting';
export type FileType = 'image' | 'pdf';

export interface Pattern {
  id: string;
  user_id: string;
  title: string;
  type: PatternType;
  file_url: string;
  file_type: FileType;
  thumbnail_url: string | null;
  total_rows: number;
  yarn: string;
  needle: string;
  file_size?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CompletedMark {
  y: number;      // position % along the primary axis (top for vertical, left for horizontal)
  height: number; // size % along the primary axis
  orientation?: 'horizontal'; // omitted = vertical (default)
}

export type RulerDirection = 'up' | 'down';
export type RulerOrientation = 'vertical' | 'horizontal';

export interface NotePosition {
  x: number;  // content % (0-100)
  y: number;  // content %
}

export interface CrochetMark {
  id: string;
  x: number;  // content %
  y: number;  // content %
  label: string;
}

export interface KnittingMark {
  id: string;
  x: number;     // content %
  y: number;     // content %
  label: string;
}

export interface SubPattern {
  id: string;
  name: string;
  total_rows: number;
  current_row: number;
}

export interface PatternProgress {
  id: string;
  pattern_id: string;
  user_id: string;
  current_row: number;
  ruler_position_y: number;
  ruler_height: number;
  ruler_direction: RulerDirection;
  completed_marks: CompletedMark[];
  notes: Record<string, string>;
  note_positions: Record<string, NotePosition>;
  sub_patterns: SubPattern[];
  active_sub_pattern_id: string;
  crochet_marks: CrochetMark[];
  knitting_marks: KnittingMark[];
  view_scale?: number | null;
  view_x?: number | null;
  view_y?: number | null;
  crochet_ruler_data?: unknown;
  ruler_orientation?: string | null;
  ruler_position_x?: number | null;
  updated_at: string;
}

export interface PatternWithProgress extends Pattern {
  progress: PatternProgress | null;
}
