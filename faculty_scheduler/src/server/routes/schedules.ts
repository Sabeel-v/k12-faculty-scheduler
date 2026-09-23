import { Hono } from 'hono';
import type { Env, Schedule } from '../types';
import { adminAuthMiddleware } from '../middleware/auth';

export const schedulesRoute = new Hono<Env>();

// Helper to format joined schedule item
function mapScheduleRow(row: any): Schedule {
  return {
    id: row.id,
    schedule_date: row.schedule_date,
    start_time: row.start_time,
    end_time: row.end_time,
    class_id: row.class_id,
    subject_id: row.subject_id,
    faculty_id: row.faculty_id,
    schedule_type: row.schedule_type,
    content: row.content,
    status: row.status,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    faculty: {
      id: row.faculty_id,
      name: row.faculty_name
    },
    subject: {
      id: row.subject_id,
      name: row.subject_name
    },
    class: {
      id: row.class_id,
      name: row.class_name,
      batch: row.class_batch
    }
  };
}

/**
 * Conflict detection helper:
 * A conflict occurs if there is an overlapping schedule (status != 'cancelled') on the same date.
 * Time overlap condition between [newStart, newEnd] and [existStart, existEnd]:
 *   If end_time is not provided, we consider standard 1 hour slot or match start_time.
 *   Overlap logic: (exist_start < new_end) AND (exist_end > new_start)
 */
async function checkScheduleConflicts(
  db: D1Database,
  params: {
    schedule_date: string;
    start_time: string;
    end_time: string | null;
    faculty_id: number;
    class_id: number;
    excludeScheduleId?: number;
  }
): Promise<{ hasConflict: boolean; reason?: string }> {
  if (!params.start_time) {
    return { hasConflict: false };
  }

  const effectiveEndTime = params.end_time || params.start_time;

  // 1. Check Faculty conflict
  let facultyQuery = `
    SELECT id, start_time, COALESCE(end_time, start_time) as end_time, schedule_date
    FROM schedules
    WHERE faculty_id = ? 
      AND schedule_date = ? 
      AND status != 'cancelled'
  `;
  const facultyParams: unknown[] = [params.faculty_id, params.schedule_date];
  if (params.excludeScheduleId) {
    facultyQuery += ' AND id != ?';
    facultyParams.push(params.excludeScheduleId);
  }

  const existingFacultySchedules = await db.prepare(facultyQuery).bind(...facultyParams).all<any>();

  for (const s of existingFacultySchedules.results || []) {
    const sStart = s.start_time;
    const sEnd = s.end_time;

    // Overlap check
    const overlaps =
      (params.start_time <= sStart && effectiveEndTime > sStart) ||
      (params.start_time < sEnd && effectiveEndTime >= sEnd) ||
      (params.start_time >= sStart && effectiveEndTime <= sEnd) ||
      (params.start_time === sStart);

    if (overlaps) {
      return {
        hasConflict: true,
        reason: 'This faculty member already has a schedule during this time.'
      };
    }
  }

  // 2. Check Class conflict
  let classQuery = `
    SELECT id, start_time, COALESCE(end_time, start_time) as end_time, schedule_date
    FROM schedules
    WHERE class_id = ? 
      AND schedule_date = ? 
      AND status != 'cancelled'
  `;
  const classParams: unknown[] = [params.class_id, params.schedule_date];
  if (params.excludeScheduleId) {
    classQuery += ' AND id != ?';
    classParams.push(params.excludeScheduleId);
  }

  const existingClassSchedules = await db.prepare(classQuery).bind(...classParams).all<any>();

  for (const s of existingClassSchedules.results || []) {
    const sStart = s.start_time;
    const sEnd = s.end_time;

    const overlaps =
      (params.start_time <= sStart && effectiveEndTime > sStart) ||
      (params.start_time < sEnd && effectiveEndTime >= sEnd) ||
      (params.start_time >= sStart && effectiveEndTime <= sEnd) ||
      (params.start_time === sStart);

    if (overlaps) {
      return {
        hasConflict: true,
        reason: 'This class already has a schedule during this time.'
      };
    }
  }

  return { hasConflict: false };
}

