import { Hono } from 'hono';
import type { Env, Faculty } from '../types';
import { adminAuthMiddleware } from '../middleware/auth';

export const facultyRoute = new Hono<Env>();

// GET /api/faculty (Public) - includes subject information
facultyRoute.get('/', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const subjectId = c.req.query('subject_id');
  const status = c.req.query('status');

  let query = `
    SELECT f.*, s.name as subject_name
    FROM faculty f
    JOIN subjects s ON f.subject_id = s.id
  `;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (subjectId) {
    conditions.push('f.subject_id = ?');
    params.push(Number(subjectId));
  }

  if (status) {
    conditions.push('f.status = ?');
    params.push(status);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY s.display_order ASC, s.name ASC, f.display_order ASC, f.name ASC';

  const stmt = db.prepare(query);
  const result = params.length > 0 ? await stmt.bind(...params).all<any>() : await stmt.all<any>();

  const faculty = (result.results || []).map((row) => ({
    id: row.id,
    subject_id: row.subject_id,
    name: row.name,
    department: row.department,
    phone: row.phone,
    status: row.status,
    display_order: row.display_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    subject: {
      id: row.subject_id,
      name: row.subject_name
    }
  }));

  c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');
  return c.json(faculty);
});

// GET /api/faculty/:id (Public)
facultyRoute.get('/:id', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid faculty ID' }, 400);
  }

  const row = await db
    .prepare(
      `SELECT f.*, s.name as subject_name
       FROM faculty f
       JOIN subjects s ON f.subject_id = s.id
       WHERE f.id = ?`
    )
    .bind(id)
    .first<any>();

  if (!row) {
    return c.json({ error: 'NOT_FOUND', message: 'Faculty not found' }, 404);
  }

  return c.json({
    id: row.id,
    subject_id: row.subject_id,
    name: row.name,
    department: row.department,
    phone: row.phone,
    status: row.status,
    display_order: row.display_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    subject: {
      id: row.subject_id,
      name: row.subject_name
    }
  });
});

