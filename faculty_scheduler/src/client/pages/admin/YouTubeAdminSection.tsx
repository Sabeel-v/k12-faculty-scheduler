import React, { useState, useMemo } from 'react';
import { api } from '../../lib/api';
import type { YouTubeSchedule, YouTubeScheduleType, ClassItem, Subject, Faculty } from '../../types';
import { YouTubeScheduleModal } from './YouTubeScheduleModal';
import { getSubjectTheme } from '../../lib/subjectColors';

interface YouTubeAdminSectionProps {
  youtubeSchedules: YouTubeSchedule[];
  classes: ClassItem[];
  subjects: Subject[];
  facultyList: Faculty[];
  onRefresh: () => Promise<void>;
  onAlert: (banner: { type: 'error' | 'success'; message: string }) => void;
}

export const YouTubeAdminSection: React.FC<YouTubeAdminSectionProps> = ({
  youtubeSchedules,
  classes,
  subjects,
  facultyList,
  onRefresh,
  onAlert
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showPreviousDates, setShowPreviousDates] = useState<boolean>(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSchedule, setEditingSchedule] = useState<YouTubeSchedule | null>(null);
  const [targetDate, setTargetDate] = useState<string | undefined>(undefined);

  // Drag-and-drop state
  const [draggedScheduleId, setDraggedScheduleId] = useState<number | null>(null);

  // Handle Create / Update Save
  const handleSave = async (payload: any) => {
    try {
      if (editingSchedule) {
        await api.updateYouTubeSchedule(editingSchedule.id, payload);
        onAlert({ type: 'success', message: 'YouTube schedule updated successfully.' });
      } else {
        await api.createYouTubeSchedule(payload);
        onAlert({ type: 'success', message: 'YouTube schedule created successfully.' });
      }
      await onRefresh();
    } catch (err: any) {
      throw err;
    }
  };

  // Handle Delete
  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this YouTube schedule?')) {
      return;
    }
    try {
      await api.deleteYouTubeSchedule(id);
      onAlert({ type: 'success', message: 'YouTube schedule deleted successfully.' });
      await onRefresh();
    } catch (err: any) {
      onAlert({ type: 'error', message: err?.message || 'Failed to delete YouTube schedule.' });
    }
  };

  // Handle Drop on Date Column
  const handleDropOnDate = async (newDate: string) => {
    if (!draggedScheduleId) return;
    const scheduleToMove = youtubeSchedules.find((s) => s.id === draggedScheduleId);
    setDraggedScheduleId(null);

    if (!scheduleToMove || scheduleToMove.schedule_date === newDate) {
      return;
    }

    try {
      await api.updateYouTubeScheduleDate(scheduleToMove.id, newDate);
      onAlert({
        type: 'success',
        message: `Rescheduled to ${newDate} successfully.`
      });
      await onRefresh();
    } catch (err: any) {
      onAlert({
        type: 'error',
        message: err?.message || 'Failed to reschedule.'
      });
    }
  };

  // Filtered schedules based on search and type
  const filteredSchedules = useMemo(() => {
    return youtubeSchedules.filter((item) => {
      // Type filter
      if (filterType !== 'all' && item.schedule_type !== filterType) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesContent = item.content?.toLowerCase().includes(q);
        const matchesNotes = item.notes?.toLowerCase().includes(q);
        const matchesSubject =
          (item.is_common && 'common'.includes(q)) ||
          item.subject?.name?.toLowerCase().includes(q);
        const matchesClass = item.classes?.some(
          (c) => c.name.toLowerCase().includes(q) || (c.batch && c.batch.toLowerCase().includes(q))
        );
        const matchesFaculty = item.faculties?.some((f) => f.name.toLowerCase().includes(q));

        if (!matchesContent && !matchesNotes && !matchesSubject && !matchesClass && !matchesFaculty) {
          return false;
        }
      }

      return true;
    });
  }, [youtubeSchedules, filterType, searchQuery]);

  // Date-wise grouping
  const dateWiseGroups = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Collect all unique dates from filtered items
    const allDates = Array.from(new Set(filteredSchedules.map((s) => s.schedule_date))).sort();

    // Check if there are past schedules
    const pastDates = allDates.filter((d) => d < todayStr);
    const hasPastSchedules = pastDates.length > 0;

    // Minimum forward dates to show (e.g. today, tomorrow, day after)
    const futureDatesSet = new Set<string>();
    futureDatesSet.add(todayStr);

    for (let i = 1; i <= 6; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      futureDatesSet.add(d.toISOString().split('T')[0]);
    }

    // Add all future dates that actually have schedules
    allDates.forEach((d) => {
      if (d >= todayStr) {
        futureDatesSet.add(d);
      }
    });

    let displayDates: string[] = [];

    if (showPreviousDates) {
      // Include all past dates + future dates
      displayDates = Array.from(new Set([...allDates, ...Array.from(futureDatesSet)])).sort();
    } else {
      displayDates = Array.from(futureDatesSet).sort();
    }

    const groups = displayDates.map((dateStr) => {
      const items = filteredSchedules
        .filter((s) => s.schedule_date === dateStr)
        .sort((a, b) => {
          const aTime = a.start_time || '';
          const bTime = b.start_time || '';
          if (!aTime && bTime) return 1;
          if (aTime && !bTime) return -1;
          return aTime.localeCompare(bTime);
        });

      return {
        date: dateStr,
        items,
        totalCount: items.length
      };
    });

    return {
      groups,
      hasPastSchedules
    };
  }, [filteredSchedules, showPreviousDates]);

  return (
    <div className="space-y-6">
      {/* Top Header & Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-red-500/20">
                ▶️
              </span>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                YOUTUBE DELIVERABLES
              </h2>
              <span className="text-[11px] text-slate-400 font-medium hidden md:inline">
                ↔ Drag schedules between dates to reschedule
              </span>
            </div>
            <p className="text-xs text-slate-500 pl-10.5">
              Multi-class, multi-faculty YouTube Live streams, Content Videos, and Shorts
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingSchedule(null);
              setTargetDate(undefined);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition shadow-md shadow-red-500/20 cursor-pointer self-start sm:self-center"
          >
            <span>+</span>
            <span>Create YouTube Schedule</span>
          </button>
        </div>

        {/* Sub-bar: Type pills & Search box */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                filterType === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Deliverables
            </button>
            <button
              type="button"
              onClick={() => setFilterType('Live')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                filterType === 'Live'
                  ? 'bg-white text-red-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-red-600'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-600" />
              <span>Live</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('Content Video')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                filterType === 'Content Video'
                  ? 'bg-white text-blue-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-blue-600'
              }`}
            >
              <span>🎬</span>
              <span>Content Video</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('Shorts')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                filterType === 'Shorts'
                  ? 'bg-white text-amber-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-amber-600'
              }`}
            >
              <span>⚡</span>
              <span>Shorts</span>
            </button>
          </div>

          <div className="relative flex items-center">
            <span className="absolute left-3 text-slate-400 text-xs pointer-events-none">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topic, faculty, class..."
              className="pl-8 pr-7 py-1.5 w-56 sm:w-64 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Date Controls: Previous Schedules Toggle */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => setShowPreviousDates((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs border cursor-pointer ${
            showPreviousDates
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 border-slate-200'
          }`}
        >
          <span className={`inline-block transition-transform duration-200 ${showPreviousDates ? 'rotate-180' : ''}`}>
            ←
          </span>
          <span>{showPreviousDates ? 'Hide Previous Schedules' : 'Previous Schedules'}</span>
          {dateWiseGroups.hasPastSchedules && !showPreviousDates && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
          )}
        </button>

        <span className="text-xs text-slate-400">
          Total items: <strong className="text-slate-700">{filteredSchedules.length}</strong>
        </span>
      </div>

      {/* Date-wise Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dateWiseGroups.groups.map((group) => {
          const todayStr = new Date().toISOString().split('T')[0];
          const isToday = group.date === todayStr;

          return (
            <div
              key={group.date}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('ring-2', 'ring-red-500', 'bg-red-50/20');
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('ring-2', 'ring-red-500', 'bg-red-50/20');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('ring-2', 'ring-red-500', 'bg-red-50/20');
                handleDropOnDate(group.date);
              }}
              className={`bg-white border rounded-2xl p-5 shadow-sm space-y-4 min-h-[240px] transition ${
                isToday ? 'border-red-300 ring-2 ring-red-500/10' : 'border-slate-200'
              }`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  {isToday && (
                    <span className="text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-red-100 text-red-700 block mb-1 w-max">
                      TODAY
                    </span>
                  )}
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    {(() => {
                      try {
                        const [y, m, d] = group.date.split('-').map(Number);
                        const dateObj = new Date(y, m - 1, d);
                        return dateObj.toLocaleDateString('en-US', {
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

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                    {group.totalCount} {group.totalCount === 1 ? 'item' : 'items'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSchedule(null);
                      setTargetDate(group.date);
                      setIsModalOpen(true);
                    }}
                    title={`Create YouTube schedule on ${group.date}`}
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-lg leading-none transition shadow-sm cursor-pointer hover:scale-105 active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Cards List or Empty Placeholder */}
              {group.totalCount === 0 ? (
                <div className="py-12 text-center text-xs text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">
                  Drop YouTube deliverable here
                </div>
              ) : (
                <div className="space-y-3">
                  {group.items.map((item) => {
                    const theme = item.is_common
                      ? {
                          border: 'border-amber-200',
                          bg: 'bg-amber-50/20',
                          accent: 'bg-amber-500'
                        }
                      : getSubjectTheme(item.subject?.name);

                    const typeBadgeConfig =
                      item.schedule_type === 'Live'
                        ? { bg: 'bg-red-600 text-white', icon: '🔴' }
                        : item.schedule_type === 'Content Video'
                        ? { bg: 'bg-blue-600 text-white', icon: '🎬' }
                        : { bg: 'bg-amber-600 text-white', icon: '⚡' };

                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={() => setDraggedScheduleId(item.id)}
                        className="relative p-4.5 rounded-2xl border border-slate-200/90 bg-white space-y-3.5 shadow-xs overflow-hidden transition-all duration-200 hover:shadow-md cursor-grab active:cursor-grabbing group"
                      >
                        {/* Left vertical red accent line */}
                        <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-red-600 rounded-l-2xl" />

                        {/* Top Line: Time pill on left + LIVE / Type pill on right */}
                        <div className="flex items-center justify-between">
                          {item.start_time ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 text-xs font-bold text-slate-700 font-mono tracking-tight">
                              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="9" strokeWidth="2" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 7v5l3 2" />
                              </svg>
                              <span>{item.start_time}</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
                              <span>⚡</span>
                              <span>Anytime</span>
                            </div>
                          )}

                          {item.schedule_type === 'Live' ? (
                            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-red-600 text-white shadow-xs">
                              <span className="w-2 h-2 rounded-full bg-white" />
                              <span>LIVE</span>
                            </span>
                          ) : item.schedule_type === 'Content Video' ? (
                            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-600 text-white shadow-xs">
                              <span>🎬</span>
                              <span>CONTENT VIDEO</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-600 text-white shadow-xs">
                              <span>⚡</span>
                              <span>SHORTS</span>
                            </span>
                          )}
                        </div>

                        {/* Class Pill(s) */}
                        <div className="flex flex-wrap gap-1.5">
                          {item.classes && item.classes.length > 0 ? (
                            item.classes.map((cls) => (
                              <span
                                key={cls.id}
                                className="text-xs font-black px-3 py-1 rounded-lg bg-slate-900 text-white tracking-tight"
                              >
                                {cls.name}{cls.batch ? ` (${cls.batch})` : ''}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs font-black px-3 py-1 rounded-lg bg-slate-900 text-white tracking-tight">
                              General
                            </span>
                          )}
                        </div>

                        {/* Subject Badge */}
                        <div className="flex items-center gap-2">
                          {item.is_common ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <span>⭐</span>
                              <span>Common</span>
                            </span>
                          ) : item.subject?.name ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200/80">
                              <span>📚</span>
                              <span>{item.subject.name}</span>
                            </span>
                          ) : null}

                          {item.status && item.status !== 'scheduled' && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                item.status === 'completed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {item.status}
                            </span>
                          )}
                        </div>

                        {/* Assigned Faculty Pill with Divider */}
                        <div className="pt-2.5 border-t border-slate-100">
                          <div className="flex flex-wrap gap-1.5">
                            {item.faculties && item.faculties.length > 0 ? (
                              item.faculties.map((fac) => (
                                <span
                                  key={fac.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-[#f8fafc] border border-slate-200 text-slate-800 uppercase tracking-wide"
                                >
                                  <span>🧑‍🏫</span>
                                  <span>{fac.name}</span>
                                </span>
                              ))
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 text-slate-400 italic">
                                No faculty assigned
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Content / Chapter Details */}
                        {item.content && (
                          <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-slate-100 text-xs font-bold text-slate-800 leading-relaxed tracking-wide whitespace-pre-line">
                            {item.content}
                          </div>
                        )}

                        {/* Card Action Footer (Edit / Delete / Notes) */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                          <span className="text-[10px] text-slate-400 italic truncate max-w-[180px]">
                            {item.notes ? `Note: ${item.notes}` : ''}
                          </span>
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingSchedule(item);
                                setTargetDate(item.schedule_date);
                                setIsModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                              title="Edit YouTube schedule"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(item.id);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              title="Delete YouTube schedule"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* YouTube Schedule Modal */}
      <YouTubeScheduleModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSchedule(null);
        }}
        onSave={handleSave}
        initialData={editingSchedule}
        defaultDate={targetDate}
        classes={classes}
        subjects={subjects}
        facultyList={facultyList}
      />
    </div>
  );
};
