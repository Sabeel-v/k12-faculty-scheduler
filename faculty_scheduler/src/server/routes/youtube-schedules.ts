import { Hono } from 'hono';
import type { Env, YouTubeSchedule, YouTubeScheduleType } from '../types';
import { adminAuthMiddleware } from '../middleware/auth';

export const youtubeSchedulesRoute = new Hono<Env>();

const VALID_SCHEDULE_TYPES: YouTubeScheduleType[] = ['Live', 'Content Video', 'Shorts'];

/**
 * Helper to fetch full YouTube schedule by ID including classes and faculties
 */
async function fetchYouTubeScheduleById(db: D1Database, id: number): Promise<YouTubeSchedule | null> {
  const row = await db
    .prepare(
      `SELECT ys.*, s.name as subject_name
       FROM youtube_schedules ys
       LEFT JOIN subjects s ON ys.subject_id = s.id
       WHERE ys.id = ?`
    )
    .bind(id)
    .first<any>();

  if (!row) return null;

  // Fetch classes
  const classesRes = await db
    .prepare(
      `SELECT c.id, c.name, c.batch
       FROM youtube_schedule_classes ysc
       JOIN classes c ON ysc.class_id = c.id
       WHERE ysc.youtube_schedule_id = ?
       ORDER BY c.display_order ASC, c.name ASC`
    )
    .bind(id)
    .all<any>();

  // Fetch faculties
  const facultiesRes = await db
    .prepare(
      `SELECT f.id, f.name, f.department, f.subject_id, s.name as subject_name
       FROM youtube_schedule_faculties ysf
       JOIN faculty f ON ysf.faculty_id = f.id
       LEFT JOIN subjects s ON f.subject_id = s.id
       WHERE ysf.youtube_schedule_id = ?
       ORDER BY f.display_order ASC, f.name ASC`
    )
    .bind(id)
    .all<any>();

  return {
    id: row.id,
    schedule_date: row.schedule_date,
    start_time: row.start_time || null,
    schedule_type: row.schedule_type as YouTubeScheduleType,
    is_common: !!row.is_common,
    subject_id: row.subject_id || null,
    content: row.content || null,
    status: row.status || 'scheduled',
    notes: row.notes || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    subject: row.is_common
      ? { id: 0, name: 'Common' }
      : row.subject_id
      ? { id: row.subject_id, name: row.subject_name }
      : null,
    classes: (classesRes.results || []).map((c) => ({
      id: c.id,
      name: c.name,
      batch: c.batch || null
    })),
    faculties: (facultiesRes.results || []).map((f) => ({
      id: f.id,
      name: f.name,
      department: f.department || null,
      subject_id: f.subject_id,
      subject_name: f.subject_name || undefined
    }))
  };
}