// GET /api/schedules (Public, with flexible query filters)
schedulesRoute.get('/', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const date = c.req.query('date');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const facultyId = c.req.query('faculty_id');
  const classId = c.req.query('class_id');
  const subjectId = c.req.query('subject_id');
  const scheduleType = c.req.query('type');
  const status = c.req.query('status');

  let query = `
    SELECT 
      sc.*,
      f.name as faculty_name,
      s.name as subject_name,
      cl.name as class_name,
      cl.batch as class_batch
    FROM schedules sc
    JOIN faculty f ON sc.faculty_id = f.id
    JOIN subjects s ON sc.subject_id = s.id
    JOIN classes cl ON sc.class_id = cl.id
  `;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (date) {
    conditions.push('sc.schedule_date = ?');
    params.push(date);
  } else {
    if (from) {
      conditions.push('sc.schedule_date >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('sc.schedule_date <= ?');
      params.push(to);
    }
  }

  if (facultyId) {
    conditions.push('sc.faculty_id = ?');
    params.push(Number(facultyId));
  }

  if (classId) {
    conditions.push('sc.class_id = ?');
    params.push(Number(classId));
  }

  if (subjectId) {
    conditions.push('sc.subject_id = ?');
    params.push(Number(subjectId));
  }

  if (scheduleType) {
    // allow matching e.g. "SESSION 1" or "SESSION_1"
    const normalizedType = scheduleType.replace(/_/g, ' ');
    conditions.push('sc.schedule_type = ? COLLATE NOCASE');
    params.push(normalizedType);
  }

  if (status) {
    conditions.push('sc.status = ?');
    params.push(status);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY sc.schedule_date ASC, sc.start_time ASC';

  const stmt = db.prepare(query);
  const result = params.length > 0 ? await stmt.bind(...params).all<any>() : await stmt.all<any>();

  const schedules = (result.results || []).map(mapScheduleRow);
  return c.json(schedules);
});

// GET /api/schedules/:id (Public)
schedulesRoute.get('/:id', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid schedule ID' }, 400);
  }

  const row = await db
    .prepare(
      `SELECT 
        sc.*,
        f.name as faculty_name,
        s.name as subject_name,
        cl.name as class_name,
        cl.batch as class_batch
      FROM schedules sc
      JOIN faculty f ON sc.faculty_id = f.id
      JOIN subjects s ON sc.subject_id = s.id
      JOIN classes cl ON sc.class_id = cl.id
      WHERE sc.id = ?`
    )
    .bind(id)
    .first<any>();

  if (!row) {
    return c.json({ error: 'NOT_FOUND', message: 'Schedule not found' }, 404);
  }

  return c.json(mapScheduleRow(row));
});

