export type PatternType = 'crochet' | 'knitting';
export type FileType = 'image' | 'pdf';

export interface ExtraPatternFile {
  url: string;
  thumbnail_url: string | null;
  file_type?: FileType;
  name?: string;
}

export interface Pattern {
  id: string;
  user_id: string;
  title: string;
  type: PatternType;
  file_url: string;
  file_type: FileType;
  thumbnail_url: string | null;
  extra_image_urls?: ExtraPatternFile[];
  total_rows: number;
  yarn: string;
  needle: string;
  file_size?: number | null;
  image_names?: string[];
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

export interface ImagePerState {
  ruler_position_y?: number;
  ruler_height?: number;
  ruler_position_x?: number;
  ruler_direction?: RulerDirection;
  ruler_orientation?: RulerOrientation;
  active_sub_id?: string;
  completed_marks?: CompletedMark[];
  knitting_marks?: KnittingMark[];
  crochet_marks?: CrochetMark[];
  crochet_ruler_data?: {
    shape?: string;
    cx?: number;
    cy?: number;
    r?: number;
    ry?: number;
    rowHeight?: number;
    rotation?: number;
    completedRings?: (number | { cx: number; cy: number; r: number; ry?: number; shape?: string })[];
  };
  notes?: Record<string, string>;
  note_positions?: Record<string, NotePosition>;
  // View transform saved as image-relative % (device-independent)
  // view_x: screen-center x as % of image width (0-100)
  // view_y: screen-center y as % of image height (0-100)
  // view_scale: absolute CSS scale at save time
  // view_fit_scale: fit-width scale (containerW/imgW) at save time — used to normalize
  //   view_scale across devices: restore_scale = view_scale * (current_fitW / view_fit_scale)
  view_scale?: number;
  view_fit_scale?: number;
  view_x?: number;
  view_y?: number;
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
  image_states?: ImagePerState[];
  updated_at: string;
}

export interface PatternWithProgress extends Pattern {
  progress: PatternProgress | null;
}
