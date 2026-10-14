import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import app from '../src/server/index.ts';
import workerEntry from '../src/index.ts';
import { getTodayKolkata } from '../src/server/services/scheduling.ts';

// Helper to construct mock Cloudflare D1 database wrapping in-memory SQLite
function createMockD1Database() {
  const sqlite = new DatabaseSync(':memory:');

  // Apply migrations
  const mig1 = fs.readFileSync(path.resolve('migrations/0001_create_scheduler_tables.sql'), 'utf8');
  sqlite.exec(mig1);
  const mig2 = fs.readFileSync(path.resolve('migrations/0002_create_youtube_schedules.sql'), 'utf8');
  sqlite.exec(mig2);

  // Seed sample faculty for testing
  // Subjects: 1: Biology, 2: Mathematics, 3: Physics, 4: Chemistry
  sqlite.exec(`
    INSERT INTO faculty (id, subject_id, name, department, phone, status, display_order) VALUES
      (1, 2, 'Ahmed', 'Math Dept', '9876543210', 'active', 1),
      (2, 4, 'Sarah', 'Science Dept', '9876543211', 'active', 2),
      (3, 3, 'John', 'Science Dept', '9876543212', 'active', 3),
      (4, 1, 'Adheeshna', 'Commerce & Science Dept', '9876543213', 'active', 4);

    INSERT OR IGNORE INTO classes (id, name, batch, display_order) VALUES
      (4, 'Plus One Commerce', 'Commerce', 4);
  `);

  return {
    sqlite,
    async batch(statements) {
      const results = [];
      for (const s of statements) {
        results.push(await s.run());
      }
      return results;
    },
    prepare(sql) {
      return {
        _sql: sql,
        _params: [],
        bind(...params) {
          this._params = params;
          return this;
        },
        async all() {
          const stmt = sqlite.prepare(this._sql);
          const results = stmt.all(...this._params);
          return { results, success: true, meta: { duration: 1 } };
        },
        async first(colName) {
          const stmt = sqlite.prepare(this._sql);
          const row = stmt.get(...this._params);
          if (!row) return null;
          return colName ? row[colName] : row;
        },
        async run() {
          const stmt = sqlite.prepare(this._sql);
          const info = stmt.run(...this._params);
          return {
            success: true,
            meta: {
              last_row_id: Number(info.lastInsertRowid),
              changes: Number(info.changes),
              duration: 1
            }
          };
        }
      };
    }
  };
}