// POST /api/schedules (Admin Protected)
schedulesRoute.post('/', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  try {
    const body = await c.req.json<{
      schedule_date?: string;
      start_time?: string;
      end_time?: string | null;
      class_id?: number;
      subject_id?: number;
      faculty_id?: number;
      schedule_type?: string;
      content?: string | null;
      status?: string;
      notes?: string | null;
    }>();

    const {
      schedule_date,
      start_time = '',
      end_time = null,
      class_id,
      subject_id,
      faculty_id,
      schedule_type,
      content = null,
      status = 'scheduled',
      notes = null
    } = body || {};

    // Validate required fields (start_time is now optional)
    if (!schedule_date || !class_id || !subject_id || !faculty_id || !schedule_type) {
      return c.json(
        {
          error: 'BAD_REQUEST',
          message: 'Missing required fields: schedule_date, class_id, subject_id, faculty_id, schedule_type are mandatory.'
        },
        400
      );
    }

    // Verify class exists
    const classRecord = await db.prepare('SELECT id FROM classes WHERE id = ?').bind(class_id).first();
    if (!classRecord) {
      return c.json({ error: 'BAD_REQUEST', message: 'Selected class does not exist' }, 400);
    }

    // Verify subject exists
    const subjectRecord = await db.prepare('SELECT id FROM subjects WHERE id = ?').bind(subject_id).first();
    if (!subjectRecord) {
      return c.json({ error: 'BAD_REQUEST', message: 'Selected subject does not exist' }, 400);
    }

    // Verify faculty exists AND belongs to subject_id
    const facultyRecord = await db
      .prepare('SELECT id, subject_id FROM faculty WHERE id = ?')
      .bind(faculty_id)
      .first<{ id: number; subject_id: number }>();

    if (!facultyRecord) {
      return c.json({ error: 'BAD_REQUEST', message: 'Selected faculty does not exist' }, 400);
    }

    // CRITICAL VALIDATION: faculty.subject_id MUST equal schedules.subject_id
    if (facultyRecord.subject_id !== Number(subject_id)) {
      return c.json(
        {
          error: 'SUBJECT_FACULTY_MISMATCH',
          message: `Faculty does not belong to the selected subject. Faculty belongs to subject ID ${facultyRecord.subject_id}, but subject ID ${subject_id} was submitted.`
        },
        400
      );
    }

    // Conflict detection (faculty conflict & class conflict)
    const conflict = await checkScheduleConflicts(db, {
      schedule_date,
      start_time,
      end_time,
      faculty_id,
      class_id
    });

    if (conflict.hasConflict) {
      return c.json(
        {
          error: 'SCHEDULE_CONFLICT',
          message: conflict.reason
        },
        409
      );
    }

    // Insert schedule
    const insertResult = await db
      .prepare(
        `INSERT INTO schedules (
          schedule_date, start_time, end_time, class_id, subject_id, faculty_id,
          schedule_type, content, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        schedule_date,
        start_time,
        end_time,
        class_id,
        subject_id,
        faculty_id,
        schedule_type,
        content,
        status,
        notes
      )
      .run();

    const created = await db
      .prepare(
        `SELECT 
          sc.*,
          f.name as faculty_name,
          s.name as subject_name,
          cl.name as class_name,
          cl.batch as class_batch
        FROM schedules sc
        JOIN faculty f ON sc.faculty_id = f.id
        JOIN subjects s ON sc.subject_id = s.id
        JOIN classes cl ON sc.class_id = cl.id
        WHERE sc.id = ?`
      )
      .bind(insertResult.meta.last_row_id)
      .first<any>();

    return c.json(mapScheduleRow(created), 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create schedule';
    return c.json({ error: 'INTERNAL_ERROR', message }, 500);
  }
});

// PUT /api/schedules/:id (Admin Protected)
schedulesRoute.put('/:id', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid schedule ID' }, 400);
  }

  const existing = await db.prepare('SELECT * FROM schedules WHERE id = ?').bind(id).first<any>();
  if (!existing) {
    return c.json({ error: 'NOT_FOUND', message: 'Schedule not found' }, 404);
  }

  try {
    const body = await c.req.json<{
      schedule_date?: string;
      start_time?: string;
      end_time?: string | null;
      class_id?: number;
      subject_id?: number;
      faculty_id?: number;
      schedule_type?: string;
      content?: string | null;
      status?: string;
      notes?: string | null;
    }>();

    const schedule_date = body.schedule_date !== undefined ? body.schedule_date : existing.schedule_date;
    const start_time = body.start_time !== undefined ? body.start_time : existing.start_time;
    const end_time = body.end_time !== undefined ? body.end_time : existing.end_time;
    const class_id = body.class_id !== undefined ? Number(body.class_id) : existing.class_id;
    const subject_id = body.subject_id !== undefined ? Number(body.subject_id) : existing.subject_id;
    const faculty_id = body.faculty_id !== undefined ? Number(body.faculty_id) : existing.faculty_id;
    const schedule_type = body.schedule_type !== undefined ? body.schedule_type : existing.schedule_type;
    const content = body.content !== undefined ? body.content : existing.content;
    const status = body.status !== undefined ? body.status : existing.status;
    const notes = body.notes !== undefined ? body.notes : existing.notes;

    // Verify foreign keys
    const classRecord = await db.prepare('SELECT id FROM classes WHERE id = ?').bind(class_id).first();
    if (!classRecord) {
      return c.json({ error: 'BAD_REQUEST', message: 'Selected class does not exist' }, 400);
    }

    const subjectRecord = await db.prepare('SELECT id FROM subjects WHERE id = ?').bind(subject_id).first();
    if (!subjectRecord) {
      return c.json({ error: 'BAD_REQUEST', message: 'Selected subject does not exist' }, 400);
    }

    const facultyRecord = await db
      .prepare('SELECT id, subject_id FROM faculty WHERE id = ?')
      .bind(faculty_id)
      .first<{ id: number; subject_id: number }>();

    if (!facultyRecord) {
      return c.json({ error: 'BAD_REQUEST', message: 'Selected faculty does not exist' }, 400);
    }

    // Validate faculty belongs to selected subject
    if (facultyRecord.subject_id !== subject_id) {
      return c.json(
        {
          error: 'SUBJECT_FACULTY_MISMATCH',
          message: `Faculty does not belong to the selected subject. Faculty belongs to subject ID ${facultyRecord.subject_id}, but subject ID ${subject_id} was submitted.`
        },
        400
      );
    }

    // Check conflict (excluding current schedule)
    const conflict = await checkScheduleConflicts(db, {
      schedule_date,
      start_time,
      end_time,
      faculty_id,
      class_id,
      excludeScheduleId: id
    });

    if (conflict.hasConflict) {
      return c.json(
        {
          error: 'SCHEDULE_CONFLICT',
          message: conflict.reason
        },
        409
      );
    }

    await db
      .prepare(
        `UPDATE schedules SET
          schedule_date = ?, start_time = ?, end_time = ?, class_id = ?, subject_id = ?,
          faculty_id = ?, schedule_type = ?, content = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(
        schedule_date,
        start_time,
        end_time,
        class_id,
        subject_id,
        faculty_id,
        schedule_type,
        content,
        status,
        notes,
        id
      )
      .run();

    const updated = await db
      .prepare(
        `SELECT 
          sc.*,
          f.name as faculty_name,
          s.name as subject_name,
          cl.name as class_name,
          cl.batch as class_batch
        FROM schedules sc
        JOIN faculty f ON sc.faculty_id = f.id
        JOIN subjects s ON sc.subject_id = s.id
        JOIN classes cl ON sc.class_id = cl.id
        WHERE sc.id = ?`
      )
      .bind(id)
      .first<any>();

    return c.json(mapScheduleRow(updated));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update schedule';
    return c.json({ error: 'INTERNAL_ERROR', message }, 500);
  }
});

