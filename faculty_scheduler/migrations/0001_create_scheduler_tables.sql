-- Migration: 0001_create_scheduler_tables.sql
-- Cloudflare D1 / SQLite schema for Faculty Scheduler

-- 1. Subjects Table
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Faculty Table (Subject 1 -> N Faculty)
CREATE TABLE IF NOT EXISTS faculty (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  department TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT
);

-- Index for faculty.subject_id
CREATE INDEX IF NOT EXISTS idx_faculty_subject ON faculty(subject_id);

-- 3. Classes Table
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  batch TEXT,
  academic_year TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Schedules Table
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  class_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  faculty_id INTEGER NOT NULL,
  schedule_type TEXT NOT NULL,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE RESTRICT
);

-- Indexes for schedules
CREATE INDEX IF NOT EXISTS idx_schedules_schedule_date ON schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_schedules_faculty_id ON schedules(faculty_id);
CREATE INDEX IF NOT EXISTS idx_schedules_class_id ON schedules(class_id);
CREATE INDEX IF NOT EXISTS idx_schedules_subject_id ON schedules(subject_id);
CREATE INDEX IF NOT EXISTS idx_schedules_date_start_time ON schedules(schedule_date, start_time);

-- Seed Initial Subjects
INSERT OR IGNORE INTO subjects (name, display_order) VALUES
  ('Biology', 1),
  ('Mathematics', 2),
  ('Physics', 3),
  ('Chemistry', 4),
  ('Social Science', 5),
  ('English', 6),
  ('Hindi', 7),
  ('Malayalam', 8),
  ('Arabic', 9);

-- Seed Initial Classes
INSERT OR IGNORE INTO classes (name, batch, display_order) VALUES
  ('SSLC', 'RMS', 1),
  ('Class 9', 'DMS', 2),
  ('Class 8', 'LMS', 3);
