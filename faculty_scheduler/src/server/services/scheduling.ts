import type { Schedule } from '../types';

/**
 * Standard Timezone for K12 Faculty Scheduler is Asia/Kolkata.
 */
export const APP_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns today's date formatted as YYYY-MM-DD in the Asia/Kolkata timezone.
 */
export function getTodayKolkata(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

/**
 * Normalizes user-entered time strings into standard 24-hour "HH:mm" format.
 * Examples:
 *   "7 PM" -> "19:00"
 *   "7:30 PM" -> "19:30"
 *   "07:00" -> "07:00"
 *   "18:30" -> "18:30"
 *   "9 AM" -> "09:00"
 */
export function normalizeTime(timeStr?: string | null): string {
  if (!timeStr) return '';
  const trimmed = timeStr.trim();
  if (!trimmed) return '';

  // Check 12-hour format with AM/PM
  const match12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2] ? match12[2] : '00';
    const meridian = match12[3].toLowerCase();

    if (meridian === 'pm' && hours < 12) {
      hours += 12;
    } else if (meridian === 'am' && hours === 12) {
      hours = 0;
    }
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // Check 24-hour format "HH:mm" or "HH:mm:ss"
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = match24[2];
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // Fallback to original trimmed string
  return trimmed;
}

/**
 * Validates whether a date string is in valid YYYY-MM-DD format.
 */