// PATCH /api/schedules/:id/date (Admin Protected)
// Special drag-and-drop endpoint: MUST ONLY update schedule_date
schedulesRoute.patch('/:id/date', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid schedule ID' }, 400);
  }

  const existing = await db.prepare('SELECT * FROM schedules WHERE id = ?').bind(id).first<any>();
  if (!existing) {
    return c.json({ error: 'NOT_FOUND', message: 'Schedule not found' }, 404);
  }

  try {
    const body = await c.req.json<{ schedule_date?: string }>();
    if (!body || !body.schedule_date || !body.schedule_date.trim()) {
      return c.json({ error: 'BAD_REQUEST', message: 'schedule_date is required' }, 400);
    }

    const newDate = body.schedule_date.trim();

    // Check conflict on new date
    const conflict = await checkScheduleConflicts(db, {
      schedule_date: newDate,
      start_time: existing.start_time,
      end_time: existing.end_time,
      faculty_id: existing.faculty_id,
      class_id: existing.class_id,
      excludeScheduleId: id
    });

    if (conflict.hasConflict) {
      return c.json(
        {
          error: 'SCHEDULE_CONFLICT',
          message: conflict.reason
        },
        409
      );
    }

    // MUST ONLY update schedule_date and updated_at
    await db
      .prepare('UPDATE schedules SET schedule_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(newDate, id)
      .run();

    const updated = await db
      .prepare(
        `SELECT 
          sc.*,
          f.name as faculty_name,
          s.name as subject_name,
          cl.name as class_name,
          cl.batch as class_batch
        FROM schedules sc
        JOIN faculty f ON sc.faculty_id = f.id
        JOIN subjects s ON sc.subject_id = s.id
        JOIN classes cl ON sc.class_id = cl.id
        WHERE sc.id = ?`
      )
      .bind(id)
      .first<any>();

    return c.json(mapScheduleRow(updated));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update schedule date';
    return c.json({ error: 'INTERNAL_ERROR', message }, 500);
  }
});

// DELETE /api/schedules/:id (Admin Protected)
schedulesRoute.delete('/:id', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid schedule ID' }, 400);
  }

  const existing = await db.prepare('SELECT id FROM schedules WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ error: 'NOT_FOUND', message: 'Schedule not found' }, 404);
  }

  await db.prepare('DELETE FROM schedules WHERE id = ?').bind(id).run();
  return c.json({ success: true, message: 'Schedule deleted successfully' });
});
