import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Faculty, Schedule } from '../../types';

import { useSmartSync } from '../../hooks/useSmartSync';

const STORAGE_KEY_FACULTY_ID = 'fs_selected_faculty_id';

export const FacultyPage: React.FC = () => {
  const [facultyList, setFacultyList] = useState<Faculty[]>([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState<number | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_FACULTY_ID);
    return saved ? Number(saved) : null;
  });

  const [loadingFaculty, setLoadingFaculty] = useState(true);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  // Load faculty list once on mount
  useEffect(() => {
    async function loadFaculty() {
      try {
        setLoadingFaculty(true);
        const data = await api.getFaculty({ status: 'active' });
        setFacultyList(data);
      } catch (err) {
        console.error('Failed to load faculty:', err);
      } finally {
        setLoadingFaculty(false);
      }
    }
    loadFaculty();
  }, []);

  // Helper to re-fetch only the schedule items (silent)
  const refreshSchedules = async () => {
    if (!selectedFacultyId) return;
    try {
      const data = await api.getFacultySchedules(selectedFacultyId);
      setSchedules(data);
    } catch (err) {
      console.error('Failed to refresh faculty schedules via smart sync:', err);
    }
  };

  // Initial load of schedules when selectedFacultyId changes
  useEffect(() => {
    if (!selectedFacultyId) {
      setSchedules([]);
      return;
    }

    let isMounted = true;

    async function loadSchedules() {
      try {
        setLoadingSchedules(true);
        const data = await api.getFacultySchedules(selectedFacultyId!);
        if (isMounted) {
          setSchedules(data);
        }
      } catch (err) {
        console.error('Failed to load faculty schedules:', err);
      } finally {
        if (isMounted) {
          setLoadingSchedules(false);
        }
      }
    }

    loadSchedules();

    return () => {
      isMounted = false;
    };
  }, [selectedFacultyId]);

  // Smart Real-time Sync: only re-fetch if version changes
  useSmartSync({
    facultyId: selectedFacultyId,
    enabled: !!selectedFacultyId,
    onSyncNeeded: refreshSchedules
  });

  const handleSelectFaculty = (id: number) => {
    setSelectedFacultyId(id);
    localStorage.setItem(STORAGE_KEY_FACULTY_ID, String(id));
    localStorage.setItem('fs_user_role', 'faculty');
  };

  const handleClearFaculty = () => {
    setSelectedFacultyId(null);
    localStorage.removeItem(STORAGE_KEY_FACULTY_ID);
    setSchedules([]);
  };

  const currentFaculty = facultyList.find((f) => f.id === selectedFacultyId);

  // Compute Today and Tomorrow dates in YYYY-MM-DD
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const todaySchedules = schedules.filter((s) => s.schedule_date === todayStr);
  const tomorrowSchedules = schedules.filter((s) => s.schedule_date === tomorrowStr);

  const getStatusBadge = (status: string) => {
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Faculty Selection Screen (if none selected) */}
      {!selectedFacultyId || !currentFaculty ? (
        <div className="max-w-md mx-auto mt-12 bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4 text-slate-700 text-xl font-bold">
            👨‍🏫
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Faculty Portal</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            Select your faculty name to view your assigned classes and schedule.
          </p>

          {loadingFaculty ? (
            <div className="py-6 text-sm text-slate-400">Loading faculty list...</div>
          ) : facultyList.length === 0 ? (
            <div className="p-4 bg-amber-50 text-amber-800 text-xs rounded-lg border border-amber-200">
              No active faculty registered yet. Please add faculty via the Admin Portal.
            </div>
          ) : (
            <div className="space-y-4 text-left">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Select Your Name
              </label>
              <select
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) handleSelectFaculty(Number(e.target.value));
                }}
              >
                <option value="" disabled>
                  -- Select Faculty --
                </option>
                {facultyList.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} — {f.subject?.name || 'General'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ) : (
        /* Selected Faculty Schedule View */
        <div className="space-y-6">
          {/* Top Header Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Welcome {currentFaculty.name} Sir
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  {currentFaculty.subject?.name}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {currentFaculty.department ? `${currentFaculty.department} • ` : ''}
                {currentFaculty.phone ? `Phone: ${currentFaculty.phone}` : 'Faculty Timetable'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearFaculty}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer"
              >
                Change Faculty
              </button>
            </div>
          </div>

          {loadingSchedules ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading your schedule...</div>
          ) : (
            <>
              {/* Today & Tomorrow Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Today */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 tracking-tight">TODAY</h2>
                      <span className="text-xs text-slate-400 font-mono">{todayStr}</span>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {todaySchedules.length} {todaySchedules.length === 1 ? 'class' : 'classes'}
                    </span>
                  </div>

                  {todaySchedules.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      No classes scheduled for today.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {todaySchedules.map((item) => (
                        <div
                          key={item.id}
                          className="p-5 rounded-2xl border border-slate-200/90 bg-white shadow-xs space-y-3 relative overflow-hidden"
                        >
                          {/* Left vertical accent line */}
                          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-blue-600 rounded-l" />

                          {/* Top row: Time pill on left (if exists), Dark SESSION pill on right */}
                          <div className="flex items-center justify-between pl-1">
                            {item.start_time ? (
                              <span className="text-xs font-bold text-slate-700 font-mono tracking-tight bg-slate-100/90 px-3 py-1 rounded-lg">
                                {item.start_time}{item.end_time ? ` – ${item.end_time}` : ''}
                              </span>
                            ) : (
                              <span />
                            )}
                            <span className="text-[11px] font-extrabold px-3 py-1 rounded-xl bg-[#0f233a] text-white uppercase tracking-wider">
                              {item.schedule_type}
                            </span>
                          </div>

                          {/* Middle row: Class Name */}
                          <div className="pl-1 text-base font-extrabold text-slate-900 tracking-tight">
                            {item.class?.name} {item.class?.batch ? `(${item.class.batch})` : ''}
                          </div>

                          {/* Bottom: Topic/Content container */}
                          {item.content && (
                            <div className="ml-1 px-4 py-2.5 rounded-xl bg-slate-50/80 border border-slate-100 text-xs font-semibold text-slate-700 tracking-wide">
                              {item.content}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tomorrow */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 tracking-tight">TOMORROW</h2>
                      <span className="text-xs text-slate-400 font-mono">{tomorrowStr}</span>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {tomorrowSchedules.length} {tomorrowSchedules.length === 1 ? 'class' : 'classes'}
                    </span>
                  </div>

                  {tomorrowSchedules.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      No classes scheduled for tomorrow.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tomorrowSchedules.map((item) => (
                        <div
                          key={item.id}
                          className="p-5 rounded-2xl border border-slate-200/90 bg-white shadow-xs space-y-3 relative overflow-hidden"
                        >
                          {/* Left vertical accent line */}
                          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-indigo-600 rounded-l" />

                          {/* Top row: Time pill on left (if exists), Dark SESSION pill on right */}
                          <div className="flex items-center justify-between pl-1">
                            {item.start_time ? (
                              <span className="text-xs font-bold text-slate-700 font-mono tracking-tight bg-slate-100/90 px-3 py-1 rounded-lg">
                                {item.start_time}{item.end_time ? ` – ${item.end_time}` : ''}
                              </span>
                            ) : (
                              <span />
                            )}
                            <span className="text-[11px] font-extrabold px-3 py-1 rounded-xl bg-[#0f233a] text-white uppercase tracking-wider">
                              {item.schedule_type}
                            </span>
                          </div>

                          {/* Middle row: Class Name */}
                          <div className="pl-1 text-base font-extrabold text-slate-900 tracking-tight">
                            {item.class?.name} {item.class?.batch ? `(${item.class.batch})` : ''}
                          </div>

                          {/* Bottom: Topic/Content container */}
                          {item.content && (
                            <div className="ml-1 px-4 py-2.5 rounded-xl bg-slate-50/80 border border-slate-100 text-xs font-semibold text-slate-700 tracking-wide">
                              {item.content}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Calender Button - Open full schedule in new page */}
              <div className="pt-2 flex flex-col items-center justify-center">
                <a
                  href="/faculty/calendar"
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
            </>
          )}
        </div>
      )}
    </div>
  );
};
