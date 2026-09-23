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
  faculty?: {
    id: number;
    name: string;
  };
  subject?: {
    id: number;
    name: string;
  };
  class?: {
    id: number;
    name: string;
    batch?: string | null;
  };
}
