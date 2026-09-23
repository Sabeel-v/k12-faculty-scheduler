import { Hono } from 'hono';
import type { Env, Subject, Faculty } from '../types';
import { adminAuthMiddleware } from '../middleware/auth';

export const subjectsRoute = new Hono<Env>();

// GET /api/subjects (Public)
subjectsRoute.get('/', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const status = c.req.query('status');
  let query = 'SELECT * FROM subjects';
  const params: unknown[] = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY display_order ASC, name ASC';

  const stmt = db.prepare(query);
  const result = params.length > 0 ? await stmt.bind(...params).all<Subject>() : await stmt.all<Subject>();

  c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');
  return c.json(result.results || []);
});

// GET /api/subjects/:id/faculty (Public: active faculty belonging to that subject)
subjectsRoute.get('/:id/faculty', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const subjectId = Number(c.req.param('id'));
  if (isNaN(subjectId)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid subject ID' }, 400);
  }

  const result = await db
    .prepare(
      `SELECT f.*, s.name AS subject_name 
       FROM faculty f
       JOIN subjects s ON f.subject_id = s.id
       WHERE f.subject_id = ? AND f.status = 'active'
       ORDER BY f.display_order ASC, f.name ASC`
    )
    .bind(subjectId)
    .all<any>();

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

  return c.json(faculty);
});

// GET /api/subjects/:id (Public)
subjectsRoute.get('/:id', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid subject ID' }, 400);
  }

  const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first<Subject>();

  if (!subject) {
    return c.json({ error: 'NOT_FOUND', message: 'Subject not found' }, 404);
  }

  return c.json(subject);
});

// POST /api/subjects (Admin Protected)
subjectsRoute.post('/', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  try {
    const body = await c.req.json<{ name?: string; status?: string; display_order?: number }>();
    if (!body || !body.name || !body.name.trim()) {
      return c.json({ error: 'BAD_REQUEST', message: 'Subject name is required' }, 400);
    }

    const name = body.name.trim();
    const status = body.status || 'active';
    const display_order = body.display_order ?? 0;

    // Check unique name
    const existing = await db.prepare('SELECT id FROM subjects WHERE name = ? COLLATE NOCASE').bind(name).first();
    if (existing) {
      return c.json({ error: 'CONFLICT', message: `Subject "${name}" already exists` }, 409);
    }

    const insertResult = await db
      .prepare('INSERT INTO subjects (name, status, display_order) VALUES (?, ?, ?)')
      .bind(name, status, display_order)
      .run();

    const created = await db
      .prepare('SELECT * FROM subjects WHERE id = ?')
      .bind(insertResult.meta.last_row_id)
      .first<Subject>();

    return c.json(created, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create subject';
    return c.json({ error: 'INTERNAL_ERROR', message }, 500);
  }
});

// PUT /api/subjects/:id (Admin Protected)
subjectsRoute.put('/:id', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid subject ID' }, 400);
  }

  const existing = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first<Subject>();
  if (!existing) {
    return c.json({ error: 'NOT_FOUND', message: 'Subject not found' }, 404);
  }

  try {
    const body = await c.req.json<{ name?: string; status?: string; display_order?: number }>();
    const name = body.name !== undefined ? body.name.trim() : existing.name;
    const status = body.status !== undefined ? body.status : existing.status;
    const display_order = body.display_order !== undefined ? body.display_order : existing.display_order;

    if (!name) {
      return c.json({ error: 'BAD_REQUEST', message: 'Subject name cannot be empty' }, 400);
    }

    // Check duplicate name on other records
    const duplicate = await db
      .prepare('SELECT id FROM subjects WHERE name = ? COLLATE NOCASE AND id != ?')
      .bind(name, id)
      .first();

    if (duplicate) {
      return c.json({ error: 'CONFLICT', message: `Subject "${name}" already exists` }, 409);
    }

    await db
      .prepare(
        'UPDATE subjects SET name = ?, status = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
      .bind(name, status, display_order, id)
      .run();

    const updated = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first<Subject>();
    return c.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update subject';
    return c.json({ error: 'INTERNAL_ERROR', message }, 500);
  }
});

// DELETE /api/subjects/:id (Admin Protected)
// Prevent deletion if faculty or schedules are associated
subjectsRoute.delete('/:id', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid subject ID' }, 400);
  }

  const existing = await db.prepare('SELECT id FROM subjects WHERE id = ?').bind(id).first<Subject>();
  if (!existing) {
    return c.json({ error: 'NOT_FOUND', message: 'Subject not found' }, 404);
  }

  // Check associated faculty
  const facultyCount = await db
    .prepare('SELECT COUNT(*) as count FROM faculty WHERE subject_id = ?')
    .bind(id)
    .first<{ count: number }>();

  if (facultyCount && facultyCount.count > 0) {
    return c.json(
      {
        error: 'CANNOT_DELETE',
        message: 'This subject cannot be deleted because faculty or schedules are associated with it.'
      },
      400
    );
  }

  // Check associated schedules
  const schedulesCount = await db
    .prepare('SELECT COUNT(*) as count FROM schedules WHERE subject_id = ?')
    .bind(id)
    .first<{ count: number }>();

  if (schedulesCount && schedulesCount.count > 0) {
    return c.json(
      {
        error: 'CANNOT_DELETE',
        message: 'This subject cannot be deleted because faculty or schedules are associated with it.'
      },
      400
    );
  }

  await db.prepare('DELETE FROM subjects WHERE id = ?').bind(id).run();
  return c.json({ success: true, message: 'Subject deleted successfully' });
});