// GET /api/faculty/:id/schedules (Public)
facultyRoute.get('/:id/schedules', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid faculty ID' }, 400);
  }

  const date = c.req.query('date');
  const from = c.req.query('from');
  const to = c.req.query('to');

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
    WHERE sc.faculty_id = ?
  `;

  const params: unknown[] = [id];

  if (date) {
    query += ' AND sc.schedule_date = ?';
    params.push(date);
  } else {
    if (from) {
      query += ' AND sc.schedule_date >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND sc.schedule_date <= ?';
      params.push(to);
    }
  }

  query += ' ORDER BY sc.schedule_date ASC, sc.start_time ASC';

  const stmt = db.prepare(query);
  const result = await stmt.bind(...params).all<any>();

  const schedules = (result.results || []).map((row) => ({
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
  }));

  return c.json(schedules);
});

// POST /api/faculty (Admin Protected)
// Faculty MUST belong to a subject
facultyRoute.post('/', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  try {
    const body = await c.req.json<{
      subject_id?: number;
      name?: string;
      department?: string;
      phone?: string;
      status?: string;
      display_order?: number;
    }>();

    if (!body || !body.subject_id) {
      return c.json({ error: 'BAD_REQUEST', message: 'subject_id is required. Faculty must belong to a subject.' }, 400);
    }

    if (!body.name || !body.name.trim()) {
      return c.json({ error: 'BAD_REQUEST', message: 'Faculty name is required' }, 400);
    }

    // Verify subject exists
    const subject = await db.prepare('SELECT id, name FROM subjects WHERE id = ?').bind(body.subject_id).first<{ id: number; name: string }>();
    if (!subject) {
      return c.json({ error: 'BAD_REQUEST', message: 'Selected subject does not exist' }, 400);
    }

    const name = body.name.trim();
    const department = body.department?.trim() || null;
    const phone = body.phone?.trim() || null;
    const status = body.status || 'active';
    const display_order = body.display_order ?? 0;

    const insertResult = await db
      .prepare(
        'INSERT INTO faculty (subject_id, name, department, phone, status, display_order) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(body.subject_id, name, department, phone, status, display_order)
      .run();

    const created = await db
      .prepare(
        `SELECT f.*, s.name as subject_name
         FROM faculty f
         JOIN subjects s ON f.subject_id = s.id
         WHERE f.id = ?`
      )
      .bind(insertResult.meta.last_row_id)
      .first<any>();

    return c.json(
      {
        id: created.id,
        subject_id: created.subject_id,
        name: created.name,
        department: created.department,
        phone: created.phone,
        status: created.status,
        display_order: created.display_order,
        created_at: created.created_at,
        updated_at: created.updated_at,
        subject: {
          id: created.subject_id,
          name: created.subject_name
        }
      },
      201
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create faculty';
    return c.json({ error: 'INTERNAL_ERROR', message }, 500);
  }
});

// PUT /api/faculty/:id (Admin Protected)
facultyRoute.put('/:id', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid faculty ID' }, 400);
  }

  const existing = await db.prepare('SELECT * FROM faculty WHERE id = ?').bind(id).first<Faculty>();
  if (!existing) {
    return c.json({ error: 'NOT_FOUND', message: 'Faculty not found' }, 404);
  }

  try {
    const body = await c.req.json<{
      subject_id?: number;
      name?: string;
      department?: string | null;
      phone?: string | null;
      status?: string;
      display_order?: number;
    }>();

    const subjectId = body.subject_id !== undefined ? Number(body.subject_id) : existing.subject_id;
    const name = body.name !== undefined ? body.name.trim() : existing.name;
    const department = body.department !== undefined ? body.department?.trim() || null : existing.department;
    const phone = body.phone !== undefined ? body.phone?.trim() || null : existing.phone;
    const status = body.status !== undefined ? body.status : existing.status;
    const display_order = body.display_order !== undefined ? body.display_order : existing.display_order;

    if (!name) {
      return c.json({ error: 'BAD_REQUEST', message: 'Faculty name cannot be empty' }, 400);
    }

    if (body.subject_id !== undefined) {
      const subject = await db.prepare('SELECT id FROM subjects WHERE id = ?').bind(subjectId).first();
      if (!subject) {
        return c.json({ error: 'BAD_REQUEST', message: 'Selected subject does not exist' }, 400);
      }
    }

    await db
      .prepare(
        `UPDATE faculty
         SET subject_id = ?, name = ?, department = ?, phone = ?, status = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(subjectId, name, department, phone, status, display_order, id)
      .run();

    const updated = await db
      .prepare(
        `SELECT f.*, s.name as subject_name
         FROM faculty f
         JOIN subjects s ON f.subject_id = s.id
         WHERE f.id = ?`
      )
      .bind(id)
      .first<any>();

    return c.json({
      id: updated.id,
      subject_id: updated.subject_id,
      name: updated.name,
      department: updated.department,
      phone: updated.phone,
      status: updated.status,
      display_order: updated.display_order,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      subject: {
        id: updated.subject_id,
        name: updated.subject_name
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update faculty';
    return c.json({ error: 'INTERNAL_ERROR', message }, 500);
  }
});

// DELETE /api/faculty/:id (Admin Protected)
// If schedules reference this faculty, do not delete schedules; soft delete (status = 'inactive')
facultyRoute.delete('/:id', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid faculty ID' }, 400);
  }

  const existing = await db.prepare('SELECT id FROM faculty WHERE id = ?').bind(id).first<Faculty>();
  if (!existing) {
    return c.json({ error: 'NOT_FOUND', message: 'Faculty not found' }, 404);
  }

  // Check if schedules exist referencing this faculty
  const scheduleCount = await db
    .prepare('SELECT COUNT(*) as count FROM schedules WHERE faculty_id = ?')
    .bind(id)
    .first<{ count: number }>();

  if (scheduleCount && scheduleCount.count > 0) {
    // Soft delete
    await db
      .prepare("UPDATE faculty SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(id)
      .run();

    return c.json({
      success: true,
      soft_deleted: true,
      message: 'Faculty has existing schedules and was marked as inactive instead of deleted.'
    });
  }

  // Hard delete if no schedule history
  await db.prepare('DELETE FROM faculty WHERE id = ?').bind(id).run();
  return c.json({ success: true, soft_deleted: false, message: 'Faculty deleted successfully' });
});
