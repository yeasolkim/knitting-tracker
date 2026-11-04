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
  ruler_id?: string; // which ruler produced this mark (omitted = legacy / ruler 1)
}

export type RulerDirection = 'up' | 'down';
export type RulerOrientation = 'vertical' | 'horizontal';

/** One progress ruler (a pattern image can have several; exactly one is active). */
export interface Ruler {
  id: string;
  name: string;
  /** Sub-pattern whose row counter this ruler advances. Omitted = the active sub-pattern. */
  sub_id?: string;
  position_y: number;  // image % (vertical rulers)
  position_x: number;  // image % (horizontal rulers)
  height: number;      // image % of imgH (vertical) or imgW (horizontal)
  direction: RulerDirection;
  orientation: RulerOrientation;
  rotation: number;    // degrees, -45..45
  color: string;       // hex
}

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
  /** Repeat section: rows [repeat_start, repeat_start + repeat_rows*repeat_count). Off when rows/count are 0 or absent. */
  repeat_start?: number;
  repeat_rows?: number;
  repeat_count?: number;
}

export interface DrawPoint {
  x: number; // image-relative %
  y: number; // image-relative %
}

export type DrawTool = 'pen' | 'eraser' | 'line' | 'rect' | 'circle' | 'select';

export interface DrawPath {
  id: string;
  points: DrawPoint[];
  color: string;
  width: number; // logical px at scale=1 (legacy)
  widthPct?: number; // image-relative % — device-independent, takes priority over width
  opacity: number; // 0-100, default 100
  tool: DrawTool;
}

export interface ImagePerState {
  // Multi-ruler state. When present it is authoritative; the ruler_* fields below
  // mirror rulers[0] for older clients.
  rulers?: Ruler[];
  active_ruler_id?: string;
  ruler_position_y?: number;
  ruler_height?: number;
  max_ruler_height?: number;
  ruler_position_x?: number;
  ruler_direction?: RulerDirection;
  ruler_orientation?: RulerOrientation;
  ruler_rotation?: number;
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
  drawing_paths?: DrawPath[];
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
  ruler_rotation?: number | null;
  image_states?: ImagePerState[];
  updated_at: string;
}

export interface PatternWithProgress extends Pattern {
  progress: PatternProgress | null;
}
