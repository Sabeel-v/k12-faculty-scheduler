import React, { useEffect, useState, useMemo, useRef } from 'react';
import { api } from '../../lib/api';
import type { Faculty, Schedule } from '../../types';
import { getSubjectTheme } from '../../lib/subjectColors';

import { useSmartSync } from '../../hooks/useSmartSync';

interface FacultyCalendarPageProps {
  onNavigate?: (path: string) => void;
}

const STORAGE_KEY_FACULTY_ID = 'fs_selected_faculty_id';

export const FacultyCalendarPage: React.FC<FacultyCalendarPageProps> = ({ onNavigate }) => {
  const [faculty, setFaculty] = useState<Faculty | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [showPreviousDates, setShowPreviousDates] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const todayCardRef = useRef<HTMLDivElement>(null);

  const facultyId = useMemo(() => {
    const saved = localStorage.getItem(STORAGE_KEY_FACULTY_ID);
    return saved ? Number(saved) : null;
  }, []);

  const handleBack = () => {
    if (window.history.length > 1 && window.opener) {
      window.close();
      return;
    }
    if (onNavigate) {
      onNavigate('/faculty');
    } else {
      window.location.href = '/faculty';
    }
  };

  // Helper to re-fetch only the schedule items (silent)
  const refreshSchedules = async () => {
    if (!facultyId) return;
    try {
      const schData = await api.getFacultySchedules(facultyId);
      setSchedules(schData);
    } catch (err) {
      console.error('Failed to update faculty schedules via smart sync:', err);
    }
  };

  // Initial load of faculty info + schedules
  useEffect(() => {
    if (!facultyId) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadInitial() {
      try {
        setLoading(true);
        const [facultyList, schData] = await Promise.all([
          api.getFaculty({ status: 'active' }),
          api.getFacultySchedules(facultyId!)
        ]);
        if (isMounted) {
          const found = facultyList.find((f) => f.id === facultyId);
          setFaculty(found || null);
          setSchedules(schData);
        }
      } catch (err) {
        console.error('Failed to load faculty schedule calendar:', err);
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
  }, [facultyId]);

  // Smart Real-time Sync: checks lightweight /api/sync/version every 25s, only reloads schedules on actual change
  useSmartSync({
    facultyId,
    enabled: !!facultyId,
    onSyncNeeded: refreshSchedules
  });

  // Auto-scroll to today's date when loaded
  useEffect(() => {
    if (!loading && schedules.length > 0) {
      const timer = setTimeout(() => {
        if (todayCardRef.current) {
          todayCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loading, schedules]);

  // Group schedules by date
  const { groupedByDate, hasPastSchedules } = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    let list = schedules;

    const hasPast = schedules.some((s) => s.schedule_date && s.schedule_date < todayStr);

    if (selectedDate) {
      list = list.filter((s) => s.schedule_date === selectedDate);
    } else if (!showPreviousDates) {
      // By default: only show Today and future schedules (so first card is today or next upcoming)
      list = list.filter((s) => s.schedule_date && s.schedule_date >= todayStr);
    }

    const map: Record<string, Schedule[]> = {};
    for (const item of list) {
      if (!map[item.schedule_date]) {
        map[item.schedule_date] = [];
      }
      map[item.schedule_date].push(item);
    }

    const sortedDates = Object.keys(map).sort();
    const groups = sortedDates.map((date) => {
      const items = map[date].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
      return {
        date,
        items
      };
    });

    return {
      groupedByDate: groups,
      hasPastSchedules: hasPast
    };
  }, [schedules, selectedDate, showPreviousDates]);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Completed</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-700 border border-rose-200">Cancelled</span>;
      case 'rescheduled':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">Rescheduled</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">Scheduled</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Back button */}
      <div>
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 shadow-2xs transition cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back</span>
        </button>
      </div>

      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>📅</span> {faculty ? `${faculty.name} — Full Schedule Calendar` : 'Full Schedule Calendar'}
            </h1>
            {faculty?.subject && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                {faculty.subject.name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete schedule history and upcoming dates for {faculty ? `Prof. ${faculty.name}` : 'your classes'}
          </p>
        </div>

        {/* Action Controls: Jump to date filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">Jump to Date:</label>
            <div className="flex items-center gap-2">
              <div
                onClick={() => {
                  try {
                    dateInputRef.current?.showPicker?.();
                  } catch (e) {
                    dateInputRef.current?.focus();
                  }
                }}
                className="relative flex items-center px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-900 cursor-pointer min-w-[130px]"
              >
                <span className="flex-1 select-none">
                  {(() => {
                    if (!selectedDate) return <span className="text-slate-400 font-normal">DD/MM/YYYY</span>;
                    const parts = selectedDate.split('-');
                    if (parts.length === 3) {
                      const [y, m, d] = parts;
                      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
                    }
                    return selectedDate;
                  })()}
                </span>
                <span className="text-slate-400 text-xs ml-1.5 select-none">📅</span>
                <input
                  ref={dateInputRef}
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer pointer-events-auto"
                />
              </div>
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate('')}
                  className="text-xs text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                >
                  Clear Filter
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mr-3"></div>
          <span className="text-sm font-medium">Loading full schedule...</span>
        </div>
      ) : !facultyId ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-500 text-sm shadow-sm space-y-3">
          <p>Please select a faculty on the home page first.</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition cursor-pointer"
          >
            Go to Faculty Portal
          </button>
        </div>
      ) : groupedByDate.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-500 text-sm shadow-sm space-y-3">
          <p className="text-slate-600 font-medium">
            {selectedDate
              ? `No scheduled classes found for ${selectedDate}.`
              : 'No upcoming scheduled classes found.'}
          </p>
          {!selectedDate && hasPastSchedules && !showPreviousDates && (
            <button
              type="button"
              onClick={() => setShowPreviousDates(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition cursor-pointer shadow-sm"
            >
              <span>🕒</span> View Previous Schedules
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Previous Schedules Button placed right on top of Today / first card */}
          {hasPastSchedules && !selectedDate && (
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setShowPreviousDates((prev) => !prev)}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer shadow-2xs ${
                  showPreviousDates
                    ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span>{showPreviousDates ? '👁️' : '🕒'}</span>
                <span>{showPreviousDates ? 'Hide Previous Schedules' : 'Previous Schedules'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                  {showPreviousDates ? 'Showing all' : 'Click to view'}
                </span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groupedByDate.map((group) => {
              const todayStr = new Date().toISOString().split('T')[0];
              const isToday = group.date === todayStr;

              return (
                <div
                  key={group.date}
                  ref={isToday ? todayCardRef : undefined}
                  className={`bg-white border rounded-2xl p-5 shadow-sm space-y-4 min-h-[220px] transition-all ${
                    isToday ? 'border-blue-300 ring-2 ring-blue-500/20 shadow-md' : 'border-slate-200'
                  }`}
                >
                {/* Date header */}
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <div>
                    {isToday && (
                      <div className="mb-1">
                        <span className="text-[11px] font-extrabold tracking-wider px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                          TODAY
                        </span>
                      </div>
                    )}
                    <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                      {(() => {
                        try {
                          const [y, m, d] = group.date.split('-').map(Number);
                          return new Date(y, m - 1, d).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: '2-digit',
                            year: 'numeric'
                          });
                        } catch {
                          return group.date;
                        }
                      })()}
                    </h3>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {group.items.length} {group.items.length === 1 ? 'class' : 'classes'}
                  </span>
                </div>

                {/* Schedules list */}
                <div className="space-y-3">
                  {group.items.map((item) => {
                    const theme = getSubjectTheme(item.subject?.name);
                    const hasTime = !!item.start_time;

                    return (
                      <div
                        key={item.id}
                        className={`p-4 rounded-2xl border ${theme.border} ${theme.bg} space-y-2.5 relative overflow-hidden`}
                      >
                        <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${theme.accent}`} />

                        {/* Top line: Time on left (if exists), Session on right */}
                        <div className="flex items-center justify-between pl-1">
                          {hasTime ? (
                            <span className="text-xs font-bold text-slate-700 font-mono tracking-tight bg-slate-100/90 px-2.5 py-0.5 rounded-lg">
                              {item.start_time}{item.end_time ? ` – ${item.end_time}` : ''}
                            </span>
                          ) : (
                            <span />
                          )}

                          <div className="flex items-center gap-2">
                            {item.status && item.status !== 'scheduled' && (
                              getStatusBadge(item.status)
                            )}
                            <span className="text-[11px] font-extrabold px-3 py-1 rounded-xl bg-[#0f233a] text-white uppercase tracking-wider">
                              {item.schedule_type}
                            </span>
                          </div>
                        </div>

                        {/* Class name */}
                        <div className="pl-1 text-base font-extrabold text-slate-900 tracking-tight">
                          {item.class?.name} {item.class?.batch ? `(${item.class.batch})` : ''}
                        </div>

                        {/* Topic / Content box */}
                        {item.content && (
                          <div className="ml-1 px-4 py-2.5 rounded-xl bg-slate-50/80 border border-slate-100 text-xs font-semibold text-slate-700 tracking-wide">
                            {item.content}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
};
