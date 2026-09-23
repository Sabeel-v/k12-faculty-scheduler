import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../lib/api';
import type { Schedule, ClassItem, Subject } from '../../types';
import { getSubjectTheme } from '../../lib/subjectColors';

import { useSmartSync } from '../../hooks/useSmartSync';

export const MentorPage: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterClassId, setFilterClassId] = useState<string>('');
  const [filterSubjectId, setFilterSubjectId] = useState<string>('');

  // Initial load of classes, subjects, and schedules
  useEffect(() => {
    let isMounted = true;

    async function loadInitial() {
      try {
        setLoading(true);
        const [schData, clsData, subData] = await Promise.all([
          api.getSchedules(),
          api.getClasses('active'),
          api.getSubjects('active')
        ]);
        if (isMounted) {
          setSchedules(schData);
          setClasses(clsData);
          setSubjects(subData);
        }
      } catch (err) {
        console.error('Failed to load mentor schedule data:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadInitial();

    return () => {
      isMounted = false;
    };
  }, []);

  // Helper to re-fetch only schedules when version changes
  const refreshSchedules = async () => {
    try {
      const schData = await api.getSchedules();
      setSchedules(schData);
    } catch (err) {
      console.error('Failed to refresh mentor schedules via smart sync:', err);
    }
  };

  // Smart Real-time Sync for schedules
  useSmartSync({
    onSyncNeeded: refreshSchedules
  });

  // Compute 3 target dates: Today, Tomorrow, Day after Tomorrow
  const threeDays = useMemo(() => {
    const formatDateYMD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const now = new Date();

    const d0 = new Date(now);
    const d1 = new Date(now);
    d1.setDate(d1.getDate() + 1);
    const d2 = new Date(now);
    d2.setDate(d2.getDate() + 2);

    return [
      {
        tag: 'TODAY',
        dateStr: formatDateYMD(d0),
        dateObj: d0
      },
      {
        tag: 'TOMORROW',
        dateStr: formatDateYMD(d1),
        dateObj: d1
      },
      {
        tag: 'DAY AFTER TOMORROW',
        dateStr: formatDateYMD(d2),
        dateObj: d2
      }
    ];
  }, []);

  // Filter schedules by Class & Subject
  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (filterClassId && s.class_id !== Number(filterClassId)) return false;
      if (filterSubjectId && s.subject_id !== Number(filterSubjectId)) return false;
      return true;
    });
  }, [schedules, filterClassId, filterSubjectId]);

  // Helper for class sorting order (SSLC first, then Class 9, Class 8, etc.)
  const getClassWeight = (className?: string) => {
    if (!className) return 999;
    const lower = className.toLowerCase();
    if (lower.includes('sslc')) return 1;
    if (lower.includes('9') || lower.includes('nine')) return 2;
    if (lower.includes('8') || lower.includes('eight')) return 3;
    if (lower.includes('10') || lower.includes('ten')) return 4;
    return 100;
  };

  // Group schedules for each of the 3 days
  const dateColumns = useMemo(() => {
    return threeDays.map((day) => {
      const daySchedules = filteredSchedules.filter((s) => s.schedule_date === day.dateStr);

      // Group by Class
      const classMap: Record<string, { label: string; classObj: any; weight: number; items: Schedule[] }> = {};

      for (const item of daySchedules) {
        const classKey = item.class_id ? `class_${item.class_id}` : 'unassigned';
        const label = item.class
          ? `${item.class.name}${item.class.batch ? ` (${item.class.batch})` : ''}`
          : 'General';
        const weight = getClassWeight(item.class?.name);

        if (!classMap[classKey]) {
          classMap[classKey] = {
            label,
            classObj: item.class,
            weight,
            items: []
          };
        }
        classMap[classKey].items.push(item);
      }

      // Sort classes canonically (SSLC first, etc.)
      const sortedClasses = Object.values(classMap).sort((a, b) => {
        if (a.weight !== b.weight) return a.weight - b.weight;
        return a.label.localeCompare(b.label);
      });

      // Sort items inside each class by start time
      return {
        ...day,
        totalCount: daySchedules.length,
        classGroups: sortedClasses
      };
    });
  }, [threeDays, filteredSchedules]);

  const formatDisplayDate = (d: Date) => {
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Mentor Portal</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Institutional master schedule across Today, Tomorrow, and Day After Tomorrow
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Class
            </label>
            <select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.batch ? `(${c.batch})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Subject
            </label>
            <select
              value={filterSubjectId}
              onChange={(e) => setFilterSubjectId(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">All Subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {(filterClassId || filterSubjectId) && (
            <div className="self-end pb-0.5">
              <button
                onClick={() => {
                  setFilterClassId('');
                  setFilterSubjectId('');
                }}
                className="px-2.5 py-1.5 text-xs text-rose-600 hover:text-rose-800 font-medium hover:underline cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3-Column Schedule Board: Today, Tomorrow, Day After Tomorrow */}
      {loading ? (
        <div className="py-20 text-center text-sm text-slate-400">Loading schedules...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dateColumns.map((col) => (
            <div
              key={col.dateStr}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 min-h-[300px]"
            >
              {/* Column Header: Day Label (Today/Tomorrow/Day After Tomorrow), Date, and Total Count */}
              <div className="border-b border-slate-100 pb-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-extrabold tracking-wider px-2.5 py-0.5 rounded-full ${
                      col.tag === 'TODAY'
                        ? 'bg-blue-100 text-blue-800'
                        : col.tag === 'TOMORROW'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {col.tag}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {col.totalCount} {col.totalCount === 1 ? 'schedule' : 'schedules'}
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight pt-0.5">
                  {formatDisplayDate(col.dateObj)}
                </h3>
              </div>

              {/* Column Body: Class groups or Empty indicator */}
              {col.totalCount === 0 ? (
                <div className="py-14 text-center text-xs text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                  No schedules planned for this day
                </div>
              ) : (
                <div className="space-y-4">
                  {col.classGroups.map((clsGroup) => (
                    <div key={clsGroup.label} className="space-y-2.5">
                      {/* Class Header with Dark Pill and Session Count */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0f233a] text-white text-xs font-bold shadow-xs">
                          <svg className="w-3.5 h-3.5 text-slate-300" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 16v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 12.094A5.973 5.973 0 004 15v1H1v-1a3 3 0 013.75-2.906z" />
                          </svg>
                          <span className="uppercase tracking-wider">{clsGroup.label}</span>
                        </div>
                        <span className="text-xs font-medium text-slate-500">
                          {clsGroup.items.length} {clsGroup.items.length === 1 ? 'session' : 'sessions'}
                        </span>
                      </div>

                      {/* Schedule Cards for this Class */}
                      <div className="space-y-2.5">
                        {clsGroup.items.map((item) => {
                          const theme = getSubjectTheme(item.subject?.name);
                          const isAllDay = !item.start_time;

                          return (
                            <div
                              key={item.id}
                              className={`p-4 rounded-2xl border ${theme.border} ${theme.bg} space-y-2.5 relative overflow-hidden`}
                            >
                              {/* Left Accent Bar */}
                              <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${theme.accent}`} />

                              {/* Top Line: Time (left, if exists) and Session pill (right) */}
                              <div className="flex items-center justify-between pl-1">
                                {item.start_time ? (
                                  <span className="text-xs font-bold text-slate-700 font-mono tracking-tight">
                                    {item.start_time}{item.end_time ? ` – ${item.end_time}` : ''}
                                  </span>
                                ) : (
                                  <span />
                                )}

                                <span className="text-[11px] font-bold px-3 py-1 rounded-xl bg-white border border-slate-200 text-slate-800 uppercase shadow-2xs">
                                  {item.schedule_type}
                                </span>
                              </div>

                              {/* Subject & Teacher row: Clean text without separate box/pill backgrounds */}
                              <div className="flex items-center justify-between pl-1 pt-1">
                                <div className="flex items-center gap-2">
                                  <span className={`w-3 h-3 rounded-full ${theme.accent}`}></span>
                                  <span className="text-base font-extrabold text-slate-900 tracking-tight">
                                    {item.subject?.name}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                                  <span>👨‍🏫</span>
                                  <span>{item.faculty?.name}</span>
                                </div>
                              </div>

                              {/* Content / Notes (if exists) */}
                              {item.content && (
                                <div className="text-xs text-slate-700 bg-white/95 p-2.5 rounded-xl border border-slate-200/80 ml-1">
                                  {item.content}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Calendar Button to Open Full Schedule in New Page */}
      <div className="pt-2 flex flex-col items-center justify-center">
        <a
          href="/mentor/calendar"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm shadow-sm transition hover:shadow-md cursor-pointer"
        >
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Calender</span>
        </a>
      </div>
    </div>
  );
};