// GET /api/youtube-schedules
youtubeSchedulesRoute.get('/', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const date = c.req.query('date');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const type = c.req.query('type');
  const status = c.req.query('status');
  const facultyId = c.req.query('faculty_id');
  const classId = c.req.query('class_id');
  const subjectId = c.req.query('subject_id');
  const isCommon = c.req.query('is_common');

  let query = `
    SELECT ys.*, s.name as subject_name
    FROM youtube_schedules ys
    LEFT JOIN subjects s ON ys.subject_id = s.id
  `;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (date) {
    conditions.push('ys.schedule_date = ?');
    params.push(date);
  } else {
    if (from) {
      conditions.push('ys.schedule_date >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('ys.schedule_date <= ?');
      params.push(to);
    }
  }

  if (type) {
    conditions.push('ys.schedule_type = ?');
    params.push(type);
  }

  if (status) {
    conditions.push('ys.status = ?');
    params.push(status);
  }

  if (subjectId) {
    conditions.push('ys.subject_id = ?');
    params.push(Number(subjectId));
  }

  if (isCommon !== undefined) {
    conditions.push('ys.is_common = ?');
    params.push(isCommon === 'true' || isCommon === '1' ? 1 : 0);
  }

  if (facultyId) {
    conditions.push(`ys.id IN (
      SELECT youtube_schedule_id FROM youtube_schedule_faculties WHERE faculty_id = ?
    )`);
    params.push(Number(facultyId));
  }

  if (classId) {
    conditions.push(`ys.id IN (
      SELECT youtube_schedule_id FROM youtube_schedule_classes WHERE class_id = ?
    )`);
    params.push(Number(classId));
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ` ORDER BY ys.schedule_date ASC, 
    CASE WHEN ys.start_time IS NULL OR ys.start_time = '' THEN 1 ELSE 0 END, 
    ys.start_time ASC, 
    ys.id ASC`;

  try {
    const stmt = db.prepare(query);
    const result = params.length > 0 ? await stmt.bind(...params).all<any>() : await stmt.all<any>();
    const rows = result.results || [];

    if (rows.length === 0) {
      return c.json([]);
    }

    const scheduleIds = rows.map((r) => r.id);
    const idPlaceholders = scheduleIds.map(() => '?').join(',');

    // Fetch classes for all schedules in one query
    const classesStmt = db.prepare(
      `SELECT ysc.youtube_schedule_id, c.id, c.name, c.batch
       FROM youtube_schedule_classes ysc
       JOIN classes c ON ysc.class_id = c.id
       WHERE ysc.youtube_schedule_id IN (${idPlaceholders})
       ORDER BY c.display_order ASC, c.name ASC`
    );
    const classesRes = await classesStmt.bind(...scheduleIds).all<any>();

    // Fetch faculties for all schedules in one query
    const facultiesStmt = db.prepare(
      `SELECT ysf.youtube_schedule_id, f.id, f.name, f.department, f.subject_id, s.name as subject_name
       FROM youtube_schedule_faculties ysf
       JOIN faculty f ON ysf.faculty_id = f.id
       LEFT JOIN subjects s ON f.subject_id = s.id
       WHERE ysf.youtube_schedule_id IN (${idPlaceholders})
       ORDER BY f.display_order ASC, f.name ASC`
    );
    const facultiesRes = await facultiesStmt.bind(...scheduleIds).all<any>();

    // Map classes and faculties by schedule id
    const classesMap = new Map<number, Array<{ id: number; name: string; batch?: string | null }>>();
    for (const row of classesRes.results || []) {
      const arr = classesMap.get(row.youtube_schedule_id) || [];
      arr.push({ id: row.id, name: row.name, batch: row.batch || null });
      classesMap.set(row.youtube_schedule_id, arr);
    }

    const facultiesMap = new Map<number, Array<{ id: number; name: string; department?: string | null; subject_id?: number; subject_name?: string }>>();
    for (const row of facultiesRes.results || []) {
      const arr = facultiesMap.get(row.youtube_schedule_id) || [];
      arr.push({
        id: row.id,
        name: row.name,
        department: row.department || null,
        subject_id: row.subject_id,
        subject_name: row.subject_name || undefined
      });
      facultiesMap.set(row.youtube_schedule_id, arr);
    }

    const fullSchedules: YouTubeSchedule[] = rows.map((r) => ({
      id: r.id,
      schedule_date: r.schedule_date,
      start_time: r.start_time || null,
      schedule_type: r.schedule_type as YouTubeScheduleType,
      is_common: !!r.is_common,
      subject_id: r.subject_id || null,
      content: r.content || null,
      status: r.status || 'scheduled',
      notes: r.notes || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      subject: r.is_common
        ? { id: 0, name: 'Common' }
        : r.subject_id
        ? { id: r.subject_id, name: r.subject_name }
        : null,
      classes: classesMap.get(r.id) || [],
      faculties: facultiesMap.get(r.id) || []
    }));

    return c.json(fullSchedules);
  } catch (err: any) {
    return c.json({ error: 'QUERY_FAILED', message: err?.message || 'Failed to fetch YouTube schedules' }, 500);
  }
});

// GET /api/youtube-schedules/:id
youtubeSchedulesRoute.get('/:id', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid schedule ID' }, 400);
  }

  const schedule = await fetchYouTubeScheduleById(db, id);
  if (!schedule) {
    return c.json({ error: 'NOT_FOUND', message: 'YouTube schedule not found' }, 404);
  }

  return c.json(schedule);
});

