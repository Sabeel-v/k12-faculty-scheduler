import { Hono } from 'hono';
import type { Env, Schedule, ClassItem } from '../types';

export const publicStudentRoute = new Hono<Env>();

// Helper to format joined schedule item
function mapPublicScheduleRow(row: any): Schedule {
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
 * GET /api/public/student-schedule
 * Public, read-only endpoint tailored for the Next.js / React student portal.
 *
 * Query params (all optional):
 * - class_id: filter schedules by class ID (if omitted, returns schedules for all active classes)
 * - from_date: starting date (YYYY-MM-DD), defaults to today's date in UTC/local
 * - days: number of days forward to load (defaults to 30)
 *
 * Responses include aggressive caching headers (s-maxage=1800) so Cloudflare CDN
 * serves repeat requests without re-querying D1 or consuming worker limits.
 */
publicStudentRoute.get('/', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'DATABASE_UNAVAILABLE', message: 'D1 DB binding not found' }, 503);
  }

  const classIdParam = c.req.query('class_id');
  const fromDateParam = c.req.query('from_date');
  const daysParam = c.req.query('days');

  const classId = classIdParam ? Number(classIdParam) : null;
  const days = daysParam ? Math.min(Math.max(Number(daysParam) || 30, 1), 60) : 30;

  // Calculate default from_date as YYYY-MM-DD (today) if not supplied
  const todayStr = fromDateParam && /^\d{4}-\d{2}-\d{2}$/.test(fromDateParam)
    ? fromDateParam
    : new Date().toISOString().split('T')[0];

  try {
    // 1. Fetch active classes list for the dropdown
    const classesQuery = `
      SELECT id, name, batch, academic_year, display_order
      FROM classes
      WHERE status = 'active'
      ORDER BY display_order ASC, name ASC
    `;
    const classesResult = await db.prepare(classesQuery).all<ClassItem>();
    const classes = classesResult.results || [];

    // 2. Fetch upcoming schedules from `from_date` onwards
    let scheduleQuery = `
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
      WHERE sc.status != 'cancelled'
        AND sc.schedule_date >= ?
        AND sc.schedule_date <= date(?, '+' || ? || ' days')
    `;

    const params: unknown[] = [todayStr, todayStr, days];

    if (classId && !isNaN(classId)) {
      scheduleQuery += ' AND sc.class_id = ?';
      params.push(classId);
    }

    scheduleQuery += ' ORDER BY sc.schedule_date ASC, sc.start_time ASC';

    const schedulesResult = await db.prepare(scheduleQuery).bind(...params).all<any>();
    const schedules = (schedulesResult.results || []).map(mapPublicScheduleRow);

    // Cache for 10 minutes at Edge, allow serving stale if origin temporarily down
    c.header('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=120');

    return c.json({
      server_date: todayStr,
      classes,
      schedules
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch student schedule';
    return c.json({ error: 'INTERNAL_ERROR', message }, 500);
  }
});
