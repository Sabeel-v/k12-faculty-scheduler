-- Migration: 0002_create_youtube_schedules.sql
-- 100% additive: Does not touch or alter 'schedules', 'faculty', 'subjects', or 'classes'

-- 1. Main YouTube Schedules Table
CREATE TABLE IF NOT EXISTS youtube_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_date TEXT NOT NULL,
  start_time TEXT,                      -- Optional (nullable)
  schedule_type TEXT NOT NULL,          -- 'Live', 'Content Video', 'Shorts'
  is_common INTEGER NOT NULL DEFAULT 0, -- 1 if "Common" subject selected, 0 otherwise
  subject_id INTEGER,                   -- NULL if "Common", otherwise REFERENCES subjects(id)
  content TEXT,                         -- Content / Chapter details
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
);

-- 2. Multi-Class Junction Table (allows selecting multiple classes)
CREATE TABLE IF NOT EXISTS youtube_schedule_classes (
  youtube_schedule_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  PRIMARY KEY (youtube_schedule_id, class_id),
  FOREIGN KEY (youtube_schedule_id) REFERENCES youtube_schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- 3. Multi-Faculty Junction Table (allows selecting multiple faculties)
CREATE TABLE IF NOT EXISTS youtube_schedule_faculties (
  youtube_schedule_id INTEGER NOT NULL,
  faculty_id INTEGER NOT NULL,
  PRIMARY KEY (youtube_schedule_id, faculty_id),
  FOREIGN KEY (youtube_schedule_id) REFERENCES youtube_schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_yt_schedules_date ON youtube_schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_yt_classes_schedule ON youtube_schedule_classes(youtube_schedule_id);
CREATE INDEX IF NOT EXISTS idx_yt_faculties_schedule ON youtube_schedule_faculties(youtube_schedule_id);
CREATE INDEX IF NOT EXISTS idx_yt_faculties_faculty ON youtube_schedule_faculties(faculty_id);
