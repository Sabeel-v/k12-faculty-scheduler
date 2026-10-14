import type { YouTubeSchedule, YouTubeScheduleType } from '../types';
import {
  getTodayKolkata,
  isValidDateFormat,
  normalizeTime,
  resolveFaculty,
  resolveClass,
  resolveSubject
} from './scheduling';

export const VALID_YOUTUBE_TYPES: YouTubeScheduleType[] = ['Live', 'Content Video', 'Shorts'];

/**
 * Normalizes user-input category/type to exact YouTubeScheduleType.
 * Supports case-insensitive matches, e.g. "live" -> "Live", "content video" -> "Content Video", "shorts" -> "Shorts", "short" -> "Shorts".
 */
export function normalizeYouTubeType(input?: string | null): YouTubeScheduleType | null {
  if (!input) return null;
  const clean = input.trim().toLowerCase();
  if (clean === 'live' || clean.includes('live')) return 'Live';
  if (clean === 'shorts' || clean.includes('short')) return 'Shorts';
  if (clean === 'content video' || clean.includes('video') || clean.includes('content')) return 'Content Video';
  return null;
}

/**
 * Fetches a full YouTube deliverable by ID including its multi-class and multi-faculty associations.
 */
export async function fetchYouTubeDeliverableById(
  db: D1Database,
  id: number
): Promise<YouTubeSchedule | null> {
  const row = await db
    .prepare(
      `SELECT ys.*, s.name as subject_name
       FROM youtube_schedules ys
       LEFT JOIN subjects s ON ys.subject_id = s.id
       WHERE ys.id = ?`
    )
    .bind(id)
    .first<any>();

  if (!row) return null;

  // Fetch joined classes
  const classesRes = await db
    .prepare(
      `SELECT c.id, c.name, c.batch
       FROM youtube_schedule_classes ysc
       JOIN classes c ON ysc.class_id = c.id
       WHERE ysc.youtube_schedule_id = ?
       ORDER BY c.display_order ASC, c.name ASC`
    )
    .bind(id)
    .all<any>();

  // Fetch joined faculties
  const facultiesRes = await db
    .prepare(
      `SELECT f.id, f.name, f.department, f.subject_id, s.name as subject_name
       FROM youtube_schedule_faculties ysf
       JOIN faculty f ON ysf.faculty_id = f.id
       LEFT JOIN subjects s ON f.subject_id = s.id
       WHERE ysf.youtube_schedule_id = ?
       ORDER BY f.display_order ASC, f.name ASC`
    )
    .bind(id)
    .all<any>();

  return {
    id: row.id,
    schedule_date: row.schedule_date,
    start_time: row.start_time || null,
    schedule_type: row.schedule_type as YouTubeScheduleType,
    is_common: !!row.is_common,
    subject_id: row.subject_id || null,
    content: row.content || null,
    status: row.status || 'scheduled',
    notes: row.notes || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    subject: row.is_common
      ? { id: 0, name: 'Common' }
      : row.subject_id
      ? { id: row.subject_id, name: row.subject_name }
      : null,
    classes: (classesRes.results || []).map((c) => ({
      id: c.id,
      name: c.name,
      batch: c.batch || null
    })),
    faculties: (facultiesRes.results || []).map((f) => ({
      id: f.id,
      name: f.name,
      department: f.department || null,
      subject_id: f.subject_id,
      subject_name: f.subject_name || undefined
    }))
  };
}

/**
 * Searches YouTube deliverables with flexible filters, pagination/limits, and joined multi-class / multi-faculty records.
 */
