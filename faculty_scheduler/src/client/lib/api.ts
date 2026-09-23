import type { Subject, Faculty, ClassItem, Schedule } from '../types';

export const ADMIN_TOKEN_KEY = 'fs_admin_token';

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function removeAdminToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAdminToken();
  if (token) {
    headers.set('x-admin-token', token);
  }

  const res = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers
  });

  const contentType = res.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const errorMsg =
      (data && typeof data === 'object' && ((data as any).message || (data as any).error)) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(errorMsg, res.status, data);
  }

  return data as T;
}

export const api = {
  // Health
  health: () => request<{ status: string; service: string }>('/api/health'),
  dbHealth: () => request<{ status: string; database: string }>('/api/db-health'),

  // Admin Auth
  adminLogin: (password: string) =>
    request<{ success: boolean; token: string; message: string }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    }),

  // Subjects
  getSubjects: (status?: string) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<Subject[]>(`/api/subjects${query}`);
  },
  getSubjectFaculty: (subjectId: number) =>
    request<Faculty[]>(`/api/subjects/${subjectId}/faculty`),
  createSubject: (payload: { name: string; display_order?: number; status?: string }) =>
    request<Subject>('/api/subjects', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateSubject: (id: number, payload: Partial<Subject>) =>
    request<Subject>(`/api/subjects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteSubject: (id: number) =>
    request<{ success: boolean; message: string }>(`/api/subjects/${id}`, {
      method: 'DELETE'
    }),

  // Faculty
  getFaculty: (filters?: { subject_id?: number; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.subject_id) params.set('subject_id', String(filters.subject_id));
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<Faculty[]>(`/api/faculty${qs}`);
  },
  getFacultySchedules: (facultyId: number, filters?: { date?: string; from?: string; to?: string }) => {
    const params = new URLSearchParams();
    if (filters?.date) params.set('date', filters.date);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<Schedule[]>(`/api/faculty/${facultyId}/schedules${qs}`);
  },
  createFaculty: (payload: {
    subject_id: number;
    name: string;
    department?: string;
    phone?: string;
    status?: string;
    display_order?: number;
  }) =>
    request<Faculty>('/api/faculty', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateFaculty: (id: number, payload: Partial<Faculty>) =>
    request<Faculty>(`/api/faculty/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteFaculty: (id: number) =>
    request<{ success: boolean; soft_deleted: boolean; message: string }>(`/api/faculty/${id}`, {
      method: 'DELETE'
    }),

  // Classes
  getClasses: (status?: string) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<ClassItem[]>(`/api/classes${query}`);
  },
  createClass: (payload: {
    name: string;
    batch?: string;
    academic_year?: string;
    status?: string;
    display_order?: number;
  }) =>
    request<ClassItem>('/api/classes', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateClass: (id: number, payload: Partial<ClassItem>) =>
    request<ClassItem>(`/api/classes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteClass: (id: number) =>
    request<{ success: boolean; message: string }>(`/api/classes/${id}`, {
      method: 'DELETE'
    }),

  // Schedules
  getSchedules: (filters?: {
    date?: string;
    from?: string;
    to?: string;
    faculty_id?: number;
    class_id?: number;
    subject_id?: number;
    type?: string;
    status?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.date) params.set('date', filters.date);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    if (filters?.faculty_id) params.set('faculty_id', String(filters.faculty_id));
    if (filters?.class_id) params.set('class_id', String(filters.class_id));
    if (filters?.subject_id) params.set('subject_id', String(filters.subject_id));
    if (filters?.type) params.set('type', filters.type);
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<Schedule[]>(`/api/schedules${qs}`);
  },
  createSchedule: (payload: {
    schedule_date: string;
    start_time: string;
    end_time?: string | null;
    class_id: number;
    subject_id: number;
    faculty_id: number;
    schedule_type: string;
    content?: string | null;
    status?: string;
    notes?: string | null;
  }) =>
    request<Schedule>('/api/schedules', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateSchedule: (id: number, payload: Partial<Schedule>) =>
    request<Schedule>(`/api/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  updateScheduleDate: (id: number, schedule_date: string) =>
    request<Schedule>(`/api/schedules/${id}/date`, {
      method: 'PATCH',
      body: JSON.stringify({ schedule_date })
    }),
  deleteSchedule: (id: number) =>
    request<{ success: boolean; message: string }>(`/api/schedules/${id}`, {
      method: 'DELETE'
    }),
  getSyncVersion: (facultyId?: number) => {
    const qs = facultyId ? `?faculty_id=${facultyId}` : '';
    return request<{ version: string; timestamp: number }>(`/api/sync/version${qs}`);
  }
};
