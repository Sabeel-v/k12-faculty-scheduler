import { Hono } from 'hono';
import type { Env } from '../types';

export const syncRoute = new Hono<Env>();

/**
 * GET /api/sync/version
 * Returns a lightweight fingerprint of the current schedules table.
 * Optional query: faculty_id (number) to get faculty-specific fingerprint.
 *
 * This allows client tabs to poll a tiny 50-byte response every 25-30s.
 * Only if the fingerprint changes does the client fetch the full schedule dataset.
 */
syncRoute.get('/version', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const facultyId = c.req.query('faculty_id');

  let query = 'SELECT COUNT(*) as count, MAX(updated_at) as last_updated FROM schedules';
  const params: unknown[] = [];

  if (facultyId && !isNaN(Number(facultyId))) {
    query += ' WHERE faculty_id = ?';
    params.push(Number(facultyId));
  }

  try {
    const stmt = db.prepare(query);
    const row = params.length > 0 ? await stmt.bind(...params).first<any>() : await stmt.first<any>();

    const count = row?.count ?? 0;
    const lastUpdated = row?.last_updated ?? 'none';
    const version = `${count}-${lastUpdated}`;

    // Return no-cache for the sync check itself so browser always gets the latest version tag
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');

    return c.json({
      version,
      timestamp: Date.now()
    });
  } catch (err: any) {
    return c.json({ error: 'QUERY_FAILED', message: err?.message || 'Sync check failed' }, 500);
  }
});