// POST /api/youtube-schedules (Admin Protected)
youtubeSchedulesRoute.post('/', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  try {
    const body = await c.req.json<{
      schedule_date: string;
      schedule_type: YouTubeScheduleType;
      class_ids: number[];
      faculty_ids: number[];
      is_common?: boolean;
      subject_id?: number | null;
      start_time?: string | null;
      content?: string | null;
      status?: string;
      notes?: string | null;
    }>();

    // Validation
    if (!body.schedule_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.schedule_date)) {
      return c.json({ error: 'BAD_REQUEST', message: 'Invalid schedule_date (YYYY-MM-DD required)' }, 400);
    }

    if (!body.schedule_type || !VALID_SCHEDULE_TYPES.includes(body.schedule_type)) {
      return c.json(
        {
          error: 'BAD_REQUEST',
          message: `schedule_type must be one of: ${VALID_SCHEDULE_TYPES.join(', ')}`
        },
        400
      );
    }

    if (!Array.isArray(body.class_ids) || body.class_ids.length === 0) {
      return c.json({ error: 'BAD_REQUEST', message: 'At least one class must be selected' }, 400);
    }

    if (!Array.isArray(body.faculty_ids) || body.faculty_ids.length === 0) {
      return c.json({ error: 'BAD_REQUEST', message: 'At least one faculty member must be selected' }, 400);
    }

    const isCommon = !!body.is_common;
    const subjectId = isCommon ? null : body.subject_id ? Number(body.subject_id) : null;
    const startTime = body.start_time?.trim() || null;
    const status = body.status?.trim() || 'scheduled';
    const content = body.content?.trim() || null;
    const notes = body.notes?.trim() || null;

    // Insert main youtube_schedules row
    const insertRes = await db
      .prepare(
        `INSERT INTO youtube_schedules (
           schedule_date, start_time, schedule_type, is_common, subject_id, content, status, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .bind(
        body.schedule_date,
        startTime,
        body.schedule_type,
        isCommon ? 1 : 0,
        subjectId,
        content,
        status,
        notes
      )
      .first<{ id: number }>();

    if (!insertRes || !insertRes.id) {
      return c.json({ error: 'INSERT_FAILED', message: 'Failed to create YouTube schedule' }, 500);
    }

    const newId = insertRes.id;

    // Batch insert junction records
    const batchStatements: any[] = [];

    for (const classId of body.class_ids) {
      batchStatements.push(
        db
          .prepare('INSERT INTO youtube_schedule_classes (youtube_schedule_id, class_id) VALUES (?, ?)')
          .bind(newId, Number(classId))
      );
    }

    for (const facultyId of body.faculty_ids) {
      batchStatements.push(
        db
          .prepare('INSERT INTO youtube_schedule_faculties (youtube_schedule_id, faculty_id) VALUES (?, ?)')
          .bind(newId, Number(facultyId))
      );
    }

    if (batchStatements.length > 0) {
      await db.batch(batchStatements);
    }

    const createdSchedule = await fetchYouTubeScheduleById(db, newId);
    return c.json(createdSchedule, 201);
  } catch (err: any) {
    return c.json({ error: 'CREATE_FAILED', message: err?.message || 'Failed to create YouTube schedule' }, 500);
  }
});

// PUT /api/youtube-schedules/:id (Admin Protected)
youtubeSchedulesRoute.put('/:id', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid schedule ID' }, 400);
  }

  try {
    const body = await c.req.json<{
      schedule_date: string;
      schedule_type: YouTubeScheduleType;
      class_ids: number[];
      faculty_ids: number[];
      is_common?: boolean;
      subject_id?: number | null;
      start_time?: string | null;
      content?: string | null;
      status?: string;
      notes?: string | null;
    }>();

    // Check existence
    const existing = await db.prepare('SELECT id FROM youtube_schedules WHERE id = ?').bind(id).first<any>();
    if (!existing) {
      return c.json({ error: 'NOT_FOUND', message: 'YouTube schedule not found' }, 404);
    }

    // Validation
    if (!body.schedule_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.schedule_date)) {
      return c.json({ error: 'BAD_REQUEST', message: 'Invalid schedule_date (YYYY-MM-DD required)' }, 400);
    }

    if (!body.schedule_type || !VALID_SCHEDULE_TYPES.includes(body.schedule_type)) {
      return c.json(
        {
          error: 'BAD_REQUEST',
          message: `schedule_type must be one of: ${VALID_SCHEDULE_TYPES.join(', ')}`
        },
        400
      );
    }

    if (!Array.isArray(body.class_ids) || body.class_ids.length === 0) {
      return c.json({ error: 'BAD_REQUEST', message: 'At least one class must be selected' }, 400);
    }

    if (!Array.isArray(body.faculty_ids) || body.faculty_ids.length === 0) {
      return c.json({ error: 'BAD_REQUEST', message: 'At least one faculty member must be selected' }, 400);
    }

    const isCommon = !!body.is_common;
    const subjectId = isCommon ? null : body.subject_id ? Number(body.subject_id) : null;
    const startTime = body.start_time?.trim() || null;
    const status = body.status?.trim() || 'scheduled';
    const content = body.content?.trim() || null;
    const notes = body.notes?.trim() || null;

    const batchStatements: any[] = [
      db
        .prepare(
          `UPDATE youtube_schedules
           SET schedule_date = ?,
               start_time = ?,
               schedule_type = ?,
               is_common = ?,
               subject_id = ?,
               content = ?,
               status = ?,
               notes = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(
          body.schedule_date,
          startTime,
          body.schedule_type,
          isCommon ? 1 : 0,
          subjectId,
          content,
          status,
          notes,
          id
        ),
      db.prepare('DELETE FROM youtube_schedule_classes WHERE youtube_schedule_id = ?').bind(id),
      db.prepare('DELETE FROM youtube_schedule_faculties WHERE youtube_schedule_id = ?').bind(id)
    ];

    for (const classId of body.class_ids) {
      batchStatements.push(
        db
          .prepare('INSERT INTO youtube_schedule_classes (youtube_schedule_id, class_id) VALUES (?, ?)')
          .bind(id, Number(classId))
      );
    }

    for (const facultyId of body.faculty_ids) {
      batchStatements.push(
        db
          .prepare('INSERT INTO youtube_schedule_faculties (youtube_schedule_id, faculty_id) VALUES (?, ?)')
          .bind(id, Number(facultyId))
      );
    }

    await db.batch(batchStatements);

    const updatedSchedule = await fetchYouTubeScheduleById(db, id);
    return c.json(updatedSchedule);
  } catch (err: any) {
    return c.json({ error: 'UPDATE_FAILED', message: err?.message || 'Failed to update YouTube schedule' }, 500);
  }
});

