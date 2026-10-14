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
import { youtubeSchedulesRoute } from './routes/youtube-schedules';
import { syncRoute } from './routes/sync';
import { publicStudentRoute } from './routes/public-student';
import { mcpRoute } from './routes/mcp';
import type { Env } from './types';

export const app = new Hono<Env>();

// Global middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-admin-token', 'mcp-protocol-version', 'last-event-id', 'accept', 'cache-control'],
  exposeHeaders: ['Content-Type', 'mcp-protocol-version', 'location'],
  maxAge: 86400,
}));

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
app.route('/api/youtube-schedules', youtubeSchedulesRoute);
app.route('/api/sync', syncRoute);

// MCP (Model Context Protocol) Remote Server Routes
app.route('/mcp', mcpRoute);
app.route('/sse', mcpRoute); // Alias for compatibility

// Route root path / to MCP if accessed by an MCP client or probe
app.on(['POST', 'OPTIONS', 'DELETE'], '/', (c) => mcpRoute.fetch(c.req.raw, c.env));
app.get('/', (c, next) => {
  const accept = c.req.header('accept') || '';
  if (
    accept.includes('text/event-stream') ||
    (accept.includes('application/json') && !accept.includes('text/html')) ||
    c.req.header('mcp-protocol-version') !== undefined ||
    c.req.query('mcp') !== undefined
  ) {
    return mcpRoute.fetch(c.req.raw, c.env);
  }
  return next();
});

export default app;

