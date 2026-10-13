export interface Env {
  Bindings: {
    DB?: D1Database;
    ASSETS?: Fetcher;
    ADMIN_PASSWORD?: string;
  };
}

export interface Subject {
  id: number;
  name: string;
  status: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Faculty {
  id: number;
  subject_id: number;
  name: string;
  department?: string | null;
  phone?: string | null;
  status: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  subject?: {
    id: number;
    name: string;
  };
  subjects?: Array<{
    id: number;
    name: string;
  }>;
}

export interface ClassItem {
  id: number;
  name: string;
  batch?: string | null;
  academic_year?: string | null;
  status: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
  id: number;
  schedule_date: string;
  start_time: string;
  end_time?: string | null;
  class_id: number;
  subject_id: number;
  faculty_id: number;
  schedule_type: string;
  content?: string | null;
  status: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  platform?: 'app' | 'youtube';
  is_common?: boolean;
  classes?: Array<{
    id: number;
    name: string;
    batch?: string | null;
  }>;
  faculties?: Array<{
    id: number;
    name: string;
    department?: string | null;
    subject_id?: number;
    subject_name?: string;
  }>;
  faculty?: {
    id: number;
    name: string;
  };
  subject?: {
    id: number;
    name: string;
  } | null;
  class?: {
    id: number;
    name: string;
    batch?: string | null;
  };
}

export type YouTubeScheduleType = 'Live' | 'Content Video' | 'Shorts';

export interface YouTubeSchedule {
  id: number;
  schedule_date: string;
  start_time?: string | null;
  schedule_type: YouTubeScheduleType;
  is_common: number | boolean;
  subject_id?: number | null;
  content?: string | null;
  status: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  subject?: {
    id: number;
    name: string;
  } | null;
  classes: Array<{
    id: number;
    name: string;
    batch?: string | null;
  }>;
  faculties: Array<{
    id: number;
    name: string;
    department?: string | null;
    subject_id?: number;
    subject_name?: string;
  }>;
}