// PATCH /api/youtube-schedules/:id/date (Admin Protected)
youtubeSchedulesRoute.patch('/:id/date', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid schedule ID' }, 400);
  }

  try {
    const { schedule_date } = await c.req.json<{ schedule_date: string }>();

    if (!schedule_date || !/^\d{4}-\d{2}-\d{2}$/.test(schedule_date)) {
      return c.json({ error: 'BAD_REQUEST', message: 'Invalid schedule_date format (YYYY-MM-DD required)' }, 400);
    }

    const existing = await db.prepare('SELECT id FROM youtube_schedules WHERE id = ?').bind(id).first<any>();
    if (!existing) {
      return c.json({ error: 'NOT_FOUND', message: 'YouTube schedule not found' }, 404);
    }

    await db
      .prepare('UPDATE youtube_schedules SET schedule_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(schedule_date, id)
      .run();

    const updated = await fetchYouTubeScheduleById(db, id);
    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: 'UPDATE_FAILED', message: err?.message || 'Failed to update date' }, 500);
  }
});

// DELETE /api/youtube-schedules/:id (Admin Protected)
youtubeSchedulesRoute.delete('/:id', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid schedule ID' }, 400);
  }

  try {
    const existing = await db.prepare('SELECT id FROM youtube_schedules WHERE id = ?').bind(id).first<any>();
    if (!existing) {
      return c.json({ error: 'NOT_FOUND', message: 'YouTube schedule not found' }, 404);
    }

    await db.batch([
      db.prepare('DELETE FROM youtube_schedule_classes WHERE youtube_schedule_id = ?').bind(id),
      db.prepare('DELETE FROM youtube_schedule_faculties WHERE youtube_schedule_id = ?').bind(id),
      db.prepare('DELETE FROM youtube_schedules WHERE id = ?').bind(id)
    ]);

    return c.json({ success: true, message: 'YouTube schedule deleted successfully' });
  } catch (err: any) {
    return c.json({ error: 'DELETE_FAILED', message: err?.message || 'Failed to delete YouTube schedule' }, 500);
  }
});