describe('MCP Server & Scheduling Test Suite', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1Database();
    env = {
      DB: mockDb,
      ADMIN_PASSWORD: 'test-admin-secret',
      ASSETS: {
        async fetch(req) {
          return new Response('Mock React App PWA HTML', {
            status: 200,
            headers: { 'content-type': 'text/html' }
          });
        }
      }
    };
  });

  // Helper to send JSON-RPC calls to /mcp
  async function callMcpRpc(method, params, headers = {}) {
    const reqHeaders = {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
      ...headers
    };

    const res = await app.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Math.floor(Math.random() * 10000),
          method,
          params
        })
      }),
      env
    );

    const bodyText = await res.text();
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch {
      throw new Error(`Failed to parse response JSON: status=${res.status}, body=${bodyText}`);
    }

    return { status: res.status, data };
  }

  // 1. Test MCP Tool Discovery
  test('MCP initialization and tools/list discovery', async () => {
    const initRes = await callMcpRpc('initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'test-client', version: '1.0' },
      capabilities: {}
    });
    assert.equal(initRes.status, 200);
    assert.equal(initRes.data.result.serverInfo.name, 'k12-faculty-scheduler-mcp');

    const listRes = await callMcpRpc('tools/list', {});
    assert.equal(listRes.status, 200);
    const tools = listRes.data.result.tools;
    assert.ok(Array.isArray(tools));
    const toolNames = tools.map((t) => t.name);
    assert.ok(toolNames.includes('get_todays_schedule'));
    assert.ok(toolNames.includes('search_schedules'));
    assert.ok(toolNames.includes('get_faculty_availability'));
    assert.ok(toolNames.includes('check_schedule_conflicts'));
    assert.ok(toolNames.includes('create_schedule'));
    assert.ok(toolNames.includes('update_schedule'));
    assert.ok(toolNames.includes('cancel_schedule'));
    // YouTube Deliverables Tools
    assert.ok(toolNames.includes('get_todays_youtube_deliverables'));
    assert.ok(toolNames.includes('search_youtube_deliverables'));
    assert.ok(toolNames.includes('create_youtube_deliverable'));
    assert.ok(toolNames.includes('update_youtube_deliverable'));
    assert.ok(toolNames.includes('cancel_youtube_deliverable'));
    assert.ok(tools.length >= 12);
  });

  // 2. Test 1: Fetching today's schedule in Asia/Kolkata time
  test('Test 1: Fetching today schedule in Asia/Kolkata timezone', async () => {
    const today = getTodayKolkata();
    // Seed a schedule for today
    mockDb.sqlite.exec(`
      INSERT INTO schedules (schedule_date, start_time, end_time, class_id, subject_id, faculty_id, schedule_type, status)
      VALUES ('${today}', '10:00', '11:00', 1, 2, 1, 'Regular', 'scheduled');
    `);

    const res = await callMcpRpc('tools/call', {
      name: 'get_todays_schedule',
      arguments: {}
    });

    assert.equal(res.status, 200);
    const resultObj = JSON.parse(res.data.result.content[0].text);
    assert.equal(resultObj.date, today);
    assert.equal(resultObj.timezone, 'Asia/Kolkata');
    assert.equal(resultObj.totalSessions, 1);
    assert.equal(resultObj.schedules[0].faculty, 'Ahmed');
  });

  // 3. Test 2: Searching by faculty, class, subject, and date range
  test('Test 2: Searching schedules by faculty, class, subject, and date range', async () => {
    mockDb.sqlite.exec(`
      INSERT INTO schedules (schedule_date, start_time, end_time, class_id, subject_id, faculty_id, schedule_type, status) VALUES
        ('2026-10-15', '09:00', '10:00', 1, 2, 1, 'Regular', 'scheduled'),
        ('2026-10-16', '11:00', '12:00', 2, 4, 2, 'Revision', 'scheduled'),
        ('2026-10-25', '14:00', '15:00', 1, 3, 3, 'Regular', 'scheduled');
    `);

    // Search by date range
    const rangeRes = await callMcpRpc('tools/call', {
      name: 'search_schedules',
      arguments: {
        start_date: '2026-10-14',
        end_date: '2026-10-20'
      }
    });
    const rangeResult = JSON.parse(rangeRes.data.result.content[0].text);
    assert.equal(rangeResult.count, 2);

    // Search by faculty 'Ahmed'
    const facRes = await callMcpRpc('tools/call', {
      name: 'search_schedules',
      arguments: { faculty_identifier: 'Ahmed' }
    });
    const facResult = JSON.parse(facRes.data.result.content[0].text);
    assert.equal(facResult.count, 1);
    assert.equal(facResult.schedules[0].faculty, 'Ahmed');

    // Search by subject 'Chemistry'
    const subjRes = await callMcpRpc('tools/call', {
      name: 'search_schedules',
      arguments: { subject_identifier: 'Chemistry' }
    });
    const subjResult = JSON.parse(subjRes.data.result.content[0].text);
    assert.equal(subjResult.count, 1);
    assert.equal(subjResult.schedules[0].subject, 'Chemistry');
  });

  // 4. Test 3: Detecting overlapping sessions (Availability & Conflict Tools)
  test('Test 3: Detecting overlapping sessions', async () => {
    mockDb.sqlite.exec(`
      INSERT INTO schedules (schedule_date, start_time, end_time, class_id, subject_id, faculty_id, schedule_type, status)
      VALUES ('2026-10-16', '14:00', '15:30', 1, 2, 1, 'Regular', 'scheduled');
    `);

    // Availability check during overlapping slot
    const availRes = await callMcpRpc('tools/call', {
      name: 'get_faculty_availability',
      arguments: {
        faculty_identifier: 'Ahmed',
        date: '2026-10-16',
        start_time: '14:30',
        end_time: '15:00'
      }
    });
    const avail = JSON.parse(availRes.data.result.content[0].text);
    assert.equal(avail.isAvailable, false);
    assert.equal(avail.conflictingSchedules.length, 1);

    // Availability check during free slot
    const freeRes = await callMcpRpc('tools/call', {
      name: 'get_faculty_availability',
      arguments: {
        faculty_identifier: 'Ahmed',
        date: '2026-10-16',
        start_time: '16:00',
        end_time: '17:00'
      }
    });
    const freeAvail = JSON.parse(freeRes.data.result.content[0].text);
    assert.equal(freeAvail.isAvailable, true);

    // Conflict check tool
    const conflictRes = await callMcpRpc('tools/call', {
      name: 'check_schedule_conflicts',
      arguments: {
        faculty_identifier: 'Ahmed',
        class_identifier: 'SSLC',
        date: '2026-10-16',
        start_time: '15:00',
        end_time: '16:00'
      }
    });
    const confReport = JSON.parse(conflictRes.data.result.content[0].text);
    assert.equal(confReport.hasConflict, true);
  });

  // 5. Test 4: Creating a valid schedule
  test('Test 4: Creating a valid schedule with confirmation gate', async () => {
    // Step A: Dry run preview (confirm: false)
    const previewRes = await callMcpRpc(
      'tools/call',
      {
        name: 'create_schedule',
        arguments: {
          date: '2026-10-18',
          start_time: '18:00',
          end_time: '19:00',
          class_identifier: 'SSLC',
          subject_identifier: 'Mathematics',
          faculty_identifier: 'Ahmed',
          schedule_type: 'Regular',
          confirm: false
        }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );
    const previewObj = JSON.parse(previewRes.data.result.content[0].text);
    assert.equal(previewObj.status, 'PREVIEW_AWAITING_CONFIRMATION');

    // Verify nothing committed yet
    const checkRow = mockDb.sqlite.prepare("SELECT count(*) as cnt FROM schedules WHERE schedule_date = '2026-10-18'").get();
    assert.equal(checkRow.cnt, 0);

    // Step B: Confirm commit (confirm: true)
    const commitRes = await callMcpRpc(
      'tools/call',
      {
        name: 'create_schedule',
        arguments: {
          date: '2026-10-18',
          start_time: '18:00',
          end_time: '19:00',
          class_identifier: 'SSLC',
          subject_identifier: 'Mathematics',
          faculty_identifier: 'Ahmed',
          schedule_type: 'Regular',
          confirm: true
        }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );
    const commitObj = JSON.parse(commitRes.data.result.content[0].text);
    assert.equal(commitObj.success, true);
    assert.ok(commitObj.scheduleId > 0);

    const saved = mockDb.sqlite.prepare('SELECT * FROM schedules WHERE id = ?').get(commitObj.scheduleId);
    assert.equal(saved.schedule_date, '2026-10-18');
    assert.equal(saved.start_time, '18:00');
  });

  // 6. Test 5: Rejecting invalid or incomplete schedule data
  test('Test 5: Rejecting invalid or mismatched schedule data', async () => {
    // Faculty Sarah belongs to Chemistry (subject ID 4). Trying to assign to Mathematics (subject ID 2) must fail.
    const mismatchRes = await callMcpRpc(
      'tools/call',
      {
        name: 'create_schedule',
        arguments: {
          date: '2026-10-19',
          start_time: '10:00',
          class_identifier: 'SSLC',
          subject_identifier: 'Mathematics',
          faculty_identifier: 'Sarah',
          confirm: true
        }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );
    assert.equal(mismatchRes.data.result.isError, true);
    assert.ok(mismatchRes.data.result.content[0].text.includes('Validation Error'));

    // Nonexistent class
    const badClassRes = await callMcpRpc(
      'tools/call',
      {
        name: 'create_schedule',
        arguments: {
          date: '2026-10-19',
          start_time: '10:00',
          class_identifier: 'NonexistentGradeXYZ',
          subject_identifier: 'Mathematics',
          faculty_identifier: 'Ahmed',
          confirm: true
        }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );
    assert.equal(badClassRes.data.result.isError, true);
  });

  // 7. Test 6: Preventing unauthorized writes
  test('Test 6: Preventing unauthorized schedule creation, updates, and cancellations', async () => {
    // Calling create_schedule without admin auth
    const unauthCreate = await callMcpRpc('tools/call', {
      name: 'create_schedule',
      arguments: {
        date: '2026-10-20',
        start_time: '10:00',
        class_identifier: 'SSLC',
        subject_identifier: 'Mathematics',
        faculty_identifier: 'Ahmed',
        confirm: true
      }
    });
    assert.equal(unauthCreate.data.result.isError, true);
    assert.ok(unauthCreate.data.result.content[0].text.includes('Permission Denied'));

    // Calling cancel_schedule without admin auth
    const unauthCancel = await callMcpRpc('tools/call', {
      name: 'cancel_schedule',
      arguments: { schedule_id: 1, confirm: true }
    });
    assert.equal(unauthCancel.data.result.isError, true);
    assert.ok(unauthCancel.data.result.content[0].text.includes('Permission Denied'));
  });

  // 8. Test 7: Updating an existing schedule
  test('Test 7: Updating an existing schedule with conflict recheck', async () => {
    mockDb.sqlite.exec(`
      INSERT INTO schedules (id, schedule_date, start_time, end_time, class_id, subject_id, faculty_id, schedule_type, status)
      VALUES (101, '2026-10-21', '14:00', '15:00', 1, 2, 1, 'Regular', 'scheduled');
    `);

    // Update time from 14:00 to 18:00
    const updateRes = await callMcpRpc(
      'tools/call',
      {
        name: 'update_schedule',
        arguments: {
          schedule_id: 101,
          start_time: '18:00',
          end_time: '19:00',
          confirm: true
        }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );

    assert.equal(updateRes.status, 200);
    const updateObj = JSON.parse(updateRes.data.result.content[0].text);
    assert.equal(updateObj.success, true);
    assert.equal(updateObj.schedule.start_time, '18:00');
    assert.equal(updateObj.schedule.end_time, '19:00');
  });

  // 9. Test 8: Rejecting ambiguous schedule references
  test('Test 8: Rejecting non-existent schedule references', async () => {
    const res = await callMcpRpc(
      'tools/call',
      {
        name: 'cancel_schedule',
        arguments: { schedule_id: 999999, confirm: true }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );
    assert.equal(res.data.result.isError, true);
    assert.ok(res.data.result.content[0].text.includes('Schedule #999999 not found'));
  });

  // 10. Test 9: Preventing duplicate / conflicting creation
  test('Test 9: Preventing duplicate schedule / time conflict creation', async () => {
    mockDb.sqlite.exec(`
      INSERT INTO schedules (schedule_date, start_time, end_time, class_id, subject_id, faculty_id, schedule_type, status)
      VALUES ('2026-10-22', '09:00', '10:00', 1, 2, 1, 'Regular', 'scheduled');
    `);

    // Attempt to schedule Ahmed again at 09:30 on same date
    const dupRes = await callMcpRpc(
      'tools/call',
      {
        name: 'create_schedule',
        arguments: {
          date: '2026-10-22',
          start_time: '09:30',
          end_time: '10:30',
          class_identifier: 'Class 9',
          subject_identifier: 'Mathematics',
          faculty_identifier: 'Ahmed',
          confirm: true
        }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );

    assert.equal(dupRes.data.result.isError, true);
    assert.ok(dupRes.data.result.content[0].text.includes('Schedule Conflict'));
  });

  // 11. Test 10: Preserving existing API behavior
  test('Test 10: Preserving existing REST API endpoints', async () => {
    // Health check
    const healthRes = await app.fetch(new Request('http://localhost/api/health'), env);
    assert.equal(healthRes.status, 200);

    // Classes route
    const classesRes = await app.fetch(new Request('http://localhost/api/classes'), env);
    assert.equal(classesRes.status, 200);
    const classes = await classesRes.json();
    assert.ok(Array.isArray(classes));
    assert.equal(classes.length, 4);

    // Schedules route
    const schedulesRes = await app.fetch(new Request('http://localhost/api/schedules'), env);
    assert.equal(schedulesRes.status, 200);
    const schedules = await schedulesRes.json();
    assert.ok(Array.isArray(schedules));
  });

  // 12. Test 11: Preserving existing React PWA functionality
  test('Test 11: Preserving React PWA routing via Worker entry', async () => {
    const pwaRes = await workerEntry.fetch(new Request('http://localhost/'), env, {});
    assert.equal(pwaRes.status, 200);
    const html = await pwaRes.text();
    assert.equal(html, 'Mock React App PWA HTML');

    // Worker entry also handles /mcp
    const mcpWorkerRes = await workerEntry.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {}
        })
      }),
      env,
      {}
    );
    assert.equal(mcpWorkerRes.status, 200);
    const mcpData = await mcpWorkerRes.json();
    assert.ok(mcpData.result.tools.length >= 7);
  });

  // 13. Test 12: Handling MCP transport and authentication failures
  test('Test 12: Handling MCP authentication and transport edge cases', async () => {
    // Invalid bearer token
    const badAuthRes = await app.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer wrong-password-token'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {}
        })
      }),
      env
    );
    assert.equal(badAuthRes.status, 401);
    const badAuthData = await badAuthRes.json();
    assert.ok(badAuthData.error.message.includes('Authentication Failed'));

    // Valid Bearer auth works
    const goodBearerRes = await callMcpRpc(
      'tools/list',
      {},
      { authorization: 'Bearer test-admin-secret' }
    );
    assert.equal(goodBearerRes.status, 200);

    // Cancel tool workflow test
    mockDb.sqlite.exec(`
      INSERT INTO schedules (id, schedule_date, start_time, end_time, class_id, subject_id, faculty_id, schedule_type, status)
      VALUES (555, '2026-10-23', '10:00', '11:00', 1, 2, 1, 'Regular', 'scheduled');
    `);

    // Cancel with confirm: true
    const cancelRes = await callMcpRpc(
      'tools/call',
      {
        name: 'cancel_schedule',
        arguments: { schedule_id: 555, reason: 'Faculty on medical leave', confirm: true }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );
    assert.equal(cancelRes.status, 200);
    const cancelObj = JSON.parse(cancelRes.data.result.content[0].text);
    assert.equal(cancelObj.success, true);
    assert.equal(cancelObj.schedule.status, 'cancelled');

    // Verify cancelled schedule is no longer causing conflicts
    const conflictCheckAfterCancel = await callMcpRpc('tools/call', {
      name: 'check_schedule_conflicts',
      arguments: {
        faculty_identifier: 'Ahmed',
        class_identifier: 'SSLC',
        date: '2026-10-23',
        start_time: '10:00',
        end_time: '11:00'
      }
    });
    const afterCancelReport = JSON.parse(conflictCheckAfterCancel.data.result.content[0].text);
    assert.equal(afterCancelReport.hasConflict, false);
  });

  // =============================================================
  // YOUTUBE DELIVERABLES TEST SUITE
  // =============================================================

  // 14. Test 14: get_todays_youtube_deliverables
  test('Test 14: Fetching today YouTube deliverables in Asia/Kolkata timezone', async () => {
    const today = getTodayKolkata();
    // Seed a Live YouTube deliverable for today with Adheeshna & Plus One Commerce
    mockDb.sqlite.exec(`
      INSERT INTO youtube_schedules (id, schedule_date, start_time, schedule_type, is_common, subject_id, content, status)
      VALUES (901, '${today}', '18:00', 'Live', 0, 1, 'Plus One Commerce Accounts Live', 'scheduled');
      INSERT INTO youtube_schedule_classes (youtube_schedule_id, class_id) VALUES (901, 4);
      INSERT INTO youtube_schedule_faculties (youtube_schedule_id, faculty_id) VALUES (901, 4);
    `);

    const res = await callMcpRpc('tools/call', {
      name: 'get_todays_youtube_deliverables',
      arguments: {}
    });

    assert.equal(res.status, 200);
    const data = JSON.parse(res.data.result.content[0].text);
    assert.equal(data.date, today);
    assert.equal(data.timezone, 'Asia/Kolkata');
    assert.ok(data.totalDeliverables >= 1);
    const item = data.deliverables.find((d) => d.id === 901);
    assert.ok(item);
    assert.equal(item.category, 'Live');
    assert.ok(item.classes.some((c) => c.includes('Plus One Commerce')));
    assert.ok(item.faculties.includes('Adheeshna'));
    assert.equal(item.topic, 'Plus One Commerce Accounts Live');
  });

  // 15. Test 15: search_youtube_deliverables
  test('Test 15: Searching YouTube deliverables by category, faculty, class, and date range', async () => {
    mockDb.sqlite.exec(`
      INSERT INTO youtube_schedules (id, schedule_date, start_time, schedule_type, is_common, subject_id, content, status) VALUES
        (902, '2026-10-15', NULL, 'Shorts', 1, NULL, 'Biology Quick Revision Shorts', 'scheduled'),
        (903, '2026-10-16', '16:00', 'Content Video', 0, 2, 'Maths Vectors Chapter', 'scheduled'),
        (904, '2026-10-25', '19:00', 'Live', 0, 1, 'Commerce Exam Strategy', 'scheduled');

      INSERT INTO youtube_schedule_classes (youtube_schedule_id, class_id) VALUES
        (902, 1),
        (903, 2),
        (904, 4);

      INSERT INTO youtube_schedule_faculties (youtube_schedule_id, faculty_id) VALUES
        (902, 4),
        (903, 1),
        (904, 4);
    `);

    // Search by category 'Shorts'
    const shortsRes = await callMcpRpc('tools/call', {
      name: 'search_youtube_deliverables',
      arguments: { category: 'Shorts' }
    });
    const shortsData = JSON.parse(shortsRes.data.result.content[0].text);
    assert.ok(shortsData.count >= 1);
    assert.ok(shortsData.deliverables.some((d) => d.category === 'Shorts'));

    // Search by faculty 'Adheeshna'
    const facultyRes = await callMcpRpc('tools/call', {
      name: 'search_youtube_deliverables',
      arguments: { faculty_identifier: 'Adheeshna' }
    });
    const facultyData = JSON.parse(facultyRes.data.result.content[0].text);
    assert.ok(facultyData.count >= 2);
    assert.ok(facultyData.deliverables.every((d) => d.faculties.includes('Adheeshna')));

    // Search by class 'Plus One Commerce'
    const classRes = await callMcpRpc('tools/call', {
      name: 'search_youtube_deliverables',
      arguments: { class_identifier: 'Plus One Commerce' }
    });
    const classData = JSON.parse(classRes.data.result.content[0].text);
    assert.ok(classData.count >= 1);
    assert.ok(classData.deliverables.some((d) => d.classes.some((c) => c.includes('Plus One Commerce'))));

    // Search by date range
    const rangeRes = await callMcpRpc('tools/call', {
      name: 'search_youtube_deliverables',
      arguments: { start_date: '2026-10-15', end_date: '2026-10-20' }
    });
    const rangeData = JSON.parse(rangeRes.data.result.content[0].text);
    assert.equal(rangeData.count, 2);
  });

  // 16. Test 16: create_youtube_deliverable
  test('Test 16: Creating YouTube deliverable with preview, multi-class/faculty, and duplicate check', async () => {
    // Step A: Preview (confirm: false)
    const previewRes = await callMcpRpc(
      'tools/call',
      {
        name: 'create_youtube_deliverable',
        arguments: {
          date: '2026-10-18',
          category: 'Live',
          classes: ['Plus One Commerce', 'SSLC'],
          faculties: ['Adheeshna', 'Ahmed'],
          subject: 'Common',
          topic: 'Inter-Batch Commerce Quiz',
          start_time: '19:00',
          confirm: false
        }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );
    const previewData = JSON.parse(previewRes.data.result.content[0].text);
    assert.equal(previewData.status, 'PREVIEW_AWAITING_CONFIRMATION');
    assert.ok(previewData.proposedDeliverable.classes.includes('Plus One Commerce'));
    assert.ok(previewData.proposedDeliverable.faculties.includes('Adheeshna'));

    // Step B: Commit (confirm: true)
    const commitRes = await callMcpRpc(
      'tools/call',
      {
        name: 'create_youtube_deliverable',
        arguments: {
          date: '2026-10-18',
          category: 'Live',
          classes: ['Plus One Commerce', 'SSLC'],
          faculties: ['Adheeshna', 'Ahmed'],
          subject: 'Common',
          topic: 'Inter-Batch Commerce Quiz',
          start_time: '19:00',
          confirm: true
        }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );
    const commitData = JSON.parse(commitRes.data.result.content[0].text);
    assert.equal(commitData.success, true);
    assert.ok(commitData.deliverableId > 0);
    assert.equal(commitData.deliverable.category, 'Live');
    assert.equal(commitData.deliverable.classes.length, 2);
    assert.equal(commitData.deliverable.faculties.length, 2);

    // Step C: Duplicate prevention
    const dupRes = await callMcpRpc(
      'tools/call',
      {
        name: 'create_youtube_deliverable',
        arguments: {
          date: '2026-10-18',
          category: 'Live',
          classes: ['Plus One Commerce'],
          faculties: ['Adheeshna'],
          topic: 'Inter-Batch Commerce Quiz',
          confirm: true
        }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );
    assert.equal(dupRes.data.result.isError, true);
    assert.ok(dupRes.data.result.content[0].text.includes('Duplicate deliverable detected'));
  });

  // 17. Test 17: update_youtube_deliverable
  test('Test 17: Updating YouTube deliverable (moving date to tomorrow and changing details)', async () => {
    mockDb.sqlite.exec(`
      INSERT INTO youtube_schedules (id, schedule_date, start_time, schedule_type, is_common, subject_id, content, status)
      VALUES (950, '2026-10-19', '17:00', 'Content Video', 0, 2, 'Original Topic', 'scheduled');
      INSERT INTO youtube_schedule_classes (youtube_schedule_id, class_id) VALUES (950, 1);
      INSERT INTO youtube_schedule_faculties (youtube_schedule_id, faculty_id) VALUES (950, 1);
    `);

    // Move date to tomorrow '2026-10-20', change category to 'Live' and update topic
    const updateRes = await callMcpRpc(
      'tools/call',
      {
        name: 'update_youtube_deliverable',
        arguments: {
          deliverable_id: 950,
          date: '2026-10-20',
          category: 'Live',
          topic: 'Rescheduled Topic for Tomorrow',
          confirm: true
        }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );

    assert.equal(updateRes.status, 200);
    const updateData = JSON.parse(updateRes.data.result.content[0].text);
    assert.equal(updateData.success, true);
    assert.equal(updateData.deliverable.date, '2026-10-20');
    assert.equal(updateData.deliverable.category, 'Live');
    assert.equal(updateData.deliverable.topic, 'Rescheduled Topic for Tomorrow');
  });

  // 18. Test 18: cancel_youtube_deliverable
  test('Test 18: Cancelling and deleting YouTube deliverables with confirmation', async () => {
    mockDb.sqlite.exec(`
      INSERT INTO youtube_schedules (id, schedule_date, start_time, schedule_type, is_common, subject_id, content, status)
      VALUES (960, '2026-10-21', '12:00', 'Shorts', 1, NULL, 'To Be Cancelled', 'scheduled');
      INSERT INTO youtube_schedule_classes (youtube_schedule_id, class_id) VALUES (960, 1);
      INSERT INTO youtube_schedule_faculties (youtube_schedule_id, faculty_id) VALUES (960, 1);

      INSERT INTO youtube_schedules (id, schedule_date, start_time, schedule_type, is_common, subject_id, content, status)
      VALUES (961, '2026-10-22', '12:00', 'Shorts', 1, NULL, 'To Be Deleted', 'scheduled');
      INSERT INTO youtube_schedule_classes (youtube_schedule_id, class_id) VALUES (961, 1);
      INSERT INTO youtube_schedule_faculties (youtube_schedule_id, faculty_id) VALUES (961, 1);
    `);

    // Preview gate
    const previewRes = await callMcpRpc(
      'tools/call',
      {
        name: 'cancel_youtube_deliverable',
        arguments: { deliverable_id: 960, reason: 'Faculty unwell', confirm: false }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );
    const previewData = JSON.parse(previewRes.data.result.content[0].text);
    assert.equal(previewData.status, 'PREVIEW_AWAITING_CONFIRMATION');

    // Cancel workflow (marks status = 'cancelled')
    const cancelRes = await callMcpRpc(
      'tools/call',
      {
        name: 'cancel_youtube_deliverable',
        arguments: { deliverable_id: 960, reason: 'Faculty unwell', confirm: true }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );
    const cancelData = JSON.parse(cancelRes.data.result.content[0].text);
    assert.equal(cancelData.success, true);
    assert.equal(cancelData.deliverable.status, 'cancelled');

    // Permanent delete workflow
    const deleteRes = await callMcpRpc(
      'tools/call',
      {
        name: 'cancel_youtube_deliverable',
        arguments: { deliverable_id: 961, permanent_delete: true, confirm: true }
      },
      { 'x-admin-token': 'test-admin-secret' }
    );
    const deleteData = JSON.parse(deleteRes.data.result.content[0].text);
    assert.equal(deleteData.success, true);
    assert.ok(deleteData.message.includes('permanently deleted'));

    // Verify 961 is gone
    const checkRow = mockDb.sqlite.prepare('SELECT id FROM youtube_schedules WHERE id = 961').get();
    assert.equal(checkRow, undefined);
  });

  // 19. Test 19: Preventing unauthorized writes on YouTube deliverables
  test('Test 19: Preventing unauthorized writes on YouTube deliverables', async () => {
    // Unauthenticated create
    const unauthCreate = await callMcpRpc('tools/call', {
      name: 'create_youtube_deliverable',
      arguments: {
        date: '2026-10-22',
        category: 'Live',
        classes: ['SSLC'],
        faculties: ['Ahmed'],
        confirm: true
      }
    });
    assert.equal(unauthCreate.data.result.isError, true);
    assert.ok(unauthCreate.data.result.content[0].text.includes('Permission Denied'));

    // Unauthenticated update
    const unauthUpdate = await callMcpRpc('tools/call', {
      name: 'update_youtube_deliverable',
      arguments: {
        deliverable_id: 902,
        topic: 'Hacked topic',
        confirm: true
      }
    });
    assert.equal(unauthUpdate.data.result.isError, true);
    assert.ok(unauthUpdate.data.result.content[0].text.includes('Permission Denied'));

    // Unauthenticated cancel
    const unauthCancel = await callMcpRpc('tools/call', {
      name: 'cancel_youtube_deliverable',
      arguments: {
        deliverable_id: 902,
        confirm: true
      }
    });
    assert.equal(unauthCancel.data.result.isError, true);
    assert.ok(unauthCancel.data.result.content[0].text.includes('Permission Denied'));
  });

  test('Test 20: Gemini handshake verification probes, CORS preflight, and Base URL routing', async () => {
    // 1. OPTIONS preflight
    const optionsRes = await app.fetch(
      new Request('http://localhost/mcp', { method: 'OPTIONS' }),
      env
    );
    assert.equal(optionsRes.status, 204);
    assert.equal(optionsRes.headers.get('Access-Control-Allow-Origin'), '*');
    assert.ok(optionsRes.headers.get('Access-Control-Allow-Methods')?.includes('POST'));
    assert.ok(optionsRes.headers.get('Access-Control-Allow-Headers')?.includes('Content-Type'));

    // 2. GET /mcp probe with Accept: application/json
    const getMcpRes = await app.fetch(
      new Request('http://localhost/mcp', {
        method: 'GET',
        headers: { accept: 'application/json' }
      }),
      env
    );
    assert.equal(getMcpRes.status, 200);
    assert.ok(getMcpRes.headers.get('Content-Type')?.includes('application/json'));
    assert.equal(getMcpRes.headers.get('Access-Control-Allow-Origin'), '*');
    const mcpData = await getMcpRes.json();
    assert.equal(mcpData.status, 'ok');
    assert.ok(Array.isArray(mcpData.transports));
    assert.ok(mcpData.transports.includes('streamable-http'));
    assert.ok(mcpData.transports.includes('sse'));

    // 3. GET /sse probe with Accept: application/json
    const getSseRes = await app.fetch(
      new Request('http://localhost/sse', {
        method: 'GET',
        headers: { accept: 'application/json' }
      }),
      env
    );
    assert.equal(getSseRes.status, 200);
    const sseData = await getSseRes.json();
    assert.equal(sseData.status, 'ok');

    // 4. Base URL probe (http://localhost/)
    const rootRes = await app.fetch(
      new Request('http://localhost/', {
        method: 'GET',
        headers: { accept: 'application/json' }
      }),
      env
    );
    assert.equal(rootRes.status, 200);
    const rootData = await rootRes.json();
    assert.equal(rootData.status, 'ok');

    // 5. HEAD /mcp probe
    const headRes = await app.fetch(
      new Request('http://localhost/mcp', { method: 'HEAD' }),
      env
    );
    assert.equal(headRes.status, 200);
    assert.ok(headRes.headers.get('Content-Type')?.includes('application/json'));
  });

  test('Test 21: Gemini SSE handshake with immediate endpoint event', async () => {
    // 1. SSE handshake on /mcp
    const sseRes = await app.fetch(
      new Request('http://localhost/mcp', {
        method: 'GET',
        headers: { accept: 'text/event-stream' }
      }),
      env
    );
    assert.equal(sseRes.status, 200);
    assert.ok(sseRes.headers.get('Content-Type')?.includes('text/event-stream'));
    assert.equal(sseRes.headers.get('Access-Control-Allow-Origin'), '*');

    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    const firstChunk = await reader.read();
    assert.equal(firstChunk.done, false);
    const text = decoder.decode(firstChunk.value);
    assert.ok(text.includes('event: endpoint'));
    assert.ok(text.includes('data: /mcp'));
    await reader.cancel();

    // 2. SSE handshake on /sse
    const sseAliasRes = await app.fetch(
      new Request('http://localhost/sse', {
        method: 'GET',
        headers: { accept: 'text/event-stream' }
      }),
      env
    );
    assert.equal(sseAliasRes.status, 200);
    const aliasReader = sseAliasRes.body.getReader();
    const aliasChunk = await aliasReader.read();
    assert.equal(aliasChunk.done, false);
    const aliasText = decoder.decode(aliasChunk.value);
    assert.ok(aliasText.includes('event: endpoint'));
    assert.ok(aliasText.includes('data: /mcp'));
    await aliasReader.cancel();
  });
});


