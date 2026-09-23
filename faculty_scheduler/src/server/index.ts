import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoute } from './routes/health';
import { dbHealthRoute } from './routes/db-health';
import { adminRoute } from './routes/admin';
import { subjectsRoute } from './routes/subjects';
import { facultyRoute } from './routes/faculty';
import { classesRoute } from './routes/classes';
import { schedulesRoute } from './routes/schedules';
import { syncRoute } from './routes/sync';
import { publicStudentRoute } from './routes/public-student';
import type { Env } from './types';

export const app = new Hono<Env>();

// Global middleware
app.use('*', logger());
app.use('*', cors());

// Health Routes
app.route('/api/health', healthRoute);
app.route('/api/db-health', dbHealthRoute);

// Admin Auth Route
app.route('/api/admin', adminRoute);

// Public Student Route (Aggressively cached & read-only for student portal)
app.route('/api/public/student-schedule', publicStudentRoute);

// Domain Routes
app.route('/api/subjects', subjectsRoute);
app.route('/api/faculty', facultyRoute);
app.route('/api/classes', classesRoute);
app.route('/api/schedules', schedulesRoute);
app.route('/api/sync', syncRoute);

export default app;
