import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../types';
import type { McpAuthContext } from './auth';
import {
  getTodaysSchedules,
  searchSchedules,
  getFacultyAvailability,
  checkScheduleConflicts,
  createScheduleRecord,
  updateScheduleRecord,
  cancelScheduleRecord,
  resolveFaculty,
  resolveClass,
  resolveSubject,
  getTodayKolkata,
  isValidDateFormat
} from '../services/scheduling';
import {
  searchYouTubeDeliverables,
  fetchYouTubeDeliverableById,
  createYouTubeDeliverableRecord,
  updateYouTubeDeliverableRecord,
  cancelYouTubeDeliverableRecord,
  normalizeYouTubeType
} from '../services/youtubeScheduling';
import { DEFAULT_DEV_ADMIN_PASSWORD } from '../middleware/auth';


/**
 * Factory function creating a fully configured McpServer with scheduling tools.
 */
export function createSchedulerMcpServer(
  db: D1Database,
  env?: Env['Bindings'],
  authContext: McpAuthContext = { isAuthenticated: false, isAdmin: false }
): McpServer {
  const configuredPassword = env?.ADMIN_PASSWORD || DEFAULT_DEV_ADMIN_PASSWORD;

  function checkIsAdmin(token?: string): boolean {
    if (authContext.isAdmin) return true;
    if (token && token.trim() === configuredPassword) return true;
    return false;
  }

  const server = new McpServer({
    name: 'k12-faculty-scheduler-mcp',
    version: '1.0.0'
  });

  // -------------------------------------------------------------
  // Tool 1: get_todays_schedule
  // -------------------------------------------------------------
  server.tool(
    'get_todays_schedule',
    'Retrieve all scheduled classes for today in the Asia/Kolkata timezone, with optional filtering by class, subject, or faculty.',
    {
      class_filter: z
        .string()
        .optional()
        .describe('Optional class name or class ID filter (e.g. "SSLC", "Class 9", or 1)'),
      subject_filter: z
        .string()
        .optional()
        .describe('Optional subject name or subject ID filter (e.g. "Mathematics", "Physics", or 2)'),
      faculty_filter: z
        .string()
        .optional()
        .describe('Optional faculty name or faculty ID filter (e.g. "Ahmed", "Sarah", or 5)')
    },
    async ({ class_filter, subject_filter, faculty_filter }) => {
      try {
        const today = getTodayKolkata();
        const schedules = await getTodaysSchedules(db, {
          classIdentifier: class_filter,
          subjectIdentifier: subject_filter,
          facultyIdentifier: faculty_filter
        });

        const summary = {
          date: today,
          timezone: 'Asia/Kolkata',
          totalSessions: schedules.length,
          schedules: schedules.map((s) => ({
            id: s.id,
            date: s.schedule_date,
            startTime: s.start_time,
            endTime: s.end_time || null,
            class: s.class ? `${s.class.name}${s.class.batch ? ` (${s.class.batch})` : ''}` : `Class #${s.class_id}`,
            classId: s.class_id,
            subject: s.subject ? s.subject.name : `Subject #${s.subject_id}`,
            subjectId: s.subject_id,
            faculty: s.faculty ? s.faculty.name : `Faculty #${s.faculty_id}`,
            facultyId: s.faculty_id,
            sessionType: s.schedule_type,
            status: s.status,
            content: s.content || null,
            notes: s.notes || null
          }))
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(summary, null, 2)
            }
          ]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to retrieve today\'s schedule';
        return {
          isError: true,
          content: [{ type: 'text', text: `Error retrieving today's schedule: ${msg}` }]
        };
      }
    }
  );

  // -------------------------------------------------------------
  // Tool 2: search_schedules
  // -------------------------------------------------------------
  server.tool(
    'search_schedules',
    'Search timetable schedules across date ranges with flexible filters by faculty, class, subject, session type, or status.',
    {
      start_date: z
        .string()
        .optional()
        .describe('Start date in YYYY-MM-DD format (e.g. "2026-10-15")'),
      end_date: z
        .string()
        .optional()
        .describe('End date in YYYY-MM-DD format (e.g. "2026-10-20")'),
      class_identifier: z
        .string()
        .optional()
        .describe('Class name, batch, or numeric ID (e.g. "Class 8", "LMS", 3)'),
      subject_identifier: z
        .string()
        .optional()
        .describe('Subject name or numeric ID (e.g. "Biology", 1)'),
      faculty_identifier: z
        .string()
        .optional()
        .describe('Faculty name or numeric ID (e.g. "Ahmed", 2)'),
      session_type: z
        .string()
        .optional()
        .describe('Session type (e.g. "Regular", "Revision", "Session 1")'),
      status: z
        .string()
        .optional()
        .describe('Schedule status: "scheduled", "completed", or "cancelled"'),
      limit: z
        .number()
        .optional()
        .describe('Max results to return (default 50, maximum 100)')
    },
    async (args) => {
      try {
        if (args.start_date && !isValidDateFormat(args.start_date)) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Invalid start_date '${args.start_date}'. Must be YYYY-MM-DD.` }]
          };
        }
        if (args.end_date && !isValidDateFormat(args.end_date)) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Invalid end_date '${args.end_date}'. Must be YYYY-MM-DD.` }]
          };
        }

        const schedules = await searchSchedules(db, {
          startDate: args.start_date,
          endDate: args.end_date,
          classIdentifier: args.class_identifier,
          subjectIdentifier: args.subject_identifier,
          facultyIdentifier: args.faculty_identifier,
          sessionType: args.session_type,
          status: args.status,
          limit: args.limit
        });

        const result = {
          count: schedules.length,
          schedules: schedules.map((s) => ({
            id: s.id,
            date: s.schedule_date,
            startTime: s.start_time,
            endTime: s.end_time || null,
            class: s.class ? `${s.class.name}${s.class.batch ? ` (${s.class.batch})` : ''}` : `Class #${s.class_id}`,
            classId: s.class_id,
            subject: s.subject ? s.subject.name : `Subject #${s.subject_id}`,
            subjectId: s.subject_id,
            faculty: s.faculty ? s.faculty.name : `Faculty #${s.faculty_id}`,
            facultyId: s.faculty_id,
            sessionType: s.schedule_type,
            status: s.status,
            content: s.content || null,
            notes: s.notes || null
          }))
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Search failed';
        return {
          isError: true,
          content: [{ type: 'text', text: `Error searching schedules: ${msg}` }]
        };
      }
    }
  );

  // -------------------------------------------------------------
  // Tool 3: get_faculty_availability
  // -------------------------------------------------------------
  server.tool(
    'get_faculty_availability',
    'Determine whether a faculty member is free during a requested date and time interval, checking for existing overlapping schedules.',
    {
      faculty_identifier: z
        .string()
        .describe('Faculty name or ID to check (e.g. "Ahmed" or "1")'),
      date: z
        .string()
        .describe('Date in YYYY-MM-DD format (e.g. "2026-10-15")'),
      start_time: z
        .string()
        .describe('Start time, e.g. "18:00" or "6:00 PM"'),
      end_time: z
        .string()
        .optional()
        .describe('Optional end time, e.g. "19:00" or "7:00 PM"')
    },
    async ({ faculty_identifier, date, start_time, end_time }) => {
      try {
        if (!isValidDateFormat(date)) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Invalid date '${date}'. Expected YYYY-MM-DD format.` }]
          };
        }

        const availability = await getFacultyAvailability(db, {
          facultyIdentifier: faculty_identifier,
          date,
          startTime: start_time,
          endTime: end_time
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(availability, null, 2)
            }
          ]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Availability check failed';
        return {
          isError: true,
          content: [{ type: 'text', text: `Error checking faculty availability: ${msg}` }]
        };
      }
    }
  );

  // -------------------------------------------------------------
  // Tool 4: check_schedule_conflicts
  // -------------------------------------------------------------
  server.tool(
    'check_schedule_conflicts',
    'Validate a proposed schedule against existing timetable records to detect faculty or class overlaps before saving.',
    {
      faculty_identifier: z
        .string()
        .describe('Faculty name or numeric ID'),
      class_identifier: z
        .string()
        .describe('Class name or numeric ID'),
      date: z
        .string()
        .describe('Date in YYYY-MM-DD format'),
      start_time: z
        .string()
        .describe('Start time (e.g. "19:00" or "07:00 PM")'),
      end_time: z
        .string()
        .optional()
        .describe('Optional end time (e.g. "20:00" or "08:00 PM")'),
      session_type: z
        .string()
        .optional()
        .describe('Proposed session type'),
      exclude_schedule_id: z
        .number()
        .optional()
        .describe('Optional schedule ID to exclude from conflict check (when editing an existing session)')
    },
    async (args) => {
      try {
        if (!isValidDateFormat(args.date)) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Invalid date '${args.date}'. Must be YYYY-MM-DD.` }]
          };
        }

        const faculty = await resolveFaculty(db, args.faculty_identifier);
        if (!faculty) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Faculty '${args.faculty_identifier}' not found in database.` }]
          };
        }

        const classItem = await resolveClass(db, args.class_identifier);
        if (!classItem) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Class '${args.class_identifier}' not found in database.` }]
          };
        }

        const conflict = await checkScheduleConflicts(db, {
          schedule_date: args.date,
          start_time: args.start_time,
          end_time: args.end_time,
          faculty_id: faculty.id,
          class_id: classItem.id,
          excludeScheduleId: args.exclude_schedule_id
        });

        const report = {
          date: args.date,
          faculty: { id: faculty.id, name: faculty.name },
          class: { id: classItem.id, name: classItem.name },
          proposedTime: { startTime: args.start_time, endTime: args.end_time || null },
          hasConflict: conflict.hasConflict,
          conflictSummary: conflict.hasConflict ? conflict.reason : 'No timetable conflicts detected.',
          conflicts: conflict.conflictingSchedules || []
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(report, null, 2)
            }
          ]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Conflict check failed';
        return {
          isError: true,
          content: [{ type: 'text', text: `Error checking conflicts: ${msg}` }]
        };
      }
    }
  );

  // -------------------------------------------------------------
  // Tool 5: create_schedule
  // -------------------------------------------------------------
  server.tool(
    'create_schedule',
    'Create a new timetable schedule with validation against faculty subject match, foreign keys, and timetable conflicts. Requires admin authentication. Supports a dry-run confirmation step.',
    {
      date: z
        .string()
        .describe('Date in YYYY-MM-DD format (e.g. "2026-10-15")'),
      start_time: z
        .string()
        .describe('Start time (e.g. "19:00" or "7 PM")'),
      end_time: z
        .string()
        .optional()
        .describe('Optional end time (e.g. "20:00" or "8 PM")'),
      class_identifier: z
        .string()
        .describe('Class name or numeric ID (e.g. "Class 7", "SSLC", 1)'),
      subject_identifier: z
        .string()
        .describe('Subject name or numeric ID (e.g. "Mathematics", 2)'),
      faculty_identifier: z
        .string()
        .describe('Faculty name or numeric ID (e.g. "Ahmed", 3)'),
      schedule_type: z
        .string()
        .optional()
        .default('Regular')
        .describe('Session type, e.g. "Regular", "Revision", "Session 1"'),
      content: z
        .string()
        .optional()
        .describe('Optional content topic or chapter description'),
      notes: z
        .string()
        .optional()
        .describe('Optional internal notes'),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe('Confirmation flag. Set to true to commit to the database. If false, returns a dry-run preview for user approval.'),
      admin_token: z
        .string()
        .optional()
        .describe('Optional admin password/token if not already supplied via URL ?token=... or Authorization header.')
    },
    async (args) => {
      // 1. Authorization check
      if (!checkIsAdmin(args.admin_token)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Permission Denied: Admin authorization required to create a schedule. Connect your MCP URL with ?token=YOUR_PASSWORD (e.g. /mcp?token=...) or provide admin_token in the tool arguments.'
            }
          ]
        };
      }

      try {
        // Resolve entities to inspect details
        const faculty = await resolveFaculty(db, args.faculty_identifier);
        if (!faculty) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Validation Error: Faculty '${args.faculty_identifier}' not found.` }]
          };
        }

        const subject = await resolveSubject(db, args.subject_identifier);
        if (!subject) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Validation Error: Subject '${args.subject_identifier}' not found.` }]
          };
        }

        const classItem = await resolveClass(db, args.class_identifier);
        if (!classItem) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Validation Error: Class '${args.class_identifier}' not found.` }]
          };
        }

        // Verify faculty subject association
        if (faculty.subject_id !== subject.id) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Validation Error: Faculty '${faculty.name}' is assigned to subject ID ${faculty.subject_id}, but subject '${subject.name}' (ID ${subject.id}) was specified. Faculty subject must match schedule subject.`
              }
            ]
          };
        }

        // Check for conflicts
        const conflict = await checkScheduleConflicts(db, {
          schedule_date: args.date,
          start_time: args.start_time,
          end_time: args.end_time,
          faculty_id: faculty.id,
          class_id: classItem.id
        });

        if (conflict.hasConflict) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Schedule Conflict: Cannot create session due to conflict: ${conflict.reason}`
              }
            ]
          };
        }

        // 2. Safety Gate: If confirm is false, return preview
        if (!args.confirm) {
          const preview = {
            status: 'PREVIEW_AWAITING_CONFIRMATION',
            message: 'All validations passed with 0 conflicts. Please confirm to commit this schedule to the database.',
            proposedSchedule: {
              date: args.date,
              startTime: args.start_time,
              endTime: args.end_time || null,
              class: `${classItem.name}${classItem.batch ? ` (${classItem.batch})` : ''}`,
              subject: subject.name,
              faculty: faculty.name,
              sessionType: args.schedule_type,
              content: args.content || null,
              notes: args.notes || null
            },
            instruction: 'To save this schedule, call create_schedule again with confirm: true.'
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(preview, null, 2) }]
          };
        }

        // 3. Commit to database
        const created = await createScheduleRecord(db, {
          schedule_date: args.date,
          start_time: args.start_time,
          end_time: args.end_time,
          class_identifier: classItem.id,
          subject_identifier: subject.id,
          faculty_identifier: faculty.id,
          schedule_type: args.schedule_type,
          content: args.content,
          notes: args.notes
        });

        const successResponse = {
          success: true,
          action: 'SCHEDULE_CREATED',
          scheduleId: created.id,
          schedule: {
            id: created.id,
            date: created.schedule_date,
            startTime: created.start_time,
            endTime: created.end_time || null,
            class: created.class?.name,
            subject: created.subject?.name,
            faculty: created.faculty?.name,
            sessionType: created.schedule_type,
            status: created.status,
            content: created.content,
            notes: created.notes
          }
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(successResponse, null, 2) }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Schedule creation failed';
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to create schedule: ${msg}` }]
        };
      }
    }
  );

  // -------------------------------------------------------------
  // Tool 6: update_schedule
  // -------------------------------------------------------------
  server.tool(
    'update_schedule',
    'Modify an existing timetable schedule. Rechecks conflicts if date, time, faculty, or class changes. Requires admin authorization.',
    {
      schedule_id: z
        .number()
        .describe('The numeric ID of the schedule to update'),
      date: z
        .string()
        .optional()
        .describe('New date in YYYY-MM-DD format'),
      start_time: z
        .string()
        .optional()
        .describe('New start time (e.g. "18:00" or "8 PM")'),
      end_time: z
        .string()
        .optional()
        .describe('New end time (e.g. "19:00" or "9 PM")'),
      class_identifier: z
        .string()
        .optional()
        .describe('New class name or ID'),
      subject_identifier: z
        .string()
        .optional()
        .describe('New subject name or ID'),
      faculty_identifier: z
        .string()
        .optional()
        .describe('New faculty name or ID'),
      schedule_type: z
        .string()
        .optional()
        .describe('New session type'),
      content: z
        .string()
        .optional()
        .describe('New content/topic'),
      status: z
        .string()
        .optional()
        .describe('New status ("scheduled", "completed", "cancelled")'),
      notes: z
        .string()
        .optional()
        .describe('New notes'),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe('Set to true to commit changes. If false, returns a preview for confirmation.'),
      admin_token: z
        .string()
        .optional()
        .describe('Optional admin password/token if not already supplied via URL ?token=... or Authorization header.')
    },
    async (args) => {
      // 1. Authorization check
      if (!checkIsAdmin(args.admin_token)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Permission Denied: Admin authorization required to update a schedule. Connect your MCP URL with ?token=YOUR_PASSWORD or provide admin_token in tool arguments.'
            }
          ]
        };
      }

      try {
        // Fetch existing
        const existing = await db
          .prepare(
            `SELECT sc.*, f.name as faculty_name, s.name as subject_name, cl.name as class_name
             FROM schedules sc
             JOIN faculty f ON sc.faculty_id = f.id
             JOIN subjects s ON sc.subject_id = s.id
             JOIN classes cl ON sc.class_id = cl.id
             WHERE sc.id = ?`
          )
          .bind(args.schedule_id)
          .first<any>();

        if (!existing) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Schedule #${args.schedule_id} not found.` }]
          };
        }

        // Preview gate
        if (!args.confirm) {
          const preview = {
            status: 'PREVIEW_AWAITING_CONFIRMATION',
            scheduleId: args.schedule_id,
            currentValues: {
              date: existing.schedule_date,
              startTime: existing.start_time,
              endTime: existing.end_time,
              class: existing.class_name,
              subject: existing.subject_name,
              faculty: existing.faculty_name,
              sessionType: existing.schedule_type,
              status: existing.status
            },
            proposedUpdates: {
              ...(args.date !== undefined && { date: args.date }),
              ...(args.start_time !== undefined && { startTime: args.start_time }),
              ...(args.end_time !== undefined && { endTime: args.end_time }),
              ...(args.class_identifier !== undefined && { class: args.class_identifier }),
              ...(args.subject_identifier !== undefined && { subject: args.subject_identifier }),
              ...(args.faculty_identifier !== undefined && { faculty: args.faculty_identifier }),
              ...(args.schedule_type !== undefined && { sessionType: args.schedule_type }),
              ...(args.content !== undefined && { content: args.content }),
              ...(args.status !== undefined && { status: args.status }),
              ...(args.notes !== undefined && { notes: args.notes })
            },
            instruction: 'To commit these changes, call update_schedule with confirm: true.'
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(preview, null, 2) }]
          };
        }

        // Commit update
        const updated = await updateScheduleRecord(db, args.schedule_id, {
          schedule_date: args.date,
          start_time: args.start_time,
          end_time: args.end_time,
          class_identifier: args.class_identifier,
          subject_identifier: args.subject_identifier,
          faculty_identifier: args.faculty_identifier,
          schedule_type: args.schedule_type,
          content: args.content,
          status: args.status,
          notes: args.notes
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  action: 'SCHEDULE_UPDATED',
                  schedule: updated
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Update failed';
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to update schedule #${args.schedule_id}: ${msg}` }]
        };
      }
    }
  );

  // -------------------------------------------------------------
  // Tool 7: cancel_schedule
  // -------------------------------------------------------------
  server.tool(
    'cancel_schedule',
    'Cancel an existing schedule by setting status to "cancelled" (preserves record history and frees up timetable conflicts). Requires admin authorization.',
    {
      schedule_id: z
        .number()
        .describe('The numeric ID of the schedule to cancel'),
      reason: z
        .string()
        .optional()
        .describe('Optional reason for cancellation'),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe('Confirmation flag. Set to true to execute cancellation. If false, returns a preview.'),
      admin_token: z
        .string()
        .optional()
        .describe('Optional admin password/token if not already supplied via URL ?token=... or Authorization header.')
    },
    async ({ schedule_id, reason, confirm, admin_token }) => {
      // 1. Authorization check
      if (!checkIsAdmin(admin_token)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Permission Denied: Admin authorization required to cancel a schedule. Connect your MCP URL with ?token=YOUR_PASSWORD or provide admin_token in tool arguments.'
            }
          ]
        };
      }

      try {
        const existing = await db
          .prepare(
            `SELECT sc.*, f.name as faculty_name, s.name as subject_name, cl.name as class_name
             FROM schedules sc
             JOIN faculty f ON sc.faculty_id = f.id
             JOIN subjects s ON sc.subject_id = s.id
             JOIN classes cl ON sc.class_id = cl.id
             WHERE sc.id = ?`
          )
          .bind(schedule_id)
          .first<any>();

        if (!existing) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Schedule #${schedule_id} not found.` }]
          };
        }

        if (existing.status === 'cancelled') {
          return {
            content: [
              {
                type: 'text',
                text: `Schedule #${schedule_id} is already cancelled.`
              }
            ]
          };
        }

        if (!confirm) {
          const preview = {
            status: 'PREVIEW_AWAITING_CONFIRMATION',
            scheduleToCancel: {
              id: existing.id,
              date: existing.schedule_date,
              time: `${existing.start_time} - ${existing.end_time || 'N/A'}`,
              class: existing.class_name,
              subject: existing.subject_name,
              faculty: existing.faculty_name,
              reason: reason || 'Not specified'
            },
            warning: 'This will set the session status to "cancelled" and remove it from active conflict checks.',
            instruction: 'To confirm cancellation, call cancel_schedule with confirm: true.'
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(preview, null, 2) }]
          };
        }

        const result = await cancelScheduleRecord(db, schedule_id, reason);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Cancellation failed';
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to cancel schedule #${schedule_id}: ${msg}` }]
        };
      }
    }
  );

  // =============================================================
  // YOUTUBE DELIVERABLES TOOLS (Live, Content Video, Shorts)
  // =============================================================

  // -------------------------------------------------------------
  // Tool 8: get_todays_youtube_deliverables
  // -------------------------------------------------------------
  server.tool(
    'get_todays_youtube_deliverables',
    'Retrieve all YouTube deliverables (Live, Content Video, Shorts) scheduled for today in the Asia/Kolkata timezone, with optional filtering by category, class, faculty, or subject.',
    {
      category: z
        .string()
        .optional()
        .describe('Filter by deliverable category: "Live", "Content Video", or "Shorts"'),
      class_filter: z
        .string()
        .optional()
        .describe('Filter by class name, batch, or numeric ID (e.g. "SSLC", "Plus One Commerce", 1)'),
      faculty_filter: z
        .string()
        .optional()
        .describe('Filter by faculty name or numeric ID (e.g. "Adheeshna", "Ahmed", 2)'),
      subject_filter: z
        .string()
        .optional()
        .describe('Filter by subject name, ID, or "Common"')
    },
    async ({ category, class_filter, faculty_filter, subject_filter }) => {
      try {
        const today = getTodayKolkata();
        const deliverables = await searchYouTubeDeliverables(db, {
          startDate: today,
          endDate: today,
          category,
          classIdentifier: class_filter,
          facultyIdentifier: faculty_filter,
          subjectIdentifier: subject_filter
        });

        const summary = {
          date: today,
          timezone: 'Asia/Kolkata',
          totalDeliverables: deliverables.length,
          deliverables: deliverables.map((d) => ({
            id: d.id,
            date: d.schedule_date,
            startTime: d.start_time || null,
            category: d.schedule_type,
            classes: d.classes.map((c) => (c.batch ? `${c.name} (${c.batch})` : c.name)),
            subject: d.is_common ? 'Common' : d.subject?.name || null,
            faculties: d.faculties.map((f) => f.name),
            topic: d.content || null,
            status: d.status,
            notes: d.notes || null
          }))
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(summary, null, 2)
            }
          ]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to retrieve today's YouTube deliverables";
        return {
          isError: true,
          content: [{ type: 'text', text: `Error retrieving today's YouTube deliverables: ${msg}` }]
        };
      }
    }
  );

  // -------------------------------------------------------------
  // Tool 9: search_youtube_deliverables
  // -------------------------------------------------------------
  server.tool(
    'search_youtube_deliverables',
    'Search YouTube deliverables across date ranges with flexible filters by category (Live, Content Video, Shorts), faculty, class, subject, and status.',
    {
      start_date: z
        .string()
        .optional()
        .describe('Start date in YYYY-MM-DD format (e.g. "2026-10-15")'),
      end_date: z
        .string()
        .optional()
        .describe('End date in YYYY-MM-DD format (e.g. "2026-10-21")'),
      category: z
        .string()
        .optional()
        .describe('Deliverable category: "Live", "Content Video", or "Shorts"'),
      faculty_identifier: z
        .string()
        .optional()
        .describe('Faculty name or numeric ID (e.g. "Adheeshna", "Ahmed")'),
      class_identifier: z
        .string()
        .optional()
        .describe('Class name or numeric ID (e.g. "Plus One Commerce", "SSLC")'),
      subject_identifier: z
        .string()
        .optional()
        .describe('Subject name, ID, or "Common"'),
      status: z
        .string()
        .optional()
        .describe('Deliverable status: "scheduled", "completed", or "cancelled"'),
      search_query: z
        .string()
        .optional()
        .describe('Search query matching topic/content or notes'),
      limit: z
        .number()
        .optional()
        .describe('Max results to return (default 50, maximum 100)')
    },
    async (args) => {
      try {
        if (args.start_date && !isValidDateFormat(args.start_date)) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Invalid start_date '${args.start_date}'. Must be YYYY-MM-DD.` }]
          };
        }
        if (args.end_date && !isValidDateFormat(args.end_date)) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Invalid end_date '${args.end_date}'. Must be YYYY-MM-DD.` }]
          };
        }

        const deliverables = await searchYouTubeDeliverables(db, {
          startDate: args.start_date,
          endDate: args.end_date,
          category: args.category,
          facultyIdentifier: args.faculty_identifier,
          classIdentifier: args.class_identifier,
          subjectIdentifier: args.subject_identifier,
          status: args.status,
          searchQuery: args.search_query,
          limit: args.limit
        });

        const result = {
          count: deliverables.length,
          deliverables: deliverables.map((d) => ({
            id: d.id,
            date: d.schedule_date,
            startTime: d.start_time || null,
            category: d.schedule_type,
            classes: d.classes.map((c) => (c.batch ? `${c.name} (${c.batch})` : c.name)),
            subject: d.is_common ? 'Common' : d.subject?.name || null,
            faculties: d.faculties.map((f) => f.name),
            topic: d.content || null,
            status: d.status,
            notes: d.notes || null
          }))
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to search YouTube deliverables';
        return {
          isError: true,
          content: [{ type: 'text', text: `Error searching YouTube deliverables: ${msg}` }]
        };
      }
    }
  );

  // -------------------------------------------------------------
  // Tool 10: create_youtube_deliverable
  // -------------------------------------------------------------
  server.tool(
    'create_youtube_deliverable',
    'Create a new YouTube deliverable (Live, Content Video, or Shorts) for one or more classes and faculties. Requires admin authorization. Supports a dry-run confirmation step.',
    {
      date: z
        .string()
        .describe('Date in YYYY-MM-DD format (e.g. "2026-10-15")'),
      category: z
        .string()
        .describe('Category: "Live", "Content Video", or "Shorts"'),
      classes: z
        .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
        .describe('One or more class names or IDs (e.g. ["Plus One Commerce"] or "SSLC")'),
      faculties: z
        .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
        .describe('One or more faculty names or IDs (e.g. ["Adheeshna"] or "Ahmed")'),
      subject: z
        .union([z.string(), z.number()])
        .optional()
        .describe('Subject name or ID, or "Common" (optional if is_common is true)'),
      is_common: z
        .boolean()
        .optional()
        .describe('Set to true if this is a Common deliverable across subjects'),
      start_time: z
        .string()
        .optional()
        .describe('Optional start time (e.g. "18:00" or "6:00 PM")'),
      topic: z
        .string()
        .optional()
        .describe('Content topic or chapter description'),
      notes: z
        .string()
        .optional()
        .describe('Optional internal notes'),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe('Confirmation flag. Set to true to commit to database. If false, returns a preview for approval.'),
      admin_token: z
        .string()
        .optional()
        .describe('Optional admin password/token if not already supplied via URL ?token=... or Authorization header.')
    },
    async (args) => {
      // 1. Authorization check
      if (!checkIsAdmin(args.admin_token)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Permission Denied: Admin authorization required to create a YouTube deliverable. Connect your MCP URL with ?token=YOUR_PASSWORD (e.g. /mcp?token=...) or provide admin_token in the tool arguments.'
            }
          ]
        };
      }

      try {
        const normalizedType = normalizeYouTubeType(args.category);
        if (!normalizedType) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Validation Error: Invalid category '${args.category}'. Must be one of: Live, Content Video, Shorts.`
              }
            ]
          };
        }

        const classList = Array.isArray(args.classes)
          ? args.classes
          : [args.classes];
        const facultyList = Array.isArray(args.faculties)
          ? args.faculties
          : [args.faculties];

        // Resolve classes
        const resolvedClasses: Array<{ id: number; name: string }> = [];
        for (const cIdent of classList) {
          const res = await resolveClass(db, cIdent);
          if (!res) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Validation Error: Class '${cIdent}' not found in database.` }]
            };
          }
          resolvedClasses.push({ id: res.id, name: res.name });
        }

        // Resolve faculties
        const resolvedFaculties: Array<{ id: number; name: string }> = [];
        for (const fIdent of facultyList) {
          const res = await resolveFaculty(db, fIdent);
          if (!res) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Validation Error: Faculty '${fIdent}' not found in database.` }]
            };
          }
          resolvedFaculties.push({ id: res.id, name: res.name });
        }

        // Resolve subject or common
        let isCommon = !!args.is_common;
        let subjectName: string = 'Common';
        let subjectId: number | null = null;

        if (args.subject !== undefined && args.subject !== null && args.subject !== '') {
          const subStr = String(args.subject).trim().toLowerCase();
          if (subStr === 'common') {
            isCommon = true;
          } else {
            const resSub = await resolveSubject(db, args.subject);
            if (!resSub) {
              return {
                isError: true,
                content: [{ type: 'text', text: `Validation Error: Subject '${args.subject}' not found in database.` }]
              };
            }
            subjectId = resSub.id;
            subjectName = resSub.name;
            isCommon = false;
          }
        }

        // 2. Safety Gate: If confirm is false, return preview
        if (!args.confirm) {
          const preview = {
            status: 'PREVIEW_AWAITING_CONFIRMATION',
            message: 'Validation passed. Please confirm to commit this YouTube deliverable to the database.',
            proposedDeliverable: {
              date: args.date,
              category: normalizedType,
              classes: resolvedClasses.map((c) => c.name),
              faculties: resolvedFaculties.map((f) => f.name),
              subject: isCommon ? 'Common' : subjectName,
              startTime: args.start_time || null,
              topic: args.topic || null,
              notes: args.notes || null
            },
            instruction: 'To save this deliverable, call create_youtube_deliverable again with confirm: true.'
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(preview, null, 2) }]
          };
        }

        // 3. Commit
        const created = await createYouTubeDeliverableRecord(db, {
          schedule_date: args.date,
          schedule_type: normalizedType,
          classes: resolvedClasses.map((c) => c.id),
          faculties: resolvedFaculties.map((f) => f.id),
          subject: subjectId,
          is_common: isCommon,
          start_time: args.start_time,
          content: args.topic,
          notes: args.notes
        });

        const successResponse = {
          success: true,
          action: 'YOUTUBE_DELIVERABLE_CREATED',
          deliverableId: created.id,
          deliverable: {
            id: created.id,
            date: created.schedule_date,
            startTime: created.start_time,
            category: created.schedule_type,
            classes: created.classes.map((c) => c.name),
            faculties: created.faculties.map((f) => f.name),
            subject: created.is_common ? 'Common' : created.subject?.name,
            topic: created.content,
            status: created.status,
            notes: created.notes
          }
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(successResponse, null, 2) }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create YouTube deliverable';
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to create YouTube deliverable: ${msg}` }]
        };
      }
    }
  );

  // -------------------------------------------------------------
  // Tool 11: update_youtube_deliverable
  // -------------------------------------------------------------
  server.tool(
    'update_youtube_deliverable',
    'Update an existing YouTube deliverable by ID (e.g. moving date to tomorrow, changing category, time, topic, classes, or faculty). Requires admin authorization.',
    {
      deliverable_id: z
        .number()
        .describe('The numeric ID of the YouTube deliverable to update'),
      date: z
        .string()
        .optional()
        .describe('New date in YYYY-MM-DD format (e.g. to move deliverable to tomorrow)'),
      category: z
        .string()
        .optional()
        .describe('New category: "Live", "Content Video", or "Shorts"'),
      classes: z
        .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
        .optional()
        .describe('Updated class names or numeric IDs'),
      faculties: z
        .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
        .optional()
        .describe('Updated faculty names or numeric IDs'),
      subject: z
        .union([z.string(), z.number()])
        .optional()
        .describe('Updated subject name, ID, or "Common"'),
      is_common: z
        .boolean()
        .optional()
        .describe('Set to true if deliverable is Common across subjects'),
      start_time: z
        .string()
        .optional()
        .describe('Updated start time'),
      topic: z
        .string()
        .optional()
        .describe('Updated content/topic'),
      status: z
        .string()
        .optional()
        .describe('Updated status: "scheduled", "completed", or "cancelled"'),
      notes: z
        .string()
        .optional()
        .describe('Updated notes'),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe('Confirmation flag. Set to true to commit changes. If false, returns a preview for confirmation.'),
      admin_token: z
        .string()
        .optional()
        .describe('Optional admin password/token if not already supplied via URL ?token=... or Authorization header.')
    },
    async (args) => {
      // 1. Authorization check
      if (!checkIsAdmin(args.admin_token)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Permission Denied: Admin authorization required to update a YouTube deliverable. Connect your MCP URL with ?token=YOUR_PASSWORD or provide admin_token in tool arguments.'
            }
          ]
        };
      }

      try {
        const existing = await fetchYouTubeDeliverableById(db, args.deliverable_id);
        if (!existing) {
          return {
            isError: true,
            content: [{ type: 'text', text: `YouTube deliverable #${args.deliverable_id} not found.` }]
          };
        }

        // Preview gate
        if (!args.confirm) {
          const preview = {
            status: 'PREVIEW_AWAITING_CONFIRMATION',
            deliverableId: args.deliverable_id,
            currentValues: {
              date: existing.schedule_date,
              category: existing.schedule_type,
              startTime: existing.start_time,
              classes: existing.classes.map((c) => c.name),
              faculties: existing.faculties.map((f) => f.name),
              subject: existing.is_common ? 'Common' : existing.subject?.name,
              topic: existing.content,
              status: existing.status
            },
            proposedUpdates: {
              ...(args.date !== undefined && { date: args.date }),
              ...(args.category !== undefined && { category: args.category }),
              ...(args.start_time !== undefined && { startTime: args.start_time }),
              ...(args.classes !== undefined && { classes: args.classes }),
              ...(args.faculties !== undefined && { faculties: args.faculties }),
              ...(args.subject !== undefined && { subject: args.subject }),
              ...(args.is_common !== undefined && { isCommon: args.is_common }),
              ...(args.topic !== undefined && { topic: args.topic }),
              ...(args.status !== undefined && { status: args.status }),
              ...(args.notes !== undefined && { notes: args.notes })
            },
            instruction: 'To commit these changes, call update_youtube_deliverable with confirm: true.'
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(preview, null, 2) }]
          };
        }

        // Commit update
        const classList = args.classes !== undefined
          ? Array.isArray(args.classes) ? args.classes : [args.classes]
          : undefined;
        const facultyList = args.faculties !== undefined
          ? Array.isArray(args.faculties) ? args.faculties : [args.faculties]
          : undefined;

        const updated = await updateYouTubeDeliverableRecord(db, args.deliverable_id, {
          schedule_date: args.date,
          schedule_type: args.category,
          classes: classList,
          faculties: facultyList,
          subject: args.subject,
          is_common: args.is_common,
          start_time: args.start_time,
          content: args.topic,
          status: args.status,
          notes: args.notes
        });

        const successResponse = {
          success: true,
          action: 'YOUTUBE_DELIVERABLE_UPDATED',
          deliverable: {
            id: updated.id,
            date: updated.schedule_date,
            startTime: updated.start_time,
            category: updated.schedule_type,
            classes: updated.classes.map((c) => c.name),
            faculties: updated.faculties.map((f) => f.name),
            subject: updated.is_common ? 'Common' : updated.subject?.name,
            topic: updated.content,
            status: updated.status,
            notes: updated.notes
          }
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(successResponse, null, 2) }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update YouTube deliverable';
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to update YouTube deliverable #${args.deliverable_id}: ${msg}` }]
        };
      }
    }
  );

  // -------------------------------------------------------------
  // Tool 12: cancel_youtube_deliverable
  // -------------------------------------------------------------
  server.tool(
    'cancel_youtube_deliverable',
    'Cancel an existing YouTube deliverable by ID (marks status as "cancelled", preserving audit history, or optionally deletes). Requires admin authorization.',
    {
      deliverable_id: z
        .number()
        .describe('The numeric ID of the deliverable to cancel'),
      reason: z
        .string()
        .optional()
        .describe('Optional reason for cancellation'),
      permanent_delete: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, permanently deletes deliverable from database. If false (recommended), sets status to "cancelled".'),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe('Confirmation flag. Set to true to execute cancellation. If false, returns a preview.'),
      admin_token: z
        .string()
        .optional()
        .describe('Optional admin password/token if not already supplied via URL ?token=... or Authorization header.')
    },
    async ({ deliverable_id, reason, permanent_delete, confirm, admin_token }) => {
      // 1. Authorization check
      if (!checkIsAdmin(admin_token)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Permission Denied: Admin authorization required to cancel a YouTube deliverable. Connect your MCP URL with ?token=YOUR_PASSWORD or provide admin_token in tool arguments.'
            }
          ]
        };
      }

      try {
        const existing = await fetchYouTubeDeliverableById(db, deliverable_id);
        if (!existing) {
          return {
            isError: true,
            content: [{ type: 'text', text: `YouTube deliverable #${deliverable_id} not found.` }]
          };
        }

        if (!permanent_delete && existing.status === 'cancelled') {
          return {
            content: [
              {
                type: 'text',
                text: `YouTube deliverable #${deliverable_id} is already cancelled.`
              }
            ]
          };
        }

        if (!confirm) {
          const preview = {
            status: 'PREVIEW_AWAITING_CONFIRMATION',
            deliverableToCancel: {
              id: existing.id,
              date: existing.schedule_date,
              category: existing.schedule_type,
              classes: existing.classes.map((c) => c.name),
              faculties: existing.faculties.map((f) => f.name),
              subject: existing.is_common ? 'Common' : existing.subject?.name,
              topic: existing.content,
              action: permanent_delete ? 'Permanent Deletion' : 'Set status to cancelled',
              reason: reason || 'Not specified'
            },
            instruction: 'To confirm cancellation, call cancel_youtube_deliverable with confirm: true.'
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(preview, null, 2) }]
          };
        }

        const result = await cancelYouTubeDeliverableRecord(db, deliverable_id, reason, permanent_delete);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Cancellation failed';
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to cancel YouTube deliverable #${deliverable_id}: ${msg}` }]
        };
      }
    }
  );

  return server;
}

