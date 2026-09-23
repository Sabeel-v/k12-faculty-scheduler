export type ScheduleType =
  | 'SESSION 1'
  | 'SESSION 2'
  | 'PREDICTION LIVE'
  | 'MODEL EXAM'
  | 'MODEL QUESTION PAPER DISCUSSION';

export const SCHEDULE_TYPES: ScheduleType[] = [
  'SESSION 1',
  'SESSION 2',
  'PREDICTION LIVE',
  'MODEL EXAM',
  'MODEL QUESTION PAPER DISCUSSION'
];

export type ScheduleStatus = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';

export const SCHEDULE_STATUSES: ScheduleStatus[] = [
  'scheduled',
  'completed',
  'cancelled',
  'rescheduled'
];

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
  schedule_type: ScheduleType;
  content?: string | null;
  status: ScheduleStatus;
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