export async function searchYouTubeDeliverables(
  db: D1Database,
  params: {
    startDate?: string;
    endDate?: string;
    category?: string;
    facultyIdentifier?: string | number;
    classIdentifier?: string | number;
    subjectIdentifier?: string | number;
    isCommon?: boolean;
    status?: string;
    searchQuery?: string;
    limit?: number;
  }
): Promise<YouTubeSchedule[]> {
  let query = `
    SELECT ys.*, s.name as subject_name
    FROM youtube_schedules ys
    LEFT JOIN subjects s ON ys.subject_id = s.id
  `;

  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (params.startDate && params.endDate && params.startDate === params.endDate) {
    conditions.push('ys.schedule_date = ?');
    bindings.push(params.startDate);
  } else {
    if (params.startDate) {
      conditions.push('ys.schedule_date >= ?');
      bindings.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push('ys.schedule_date <= ?');
      bindings.push(params.endDate);
    }
  }

  if (params.category) {
    const normalizedType = normalizeYouTubeType(params.category);
    if (normalizedType) {
      conditions.push('ys.schedule_type = ?');
      bindings.push(normalizedType);
    }
  }

  if (params.status) {
    conditions.push('ys.status = ?');
    bindings.push(params.status);
  }

  if (params.isCommon !== undefined) {
    conditions.push('ys.is_common = ?');
    bindings.push(params.isCommon ? 1 : 0);
  } else if (params.subjectIdentifier !== undefined && params.subjectIdentifier !== '') {
    const subStr = String(params.subjectIdentifier).trim().toLowerCase();
    if (subStr === 'common') {
      conditions.push('ys.is_common = 1');
    } else {
      const resolved = await resolveSubject(db, params.subjectIdentifier);
      if (resolved) {
        conditions.push('ys.subject_id = ?');
        bindings.push(resolved.id);
      } else {
        return [];
      }
    }
  }

  if (params.facultyIdentifier !== undefined && params.facultyIdentifier !== '') {
    const resolvedFaculty = await resolveFaculty(db, params.facultyIdentifier);
    if (resolvedFaculty) {
      conditions.push(`ys.id IN (
        SELECT youtube_schedule_id FROM youtube_schedule_faculties WHERE faculty_id = ?
      )`);
      bindings.push(resolvedFaculty.id);
    } else {
      return [];
    }
  }

  if (params.classIdentifier !== undefined && params.classIdentifier !== '') {
    const resolvedClass = await resolveClass(db, params.classIdentifier);
    if (resolvedClass) {
      conditions.push(`ys.id IN (
        SELECT youtube_schedule_id FROM youtube_schedule_classes WHERE class_id = ?
      )`);
      bindings.push(resolvedClass.id);
    } else {
      return [];
    }
  }

  if (params.searchQuery && params.searchQuery.trim()) {
    conditions.push('(ys.content LIKE ? OR ys.notes LIKE ?)');
    const q = `%${params.searchQuery.trim().toLowerCase()}%`;
    bindings.push(q, q);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ` ORDER BY ys.schedule_date ASC, 
    CASE WHEN ys.start_time IS NULL OR ys.start_time = '' THEN 1 ELSE 0 END, 
    ys.start_time ASC, 
    ys.id ASC`;

  const maxLimit = Math.min(params.limit || 50, 100);
  query += ` LIMIT ${maxLimit}`;

  const stmt = db.prepare(query);
  const result = bindings.length > 0 ? await stmt.bind(...bindings).all<any>() : await stmt.all<any>();
  const rows = result.results || [];

  if (rows.length === 0) {
    return [];
  }

  const scheduleIds = rows.map((r) => r.id);
  const idPlaceholders = scheduleIds.map(() => '?').join(',');

  // Batch query classes and faculties for all retrieved deliverables
  const classesStmt = db.prepare(
    `SELECT ysc.youtube_schedule_id, c.id, c.name, c.batch
     FROM youtube_schedule_classes ysc
     JOIN classes c ON ysc.class_id = c.id
     WHERE ysc.youtube_schedule_id IN (${idPlaceholders})
     ORDER BY c.display_order ASC, c.name ASC`
  );
  const classesRes = await classesStmt.bind(...scheduleIds).all<any>();

  const facultiesStmt = db.prepare(
    `SELECT ysf.youtube_schedule_id, f.id, f.name, f.department, f.subject_id, s.name as subject_name
     FROM youtube_schedule_faculties ysf
     JOIN faculty f ON ysf.faculty_id = f.id
     LEFT JOIN subjects s ON f.subject_id = s.id
     WHERE ysf.youtube_schedule_id IN (${idPlaceholders})
     ORDER BY f.display_order ASC, f.name ASC`
  );
  const facultiesRes = await facultiesStmt.bind(...scheduleIds).all<any>();

  const classesMap = new Map<number, Array<{ id: number; name: string; batch?: string | null }>>();
  for (const row of classesRes.results || []) {
    const arr = classesMap.get(row.youtube_schedule_id) || [];
    arr.push({ id: row.id, name: row.name, batch: row.batch || null });
    classesMap.set(row.youtube_schedule_id, arr);
  }

  const facultiesMap = new Map<number, Array<{ id: number; name: string; department?: string | null; subject_id?: number; subject_name?: string }>>();
  for (const row of facultiesRes.results || []) {
    const arr = facultiesMap.get(row.youtube_schedule_id) || [];
    arr.push({
      id: row.id,
      name: row.name,
      department: row.department || null,
      subject_id: row.subject_id,
      subject_name: row.subject_name || undefined
    });
    facultiesMap.set(row.youtube_schedule_id, arr);
  }

  return rows.map((r) => ({
    id: r.id,
    schedule_date: r.schedule_date,
    start_time: r.start_time || null,
    schedule_type: r.schedule_type as YouTubeScheduleType,
    is_common: !!r.is_common,
    subject_id: r.subject_id || null,
    content: r.content || null,
    status: r.status || 'scheduled',
    notes: r.notes || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    subject: r.is_common
      ? { id: 0, name: 'Common' }
      : r.subject_id
      ? { id: r.subject_id, name: r.subject_name }
      : null,
    classes: classesMap.get(r.id) || [],
    faculties: facultiesMap.get(r.id) || []
  }));
}

/**
 * Checks for duplicate YouTube deliverables on the same date with matching category and overlapping details.
 */
export async function checkYouTubeDeliverableDuplicate(
  db: D1Database,
  params: {
    schedule_date: string;
    schedule_type: YouTubeScheduleType;
    classIds: number[];
    facultyIds: number[];
    content?: string | null;
    excludeId?: number;
  }
): Promise<{ isDuplicate: boolean; duplicateId?: number; reason?: string }> {
  let query = `
    SELECT id, schedule_type, content, start_time
    FROM youtube_schedules
    WHERE schedule_date = ? 
      AND schedule_type = ? 
      AND status != 'cancelled'
  `;
  const bindings: unknown[] = [params.schedule_date, params.schedule_type];

  if (params.excludeId) {
    query += ' AND id != ?';
    bindings.push(params.excludeId);
  }

  const existingRes = await db.prepare(query).bind(...bindings).all<any>();
  for (const item of existingRes.results || []) {
    // If content is identical and non-empty
    if (
      params.content &&
      item.content &&
      params.content.trim().toLowerCase() === item.content.trim().toLowerCase()
    ) {
      return {
        isDuplicate: true,
        duplicateId: item.id,
        reason: `An active ${params.schedule_type} deliverable (#${item.id}) with the exact same topic "${params.content}" already exists on ${params.schedule_date}.`
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Creates a new YouTube deliverable with full validation, entity resolution, and junction tables.
 */
export async function createYouTubeDeliverableRecord(
  db: D1Database,
  params: {
    schedule_date: string;
    schedule_type: string;
    classes: Array<string | number>;
    faculties: Array<string | number>;
    subject?: string | number | null;
    is_common?: boolean;
    start_time?: string | null;
    content?: string | null;
    notes?: string | null;
    status?: string;
  }
): Promise<YouTubeSchedule> {
  if (!params.schedule_date || !isValidDateFormat(params.schedule_date)) {
    throw new Error('Invalid or missing schedule_date. Required format is YYYY-MM-DD.');
  }

  const normalizedType = normalizeYouTubeType(params.schedule_type);
  if (!normalizedType) {
    throw new Error(
      `Invalid category/schedule_type '${params.schedule_type}'. Must be one of: Live, Content Video, Shorts.`
    );
  }

  if (!Array.isArray(params.classes) || params.classes.length === 0) {
    throw new Error('At least one class must be specified for a YouTube deliverable.');
  }

  if (!Array.isArray(params.faculties) || params.faculties.length === 0) {
    throw new Error('At least one faculty member must be specified for a YouTube deliverable.');
  }

  // Resolve all classes
  const resolvedClassIds: number[] = [];
  for (const cIdent of params.classes) {
    const resolved = await resolveClass(db, cIdent);
    if (!resolved) {
      throw new Error(`Class '${cIdent}' not found in database.`);
    }
    resolvedClassIds.push(resolved.id);
  }

  // Resolve all faculties
  const resolvedFacultyIds: number[] = [];
  for (const fIdent of params.faculties) {
    const resolved = await resolveFaculty(db, fIdent);
    if (!resolved) {
      throw new Error(`Faculty '${fIdent}' not found in database.`);
    }
    resolvedFacultyIds.push(resolved.id);
  }

  // Resolve Subject or Common
  let isCommon = !!params.is_common;
  let subjectId: number | null = null;

  if (params.subject !== undefined && params.subject !== null && params.subject !== '') {
    const subStr = String(params.subject).trim().toLowerCase();
    if (subStr === 'common') {
      isCommon = true;
      subjectId = null;
    } else {
      const resolvedSub = await resolveSubject(db, params.subject);
      if (!resolvedSub) {
        throw new Error(`Subject '${params.subject}' not found in database.`);
      }
      subjectId = resolvedSub.id;
      isCommon = false;
    }
  }

  // Check for duplicates
  const dupCheck = await checkYouTubeDeliverableDuplicate(db, {
    schedule_date: params.schedule_date,
    schedule_type: normalizedType,
    classIds: resolvedClassIds,
    facultyIds: resolvedFacultyIds,
    content: params.content
  });

  if (dupCheck.isDuplicate) {
    throw new Error(`Duplicate deliverable detected: ${dupCheck.reason}`);
  }

  const startTime = params.start_time ? normalizeTime(params.start_time) : null;
  const status = params.status || 'scheduled';

  // Insert parent row into youtube_schedules
  const insertRes = await db
    .prepare(
      `INSERT INTO youtube_schedules (
         schedule_date, start_time, schedule_type, is_common, subject_id, content, status, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      params.schedule_date,
      startTime,
      normalizedType,
      isCommon ? 1 : 0,
      subjectId,
      params.content?.trim() || null,
      status,
      params.notes?.trim() || null
    )
    .run();

  const newId = insertRes.meta.last_row_id;

  // Insert junction records
  const batchStatements: any[] = [];
  for (const cId of resolvedClassIds) {
    batchStatements.push(
      db
        .prepare('INSERT INTO youtube_schedule_classes (youtube_schedule_id, class_id) VALUES (?, ?)')
        .bind(newId, cId)
    );
  }
  for (const fId of resolvedFacultyIds) {
    batchStatements.push(
      db
        .prepare('INSERT INTO youtube_schedule_faculties (youtube_schedule_id, faculty_id) VALUES (?, ?)')
        .bind(newId, fId)
    );
  }

  if (batchStatements.length > 0) {
    await db.batch(batchStatements);
  }

  const created = await fetchYouTubeDeliverableById(db, newId);
  if (!created) {
    throw new Error('Failed to retrieve newly created YouTube deliverable.');
  }
  return created;
}

/**
 * Updates an existing YouTube deliverable record and optionally re-syncs multi-class and multi-faculty junctions.
 */
export async function updateYouTubeDeliverableRecord(
  db: D1Database,
  id: number,
  params: {
    schedule_date?: string;
    schedule_type?: string;
    classes?: Array<string | number>;
    faculties?: Array<string | number>;
    subject?: string | number | null;
    is_common?: boolean;
    start_time?: string | null;
    content?: string | null;
    notes?: string | null;
    status?: string;
  }
): Promise<YouTubeSchedule> {
  const existing = await fetchYouTubeDeliverableById(db, id);
  if (!existing) {
    throw new Error(`YouTube deliverable #${id} not found.`);
  }

  const newDate = params.schedule_date !== undefined ? params.schedule_date.trim() : existing.schedule_date;
  if (!isValidDateFormat(newDate)) {
    throw new Error(`Invalid schedule_date '${newDate}'. Format must be YYYY-MM-DD.`);
  }

  let newType = existing.schedule_type;
  if (params.schedule_type !== undefined) {
    const norm = normalizeYouTubeType(params.schedule_type);
    if (!norm) {
      throw new Error(`Invalid schedule_type '${params.schedule_type}'. Must be Live, Content Video, or Shorts.`);
    }
    newType = norm;
  }

  let isCommon = existing.is_common;
  let subjectId = existing.subject_id;

  if (params.is_common !== undefined) {
    isCommon = params.is_common;
    if (isCommon) subjectId = null;
  }

  if (params.subject !== undefined && params.subject !== null && params.subject !== '') {
    const subStr = String(params.subject).trim().toLowerCase();
    if (subStr === 'common') {
      isCommon = true;
      subjectId = null;
    } else {
      const resolved = await resolveSubject(db, params.subject);
      if (!resolved) throw new Error(`Subject '${params.subject}' not found.`);
      subjectId = resolved.id;
      isCommon = false;
    }
  }

  const newStartTime =
    params.start_time !== undefined
      ? params.start_time ? normalizeTime(params.start_time) : null
      : existing.start_time;

  const newContent = params.content !== undefined ? params.content?.trim() || null : existing.content;
  const newStatus = params.status !== undefined ? params.status : existing.status;
  const newNotes = params.notes !== undefined ? params.notes?.trim() || null : existing.notes;

  const batchStatements: any[] = [
    db
      .prepare(
        `UPDATE youtube_schedules
         SET schedule_date = ?,
             start_time = ?,
             schedule_type = ?,
             is_common = ?,
             subject_id = ?,
             content = ?,
             status = ?,
             notes = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(
        newDate,
        newStartTime,
        newType,
        isCommon ? 1 : 0,
        subjectId,
        newContent,
        newStatus,
        newNotes,
        id
      )
  ];

  // If classes were updated
  if (params.classes !== undefined) {
    if (!Array.isArray(params.classes) || params.classes.length === 0) {
      throw new Error('At least one class must be specified.');
    }
    const resolvedClassIds: number[] = [];
    for (const cIdent of params.classes) {
      const res = await resolveClass(db, cIdent);
      if (!res) throw new Error(`Class '${cIdent}' not found.`);
      resolvedClassIds.push(res.id);
    }

    batchStatements.push(
      db.prepare('DELETE FROM youtube_schedule_classes WHERE youtube_schedule_id = ?').bind(id)
    );
    for (const cId of resolvedClassIds) {
      batchStatements.push(
        db
          .prepare('INSERT INTO youtube_schedule_classes (youtube_schedule_id, class_id) VALUES (?, ?)')
          .bind(id, cId)
      );
    }
  }

  // If faculties were updated
  if (params.faculties !== undefined) {
    if (!Array.isArray(params.faculties) || params.faculties.length === 0) {
      throw new Error('At least one faculty member must be specified.');
    }
    const resolvedFacultyIds: number[] = [];
    for (const fIdent of params.faculties) {
      const res = await resolveFaculty(db, fIdent);
      if (!res) throw new Error(`Faculty '${fIdent}' not found.`);
      resolvedFacultyIds.push(res.id);
    }

    batchStatements.push(
      db.prepare('DELETE FROM youtube_schedule_faculties WHERE youtube_schedule_id = ?').bind(id)
    );
    for (const fId of resolvedFacultyIds) {
      batchStatements.push(
        db
          .prepare('INSERT INTO youtube_schedule_faculties (youtube_schedule_id, faculty_id) VALUES (?, ?)')
          .bind(id, fId)
      );
    }
  }

  await db.batch(batchStatements);

  const updated = await fetchYouTubeDeliverableById(db, id);
  if (!updated) {
    throw new Error('Failed to retrieve updated YouTube deliverable.');
  }
  return updated;
}

/**
 * Cancels or permanently removes an existing YouTube deliverable.
 */
export async function cancelYouTubeDeliverableRecord(
  db: D1Database,
  id: number,
  reason?: string,
  permanentDelete: boolean = false
): Promise<{ success: boolean; message: string; deliverable?: YouTubeSchedule }> {
  const existing = await fetchYouTubeDeliverableById(db, id);
  if (!existing) {
    throw new Error(`YouTube deliverable #${id} not found.`);
  }

  if (permanentDelete) {
    await db.batch([
      db.prepare('DELETE FROM youtube_schedule_classes WHERE youtube_schedule_id = ?').bind(id),
      db.prepare('DELETE FROM youtube_schedule_faculties WHERE youtube_schedule_id = ?').bind(id),
      db.prepare('DELETE FROM youtube_schedules WHERE id = ?').bind(id)
    ]);
    return {
      success: true,
      message: `YouTube deliverable #${id} has been permanently deleted from the database.`
    };
  }

  if (existing.status === 'cancelled') {
    return {
      success: true,
      message: `YouTube deliverable #${id} is already marked as cancelled.`,
      deliverable: existing
    };
  }

  const noteAddition = reason ? `[Cancelled: ${reason}]` : '[Cancelled]';
  const updatedNotes = existing.notes ? `${existing.notes} ${noteAddition}` : noteAddition;

  await db
    .prepare(
      `UPDATE youtube_schedules SET status = 'cancelled', notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
    .bind(updatedNotes, id)
    .run();

  const updated = await fetchYouTubeDeliverableById(db, id);
  return {
    success: true,
    message: `YouTube deliverable #${id} has been marked as cancelled.`,
    deliverable: updated || undefined
  };
}