export function isValidDateFormat(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

/**
 * Helper to map joined raw schedule rows to the domain Schedule interface.
 */
export function mapJoinedScheduleRow(row: any): Schedule {
  return {
    id: row.id,
    schedule_date: row.schedule_date,
    start_time: row.start_time,
    end_time: row.end_time || null,
    class_id: row.class_id,
    subject_id: row.subject_id,
    faculty_id: row.faculty_id,
    schedule_type: row.schedule_type,
    content: row.content || null,
    status: row.status,
    notes: row.notes || null,
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
 * Resolves a faculty identifier (ID or Name) against the database.
 */
export async function resolveFaculty(
  db: D1Database,
  identifier: string | number
): Promise<{ id: number; name: string; subject_id: number; department?: string | null } | null> {
  if (typeof identifier === 'number' || /^\d+$/.test(String(identifier).trim())) {
    const id = Number(identifier);
    const row = await db
      .prepare('SELECT id, name, subject_id, department FROM faculty WHERE id = ?')
      .bind(id)
      .first<any>();
    if (row) return row;
  }

  const name = String(identifier).trim();
  // Exact match (case insensitive)
  const exact = await db
    .prepare('SELECT id, name, subject_id, department FROM faculty WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))')
    .bind(name)
    .first<any>();
  if (exact) return exact;

  // Fuzzy match (starts with or contains)
  const fuzzy = await db
    .prepare('SELECT id, name, subject_id, department FROM faculty WHERE LOWER(name) LIKE ?')
    .bind(`%${name.toLowerCase()}%`)
    .first<any>();

  return fuzzy || null;
}

/**
 * Resolves a class identifier (ID, Name, or Batch) against the database.
 */
export async function resolveClass(
  db: D1Database,
  identifier: string | number
): Promise<{ id: number; name: string; batch?: string | null } | null> {
  if (typeof identifier === 'number' || /^\d+$/.test(String(identifier).trim())) {
    const id = Number(identifier);
    const row = await db.prepare('SELECT id, name, batch FROM classes WHERE id = ?').bind(id).first<any>();
    if (row) return row;
  }

  const name = String(identifier).trim();
  // Exact match
  const exact = await db
    .prepare('SELECT id, name, batch FROM classes WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))')
    .bind(name)
    .first<any>();
  if (exact) return exact;

  // Fuzzy match or match name + batch
  const fuzzy = await db
    .prepare('SELECT id, name, batch FROM classes WHERE LOWER(name) LIKE ? OR LOWER(batch) LIKE ?')
    .bind(`%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`)
    .first<any>();

  return fuzzy || null;
}

/**
 * Resolves a subject identifier (ID or Name) against the database.
 */
export async function resolveSubject(
  db: D1Database,
  identifier: string | number
): Promise<{ id: number; name: string } | null> {
  if (typeof identifier === 'number' || /^\d+$/.test(String(identifier).trim())) {
    const id = Number(identifier);
    const row = await db.prepare('SELECT id, name FROM subjects WHERE id = ?').bind(id).first<any>();
    if (row) return row;
  }

  const name = String(identifier).trim();
  const exact = await db
    .prepare('SELECT id, name FROM subjects WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))')
    .bind(name)
    .first<any>();
  if (exact) return exact;

  const fuzzy = await db
    .prepare('SELECT id, name FROM subjects WHERE LOWER(name) LIKE ?')
    .bind(`%${name.toLowerCase()}%`)
    .first<any>();

  return fuzzy || null;
}

/**
 * Conflict detection logic matching the existing schedules route:
 * A conflict occurs if there is an overlapping schedule (status != 'cancelled') on the same date.
 * Overlap logic:
 *   (newStart <= existStart && newEnd > existStart) ||
 *   (newStart < existEnd && newEnd >= existEnd) ||
 *   (newStart >= existStart && newEnd <= existEnd) ||
 *   (newStart === existStart)
 */
export async function checkScheduleConflicts(
  db: D1Database,
  params: {
    schedule_date: string;
    start_time: string;
    end_time?: string | null;
    faculty_id?: number;
    class_id?: number;
    excludeScheduleId?: number;
  }
): Promise<{
  hasConflict: boolean;
  reason?: string;
  conflictingSchedules?: Array<{
    id: number;
    type: 'faculty' | 'class';
    schedule_date: string;
    start_time: string;
    end_time: string | null;
    subject_name?: string;
    class_name?: string;
    faculty_name?: string;
  }>;
}> {
  const startTime = normalizeTime(params.start_time);
  if (!startTime) {
    return { hasConflict: false };
  }

  const effectiveEndTime = normalizeTime(params.end_time) || startTime;
  const conflicts: Array<{
    id: number;
    type: 'faculty' | 'class';
    schedule_date: string;
    start_time: string;
    end_time: string | null;
    subject_name?: string;
    class_name?: string;
    faculty_name?: string;
  }> = [];

  // Helper overlap comparator
  const doesOverlap = (sStart: string, sEnd: string) => {
    return (
      (startTime <= sStart && effectiveEndTime > sStart) ||
      (startTime < sEnd && effectiveEndTime >= sEnd) ||
      (startTime >= sStart && effectiveEndTime <= sEnd) ||
      (startTime === sStart)
    );
  };

  // 1. Check Faculty conflict
  if (params.faculty_id) {
    let facultyQuery = `
      SELECT sc.id, sc.start_time, COALESCE(sc.end_time, sc.start_time) as end_time, sc.schedule_date,
             cl.name as class_name, s.name as subject_name
      FROM schedules sc
      JOIN classes cl ON sc.class_id = cl.id
      JOIN subjects s ON sc.subject_id = s.id
      WHERE sc.faculty_id = ? 
        AND sc.schedule_date = ? 
        AND sc.status != 'cancelled'
    `;
    const facultyParams: unknown[] = [params.faculty_id, params.schedule_date];
    if (params.excludeScheduleId) {
      facultyQuery += ' AND sc.id != ?';
      facultyParams.push(params.excludeScheduleId);
    }

    const existingFacultySchedules = await db.prepare(facultyQuery).bind(...facultyParams).all<any>();
    for (const s of existingFacultySchedules.results || []) {
      const sStart = normalizeTime(s.start_time);
      const sEnd = normalizeTime(s.end_time);

      if (doesOverlap(sStart, sEnd)) {
        conflicts.push({
          id: s.id,
          type: 'faculty',
          schedule_date: s.schedule_date,
          start_time: s.start_time,
          end_time: s.end_time,
          class_name: s.class_name,
          subject_name: s.subject_name
        });
      }
    }
  }

  // 2. Check Class conflict
  if (params.class_id) {
    let classQuery = `
      SELECT sc.id, sc.start_time, COALESCE(sc.end_time, sc.start_time) as end_time, sc.schedule_date,
             f.name as faculty_name, s.name as subject_name
      FROM schedules sc
      JOIN faculty f ON sc.faculty_id = f.id
      JOIN subjects s ON sc.subject_id = s.id
      WHERE sc.class_id = ? 
        AND sc.schedule_date = ? 
        AND sc.status != 'cancelled'
    `;
    const classParams: unknown[] = [params.class_id, params.schedule_date];
    if (params.excludeScheduleId) {
      classQuery += ' AND sc.id != ?';
      classParams.push(params.excludeScheduleId);
    }

    const existingClassSchedules = await db.prepare(classQuery).bind(...classParams).all<any>();
    for (const s of existingClassSchedules.results || []) {
      const sStart = normalizeTime(s.start_time);
      const sEnd = normalizeTime(s.end_time);

      if (doesOverlap(sStart, sEnd)) {
        conflicts.push({
          id: s.id,
          type: 'class',
          schedule_date: s.schedule_date,
          start_time: s.start_time,
          end_time: s.end_time,
          faculty_name: s.faculty_name,
          subject_name: s.subject_name
        });
      }
    }
  }

  if (conflicts.length > 0) {
    const reasons = conflicts.map((c) =>
      c.type === 'faculty'
        ? `Faculty has conflicting schedule #${c.id} (${c.subject_name} for ${c.class_name} at ${c.start_time})`
        : `Class has conflicting schedule #${c.id} (${c.subject_name} with ${c.faculty_name} at ${c.start_time})`
    );
    return {
      hasConflict: true,
      reason: reasons.join('; '),
      conflictingSchedules: conflicts
    };
  }

  return { hasConflict: false };
}

/**
 * Retrieve schedules for today (Asia/Kolkata timezone) with optional filters.
 */
export async function getTodaysSchedules(
  db: D1Database,
  filters: {
    facultyIdentifier?: string | number;
    classIdentifier?: string | number;
    subjectIdentifier?: string | number;
  } = {}
): Promise<Schedule[]> {
  const today = getTodayKolkata();
  return searchSchedules(db, {
    startDate: today,
    endDate: today,
    facultyIdentifier: filters.facultyIdentifier,
    classIdentifier: filters.classIdentifier,
    subjectIdentifier: filters.subjectIdentifier
  });
}

/**
 * Flexible schedule search with parameterized SQL and joined entities.
 */
export async function searchSchedules(
  db: D1Database,
  params: {
    startDate?: string;
    endDate?: string;
    facultyIdentifier?: string | number;
    classIdentifier?: string | number;
    subjectIdentifier?: string | number;
    sessionType?: string;
    status?: string;
    limit?: number;
  }
): Promise<Schedule[]> {
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
  `;

  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (params.startDate && params.endDate && params.startDate === params.endDate) {
    conditions.push('sc.schedule_date = ?');
    bindings.push(params.startDate);
  } else {
    if (params.startDate) {
      conditions.push('sc.schedule_date >= ?');
      bindings.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push('sc.schedule_date <= ?');
      bindings.push(params.endDate);
    }
  }

  if (params.facultyIdentifier !== undefined && params.facultyIdentifier !== '') {
    const resolved = await resolveFaculty(db, params.facultyIdentifier);
    if (resolved) {
      conditions.push('sc.faculty_id = ?');
      bindings.push(resolved.id);
    } else {
      // If faculty wasn't found, return empty results
      return [];
    }
  }

  if (params.classIdentifier !== undefined && params.classIdentifier !== '') {
    const resolved = await resolveClass(db, params.classIdentifier);
    if (resolved) {
      conditions.push('sc.class_id = ?');
      bindings.push(resolved.id);
    } else {
      return [];
    }
  }

  if (params.subjectIdentifier !== undefined && params.subjectIdentifier !== '') {
    const resolved = await resolveSubject(db, params.subjectIdentifier);
    if (resolved) {
      conditions.push('sc.subject_id = ?');
      bindings.push(resolved.id);
    } else {
      return [];
    }
  }

  if (params.sessionType) {
    conditions.push('sc.schedule_type = ? COLLATE NOCASE');
    bindings.push(params.sessionType.replace(/_/g, ' '));
  }

  if (params.status) {
    conditions.push('sc.status = ?');
    bindings.push(params.status);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY sc.schedule_date ASC, sc.start_time ASC';

  const maxLimit = Math.min(params.limit || 50, 100);
  query += ` LIMIT ${maxLimit}`;

  const stmt = db.prepare(query);
  const result = bindings.length > 0 ? await stmt.bind(...bindings).all<any>() : await stmt.all<any>();

  return (result.results || []).map(mapJoinedScheduleRow);
}

/**
 * Checks faculty availability for a specified date and time window.
 */
export async function getFacultyAvailability(
  db: D1Database,
  params: {
    facultyIdentifier: string | number;
    date: string;
    startTime: string;
    endTime?: string | null;
  }
): Promise<{
  faculty: { id: number; name: string };
  date: string;
  requestedSlot: { startTime: string; endTime: string };
  isAvailable: boolean;
  statusText: string;
  conflictingSchedules: Array<{
    id: number;
    start_time: string;
    end_time: string | null;
    subject_name?: string;
    class_name?: string;
  }>;
}> {
  const faculty = await resolveFaculty(db, params.facultyIdentifier);
  if (!faculty) {
    throw new Error(`Faculty not found matching '${params.facultyIdentifier}'`);
  }

  const normStart = normalizeTime(params.startTime);
  const normEnd = normalizeTime(params.endTime) || normStart;

  const conflict = await checkScheduleConflicts(db, {
    schedule_date: params.date,
    start_time: normStart,
    end_time: normEnd,
    faculty_id: faculty.id
  });

  const isAvailable = !conflict.hasConflict;
  const statusText = isAvailable
    ? 'No conflicting schedules found in timetable. (Note: External leaves/off-duty constraints outside scheduled sessions are not tracked).'
    : `Faculty has ${conflict.conflictingSchedules?.length || 1} conflicting scheduled session(s).`;

  return {
    faculty: { id: faculty.id, name: faculty.name },
    date: params.date,
    requestedSlot: { startTime: normStart, endTime: normEnd },
    isAvailable,
    statusText,
    conflictingSchedules: conflict.conflictingSchedules || []
  };
}

/**
 * Creates a schedule record after strict validation and conflict detection.
 */
export async function createScheduleRecord(
  db: D1Database,
  params: {
    schedule_date: string;
    start_time: string;
    end_time?: string | null;
    class_identifier: string | number;
    subject_identifier: string | number;
    faculty_identifier: string | number;
    schedule_type: string;
    content?: string | null;
    notes?: string | null;
    status?: string;
  }
): Promise<Schedule> {
  if (!params.schedule_date || !isValidDateFormat(params.schedule_date)) {
    throw new Error('Invalid or missing schedule_date. Required format is YYYY-MM-DD.');
  }

  const normStart = normalizeTime(params.start_time);
  const normEnd = normalizeTime(params.end_time) || null;

  // Resolve foreign entities
  const classItem = await resolveClass(db, params.class_identifier);
  if (!classItem) {
    throw new Error(`Selected class '${params.class_identifier}' does not exist.`);
  }

  const subjectItem = await resolveSubject(db, params.subject_identifier);
  if (!subjectItem) {
    throw new Error(`Selected subject '${params.subject_identifier}' does not exist.`);
  }

  const facultyItem = await resolveFaculty(db, params.faculty_identifier);
  if (!facultyItem) {
    throw new Error(`Selected faculty '${params.faculty_identifier}' does not exist.`);
  }

  // Critical Validation: faculty must belong to subject
  if (facultyItem.subject_id !== subjectItem.id) {
    throw new Error(
      `Faculty '${facultyItem.name}' does not belong to subject '${subjectItem.name}'. (Faculty subject ID is ${facultyItem.subject_id}, submitted subject ID is ${subjectItem.id}).`
    );
  }

  // Conflict Check
  const conflict = await checkScheduleConflicts(db, {
    schedule_date: params.schedule_date,
    start_time: normStart,
    end_time: normEnd,
    faculty_id: facultyItem.id,
    class_id: classItem.id
  });

  if (conflict.hasConflict) {
    throw new Error(`Schedule conflict detected: ${conflict.reason}`);
  }

  const scheduleType = params.schedule_type?.trim() || 'Regular';
  const status = params.status || 'scheduled';

  const insertResult = await db
    .prepare(
      `INSERT INTO schedules (
        schedule_date, start_time, end_time, class_id, subject_id, faculty_id,
        schedule_type, content, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      params.schedule_date,
      normStart,
      normEnd,
      classItem.id,
      subjectItem.id,
      facultyItem.id,
      scheduleType,
      params.content || null,
      status,
      params.notes || null
    )
    .run();

  const createdId = insertResult.meta.last_row_id;
  const created = await db
    .prepare(
      `SELECT 
        sc.*,
        f.name as faculty_name,
        s.name as subject_name,
        cl.name as class_name,
        cl.batch as class_batch
      FROM schedules sc
      JOIN faculty f ON sc.faculty_id = f.id
      JOIN subjects s ON sc.subject_id = s.id
      JOIN classes cl ON sc.class_id = cl.id
      WHERE sc.id = ?`
    )
    .bind(createdId)
    .first<any>();

  return mapJoinedScheduleRow(created);
}

/**
 * Updates an existing schedule record with validations and conflict re-checks.
 */
export async function updateScheduleRecord(
  db: D1Database,
  scheduleId: number,
  params: {
    schedule_date?: string;
    start_time?: string;
    end_time?: string | null;
    class_identifier?: string | number;
    subject_identifier?: string | number;
    faculty_identifier?: string | number;
    schedule_type?: string;
    content?: string | null;
    status?: string;
    notes?: string | null;
  }
): Promise<Schedule> {
  const existing = await db.prepare('SELECT * FROM schedules WHERE id = ?').bind(scheduleId).first<any>();
  if (!existing) {
    throw new Error(`Schedule with ID ${scheduleId} not found.`);
  }

  const newDate = params.schedule_date !== undefined ? params.schedule_date.trim() : existing.schedule_date;
  if (!isValidDateFormat(newDate)) {
    throw new Error(`Invalid schedule_date '${newDate}'. Format must be YYYY-MM-DD.`);
  }

  const newStart = params.start_time !== undefined ? normalizeTime(params.start_time) : existing.start_time;
  const newEnd = params.end_time !== undefined ? normalizeTime(params.end_time) : existing.end_time;

  let newClassId = existing.class_id;
  if (params.class_identifier !== undefined) {
    const classItem = await resolveClass(db, params.class_identifier);
    if (!classItem) throw new Error(`Class '${params.class_identifier}' not found.`);
    newClassId = classItem.id;
  }

  let newSubjectId = existing.subject_id;
  if (params.subject_identifier !== undefined) {
    const subjectItem = await resolveSubject(db, params.subject_identifier);
    if (!subjectItem) throw new Error(`Subject '${params.subject_identifier}' not found.`);
    newSubjectId = subjectItem.id;
  }

  let newFacultyId = existing.faculty_id;
  if (params.faculty_identifier !== undefined) {
    const facultyItem = await resolveFaculty(db, params.faculty_identifier);
    if (!facultyItem) throw new Error(`Faculty '${params.faculty_identifier}' not found.`);
    newFacultyId = facultyItem.id;
  }

  // Validate subject & faculty match
  const facultyRecord = await db
    .prepare('SELECT id, subject_id, name FROM faculty WHERE id = ?')
    .bind(newFacultyId)
    .first<{ id: number; subject_id: number; name: string }>();

  if (!facultyRecord) {
    throw new Error(`Faculty ID ${newFacultyId} does not exist.`);
  }

  if (facultyRecord.subject_id !== newSubjectId) {
    throw new Error(
      `Faculty '${facultyRecord.name}' does not belong to subject ID ${newSubjectId}. (Faculty belongs to subject ID ${facultyRecord.subject_id}).`
    );
  }

  // Conflict detection
  const conflict = await checkScheduleConflicts(db, {
    schedule_date: newDate,
    start_time: newStart,
    end_time: newEnd,
    faculty_id: newFacultyId,
    class_id: newClassId,
    excludeScheduleId: scheduleId
  });

  if (conflict.hasConflict) {
    throw new Error(`Schedule conflict detected: ${conflict.reason}`);
  }

  const newScheduleType = params.schedule_type !== undefined ? params.schedule_type : existing.schedule_type;
  const newContent = params.content !== undefined ? params.content : existing.content;
  const newStatus = params.status !== undefined ? params.status : existing.status;
  const newNotes = params.notes !== undefined ? params.notes : existing.notes;

  await db
    .prepare(
      `UPDATE schedules SET
        schedule_date = ?, start_time = ?, end_time = ?, class_id = ?, subject_id = ?,
        faculty_id = ?, schedule_type = ?, content = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(
      newDate,
      newStart,
      newEnd,
      newClassId,
      newSubjectId,
      newFacultyId,
      newScheduleType,
      newContent,
      newStatus,
      newNotes,
      scheduleId
    )
    .run();

  const updated = await db
    .prepare(
      `SELECT 
        sc.*,
        f.name as faculty_name,
        s.name as subject_name,
        cl.name as class_name,
        cl.batch as class_batch
      FROM schedules sc
      JOIN faculty f ON sc.faculty_id = f.id
      JOIN subjects s ON sc.subject_id = s.id
      JOIN classes cl ON sc.class_id = cl.id
      WHERE sc.id = ?`
    )
    .bind(scheduleId)
    .first<any>();

  return mapJoinedScheduleRow(updated);
}

/**
 * Cancels a schedule by updating its status to 'cancelled' and appending cancellation details.
 */
export async function cancelScheduleRecord(
  db: D1Database,
  scheduleId: number,
  reason?: string
): Promise<{ success: boolean; message: string; schedule: Schedule }> {
  const existing = await db.prepare('SELECT * FROM schedules WHERE id = ?').bind(scheduleId).first<any>();
  if (!existing) {
    throw new Error(`Schedule with ID ${scheduleId} not found.`);
  }

  const noteAddition = reason ? `[Cancelled: ${reason}]` : '[Cancelled]';
  const updatedNotes = existing.notes ? `${existing.notes} ${noteAddition}` : noteAddition;

  await db
    .prepare(
      `UPDATE schedules SET status = 'cancelled', notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
    .bind(updatedNotes, scheduleId)
    .run();

  const updated = await db
    .prepare(
      `SELECT 
        sc.*,
        f.name as faculty_name,
        s.name as subject_name,
        cl.name as class_name,
        cl.batch as class_batch
      FROM schedules sc
      JOIN faculty f ON sc.faculty_id = f.id
      JOIN subjects s ON sc.subject_id = s.id
      JOIN classes cl ON sc.class_id = cl.id
      WHERE sc.id = ?`
    )
    .bind(scheduleId)
    .first<any>();

  return {
    success: true,
    message: `Schedule #${scheduleId} has been successfully cancelled.`,
    schedule: mapJoinedScheduleRow(updated)
  };
}
