import { Hono } from 'hono';
import type { Env, ClassItem } from '../types';
import { adminAuthMiddleware } from '../middleware/auth';

export const classesRoute = new Hono<Env>();

// GET /api/classes (Public)
classesRoute.get('/', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const status = c.req.query('status');
  let query = 'SELECT * FROM classes';
  const params: unknown[] = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY display_order ASC, name ASC';

  const stmt = db.prepare(query);
  const result = params.length > 0 ? await stmt.bind(...params).all<ClassItem>() : await stmt.all<ClassItem>();

  c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');
  return c.json(result.results || []);
});

// GET /api/classes/:id (Public)
classesRoute.get('/:id', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid class ID' }, 400);
  }

  const cls = await db.prepare('SELECT * FROM classes WHERE id = ?').bind(id).first<ClassItem>();
  if (!cls) {
    return c.json({ error: 'NOT_FOUND', message: 'Class not found' }, 404);
  }

  return c.json(cls);
});

// POST /api/classes (Admin Protected)
classesRoute.post('/', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  try {
    const body = await c.req.json<{
      name?: string;
      batch?: string;
      academic_year?: string;
      status?: string;
      display_order?: number;
    }>();

    if (!body || !body.name || !body.name.trim()) {
      return c.json({ error: 'BAD_REQUEST', message: 'Class name is required' }, 400);
    }

    const name = body.name.trim();
    const batch = body.batch?.trim() || null;
    const academic_year = body.academic_year?.trim() || null;
    const status = body.status || 'active';
    const display_order = body.display_order ?? 0;

    const insertResult = await db
      .prepare('INSERT INTO classes (name, batch, academic_year, status, display_order) VALUES (?, ?, ?, ?, ?)')
      .bind(name, batch, academic_year, status, display_order)
      .run();

    const created = await db
      .prepare('SELECT * FROM classes WHERE id = ?')
      .bind(insertResult.meta.last_row_id)
      .first<ClassItem>();

    return c.json(created, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create class';
    return c.json({ error: 'INTERNAL_ERROR', message }, 500);
  }
});

// PUT /api/classes/:id (Admin Protected)
classesRoute.put('/:id', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid class ID' }, 400);
  }

  const existing = await db.prepare('SELECT * FROM classes WHERE id = ?').bind(id).first<ClassItem>();
  if (!existing) {
    return c.json({ error: 'NOT_FOUND', message: 'Class not found' }, 404);
  }

  try {
    const body = await c.req.json<{
      name?: string;
      batch?: string | null;
      academic_year?: string | null;
      status?: string;
      display_order?: number;
    }>();

    const name = body.name !== undefined ? body.name.trim() : existing.name;
    const batch = body.batch !== undefined ? body.batch?.trim() || null : existing.batch;
    const academic_year =
      body.academic_year !== undefined ? body.academic_year?.trim() || null : existing.academic_year;
    const status = body.status !== undefined ? body.status : existing.status;
    const display_order = body.display_order !== undefined ? body.display_order : existing.display_order;

    if (!name) {
      return c.json({ error: 'BAD_REQUEST', message: 'Class name cannot be empty' }, 400);
    }

    await db
      .prepare(
        `UPDATE classes
         SET name = ?, batch = ?, academic_year = ?, status = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(name, batch, academic_year, status, display_order, id)
      .run();

    const updated = await db.prepare('SELECT * FROM classes WHERE id = ?').bind(id).first<ClassItem>();
    return c.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update class';
    return c.json({ error: 'INTERNAL_ERROR', message }, 500);
  }
});

// DELETE /api/classes/:id (Admin Protected)
// Prevent deletion if schedules are linked
classesRoute.delete('/:id', adminAuthMiddleware, async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid class ID' }, 400);
  }

  const existing = await db.prepare('SELECT id FROM classes WHERE id = ?').bind(id).first<ClassItem>();
  if (!existing) {
    return c.json({ error: 'NOT_FOUND', message: 'Class not found' }, 404);
  }

  const schedulesCount = await db
    .prepare('SELECT COUNT(*) as count FROM schedules WHERE class_id = ?')
    .bind(id)
    .first<{ count: number }>();

  if (schedulesCount && schedulesCount.count > 0) {
    return c.json(
      {
        error: 'CANNOT_DELETE',
        message: 'This class cannot be deleted because schedules are associated with it.'
      },
      400
    );
  }

  await db.prepare('DELETE FROM classes WHERE id = ?').bind(id).run();
  return c.json({ success: true, message: 'Class deleted successfully' });
});
