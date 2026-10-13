import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { ClassItem, Subject, Faculty, YouTubeSchedule, YouTubeScheduleType } from '../../types';

interface YouTubeScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
  initialData?: YouTubeSchedule | null;
  defaultDate?: string;
  classes: ClassItem[];
  subjects: Subject[];
  facultyList: Faculty[];
}

export const YouTubeScheduleModal: React.FC<YouTubeScheduleModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  defaultDate,
  classes,
  subjects,
  facultyList
}) => {
  const [scheduleDate, setScheduleDate] = useState(
    initialData?.schedule_date || defaultDate || new Date().toISOString().split('T')[0]
  );
  const [scheduleType, setScheduleType] = useState<YouTubeScheduleType>(
    initialData?.schedule_type || 'Live'
  );
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [isCommon, setIsCommon] = useState<boolean>(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedFacultyIds, setSelectedFacultyIds] = useState<number[]>([]);
  const [content, setContent] = useState('');
  const [status] = useState<string>(initialData?.status || 'scheduled');
  const [notes] = useState<string>(initialData?.notes || '');

  // Start time states (Optional)
  const [hasStartTime, setHasStartTime] = useState<boolean>(false);
  const [timeHour, setTimeHour] = useState<string>('06');
  const [timeMinute, setTimeMinute] = useState<string>('00');
  const [timePeriod, setTimePeriod] = useState<'AM' | 'PM'>('PM');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Helper to parse HH:mm 24-hr to 12-hr
  const parse24To12 = (val: string) => {
    if (!val || !val.includes(':')) {
      return { hour: '06', minute: '00', period: 'PM' as const };
    }
    const [hStr, mStr] = val.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr ? mStr.slice(0, 2) : '00';
    if (isNaN(h)) return { hour: '06', minute: '00', period: 'PM' as const };
    const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return {
      hour: String(h).padStart(2, '0'),
      minute: m.padStart(2, '0'),
      period
    };
  };

  // Helper to convert 12-hr to HH:mm 24-hr
  const format12To24 = (hStr: string, mStr: string, p: 'AM' | 'PM') => {
    let h = parseInt(hStr || '12', 10);
    const m = parseInt(mStr || '00', 10);
    if (isNaN(h)) h = 12;
    if (p === 'PM' && h < 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(isNaN(m) ? 0 : m).padStart(2, '0')}`;
  };

  // Sync state whenever modal opens or props change
  useEffect(() => {
    if (isOpen) {
      const initDate = initialData?.schedule_date || defaultDate || new Date().toISOString().split('T')[0];
      setScheduleDate(initDate);
      setScheduleType(initialData?.schedule_type || 'Live');
      setContent(initialData?.content || '');
      setErrorMsg(null);

      // Classes
      if (initialData?.classes && initialData.classes.length > 0) {
        setSelectedClassIds(initialData.classes.map((c) => c.id));
      } else if (classes.length > 0) {
        setSelectedClassIds([classes[0].id]);
      } else {
        setSelectedClassIds([]);
      }

      // Subject / Common
      const common = !!initialData?.is_common;
      setIsCommon(common);
      if (common) {
        setSelectedSubjectId('');
      } else if (initialData?.subject_id) {
        setSelectedSubjectId(String(initialData.subject_id));
      } else {
        setSelectedSubjectId(subjects[0]?.id ? String(subjects[0].id) : '');
      }

      // Faculties
      if (initialData?.faculties && initialData.faculties.length > 0) {
        setSelectedFacultyIds(initialData.faculties.map((f) => f.id));
      } else {
        setSelectedFacultyIds([]);
      }

      // Start Time
      if (initialData?.start_time) {
        setHasStartTime(true);
        const { hour, minute, period } = parse24To12(initialData.start_time);
        setTimeHour(hour);
        setTimeMinute(minute);
        setTimePeriod(period);
      } else {
        setHasStartTime(false);
        setTimeHour('06');
        setTimeMinute('00');
        setTimePeriod('PM');
      }
    }
  }, [isOpen, initialData, defaultDate, classes, subjects]);

  // Filter available faculty based on subject/common selection
  const availableFaculty = useMemo(() => {
    if (isCommon) {
      return facultyList.filter((f) => f.status === 'active');
    }
    if (selectedSubjectId) {
      return facultyList.filter(
        (f) => String(f.subject_id) === String(selectedSubjectId) && f.status === 'active'
      );
    }
    return [];
  }, [isCommon, selectedSubjectId, facultyList]);

  // Handle class checkbox toggle
  const toggleClass = (classId: number) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const handleSelectAllClasses = () => {
    if (selectedClassIds.length === classes.length) {
      setSelectedClassIds([]);
    } else {
      setSelectedClassIds(classes.map((c) => c.id));
    }
  };

  // Handle faculty toggle
  const toggleFaculty = (facId: number) => {
    setSelectedFacultyIds((prev) =>
      prev.includes(facId) ? prev.filter((id) => id !== facId) : [...prev, facId]
    );
  };

  // Handle Subject selection change
  const handleSubjectChange = (val: string) => {
    if (val === 'COMMON') {
      setIsCommon(true);
      setSelectedSubjectId('');
    } else {
      setIsCommon(false);
      setSelectedSubjectId(val);
      const matching = facultyList.filter((f) => String(f.subject_id) === val);
      if (matching.length === 1 && !initialData) {
        setSelectedFacultyIds([matching[0].id]);
      }
    }
  };

  // Toggle Common
  const handleToggleCommon = () => {
    if (isCommon) {
      setIsCommon(false);
      setSelectedSubjectId(subjects[0]?.id ? String(subjects[0].id) : '');
    } else {
      setIsCommon(true);
      setSelectedSubjectId('');
    }
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!scheduleDate) {
      setErrorMsg('Please select a schedule date.');
      return;
    }

    if (selectedClassIds.length === 0) {
      setErrorMsg('Please select at least one class.');
      return;
    }

    if (!isCommon && !selectedSubjectId) {
      setErrorMsg('Please select a Subject or choose "Common".');
      return;
    }

    if (selectedFacultyIds.length === 0) {
      setErrorMsg('Please select at least one faculty member.');
      return;
    }

    let calculatedStartTime: string | null = null;
    if (hasStartTime) {
      calculatedStartTime = format12To24(timeHour, timeMinute, timePeriod);
    }

    const payload = {
      schedule_date: scheduleDate,
      schedule_type: scheduleType,
      class_ids: selectedClassIds,
      faculty_ids: selectedFacultyIds,
      is_common: isCommon,
      subject_id: isCommon ? null : Number(selectedSubjectId),
      start_time: calculatedStartTime,
      content: content.trim() || null,
      status: status || 'scheduled',
      notes: notes.trim() || null
    };

    try {
      setIsSubmitting(true);
      await onSave(payload);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save YouTube schedule');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-100 my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Dark Navy Header matching design exactly */}
        <div className="px-6 py-4.5 flex items-center justify-between bg-[#0B1120] text-white">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-[#141b2d] border border-rose-500/35 flex items-center justify-center shadow-inner">
              <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-xs">
                <svg className="w-2.5 h-2.5 fill-white translate-x-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {initialData ? 'Edit YouTube Schedule' : 'Create New YouTube Schedule'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Targeted for assigned faculties only • Not visible to students or mentors
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Form Body matching screenshot exactly */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <span className="text-sm">⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Row 1: SCHEDULE DATE & YOUTUBE TYPE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* SCHEDULE DATE */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                SCHEDULE DATE <span className="text-red-500">*</span>
              </label>
              <div
                onClick={() => {
                  if (dateInputRef.current) {
                    if (typeof dateInputRef.current.showPicker === 'function') {
                      dateInputRef.current.showPicker();
                    } else {
                      dateInputRef.current.focus();
                    }
                  }
                }}
                className="relative flex items-center justify-between bg-white border border-slate-200 hover:border-slate-300 rounded-2xl px-4 py-2.5 shadow-2xs transition cursor-pointer focus-within:border-slate-800 focus-within:ring-2 focus-within:ring-slate-900/10"
              >
                <input
                  ref={dateInputRef}
                  type="date"
                  required
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="bg-transparent text-sm font-semibold text-slate-800 outline-none cursor-pointer flex-1"
                />
                <span className="text-base select-none pointer-events-none ml-2">📅</span>
              </div>
            </div>

            {/* YOUTUBE TYPE */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                YOUTUBE TYPE <span className="text-red-500">*</span>
              </label>
              <div className="bg-[#f1f5f9] p-1.5 rounded-2xl flex items-center gap-1 border border-slate-200/50">
                <button
                  type="button"
                  onClick={() => {
                    setScheduleType('Live');
                  }}
                  className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-2 text-xs transition cursor-pointer ${
                    scheduleType === 'Live'
                      ? 'bg-[#0B1120] text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 font-semibold'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                  <span>Live</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleType('Content Video')}
                  className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs transition cursor-pointer ${
                    scheduleType === 'Content Video'
                      ? 'bg-[#0B1120] text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 font-semibold'
                  }`}
                >
                  <span className="text-xs">🎬</span>
                  <span>Video</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleType('Shorts')}
                  className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs transition cursor-pointer ${
                    scheduleType === 'Shorts'
                      ? 'bg-[#0B1120] text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 font-semibold'
                  }`}
                >
                  <span className="text-amber-500 text-xs">⚡</span>
                  <span>Shorts</span>
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: TARGET CLASSES */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  TARGET CLASSES <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-slate-400 font-normal">(multiple selection)</span>
              </div>
              <button
                type="button"
                onClick={handleSelectAllClasses}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                {selectedClassIds.length === classes.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="border border-slate-200/90 rounded-2xl p-2.5 bg-white flex flex-wrap gap-2 shadow-2xs">
              {classes.map((cls) => {
                const isSelected = selectedClassIds.includes(cls.id);
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => toggleClass(cls.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-[#0B1120] text-white font-bold shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 font-semibold hover:bg-slate-50'
                    }`}
                  >
                    <span>{isSelected ? '✓' : '+'}</span>
                    <span>{cls.name}</span>
                    {cls.batch && (
                      <span
                        className={
                          isSelected
                            ? 'text-slate-300 text-[11px] font-normal'
                            : 'text-slate-400 text-[11px] font-normal'
                        }
                      >
                        ({cls.batch})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: SUBJECT SCOPE */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                SUBJECT SCOPE <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleToggleCommon}
                className={`rounded-xl border px-3.5 py-1 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                  isCommon
                    ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className={isCommon ? 'text-amber-500' : 'text-slate-500'}>
                  {isCommon ? '★' : '☆'}
                </span>
                <span>{isCommon ? 'Common Selected' : 'Select Common'}</span>
              </button>
            </div>

            <div className="relative">
              <select
                value={isCommon ? 'COMMON' : selectedSubjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition appearance-none cursor-pointer"
              >
                <option value="COMMON">⭐ Common (Open to all faculties & departments)</option>
                <optgroup label="Specific Subjects">
                  {subjects.map((sub) => (
                    <option key={sub.id} value={String(sub.id)}>
                      {sub.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-xs">
                ▼
              </div>
            </div>
          </div>

          {/* Row 4: ASSIGNED FACULTY */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  ASSIGNED FACULTY <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-slate-400 font-normal">(multiple selection)</span>
              </div>
              <span className="text-xs font-medium text-slate-500">
                {selectedFacultyIds.length} selected
              </span>
            </div>

            <div className="border border-slate-200/90 rounded-2xl p-2.5 bg-[#f8fafc]/50 min-h-[68px] flex flex-wrap gap-2.5 items-center">
              {availableFaculty.length === 0 ? (
                <div className="p-3 text-xs text-slate-400 text-center w-full">
                  No active faculty members found for this selection.
                </div>
              ) : (
                availableFaculty.map((fac) => {
                  const isSelected = selectedFacultyIds.includes(fac.id);
                  return (
                    <div
                      key={fac.id}
                      onClick={() => toggleFaculty(fac.id)}
                      className={`px-4 py-2.5 rounded-xl border transition flex items-center justify-between w-56 cursor-pointer select-none shadow-2xs ${
                        isSelected
                          ? 'bg-white border-slate-800 ring-1 ring-slate-800/10'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-xs font-bold text-slate-800">{fac.name}</span>
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-[#0B1120] border-[#0B1120] text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 fill-current" viewBox="0 0 12 12">
                            <path d="M10.28 2.28a.75.75 0 0 1 0 1.06l-5.5 5.5a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 0 1 1.06-1.06L4.25 7.19l4.97-4.91a.75.75 0 0 1 1.06 0z" />
                          </svg>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Row 5: START TIME (optional) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  START TIME
                </label>
                <span className="text-xs text-slate-400 font-normal">(optional)</span>
              </div>
              <button
                type="button"
                onClick={() => setHasStartTime(!hasStartTime)}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs flex items-center gap-1 cursor-pointer transition"
              >
                {hasStartTime ? '✕ Remove Start Time' : '+ Add Start Time'}
              </button>
            </div>

            {hasStartTime && (
              <div className="flex items-center gap-2 p-3 bg-slate-50/70 border border-slate-200/80 rounded-2xl">
                {/* Hour */}
                <select
                  value={timeHour}
                  onChange={(e) => setTimeHour(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800"
                >
                  {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span className="text-slate-400 font-bold">:</span>
                {/* Minute */}
                <select
                  value={timeMinute}
                  onChange={(e) => setTimeMinute(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800"
                >
                  {['00', '15', '30', '45'].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {/* AM / PM */}
                <div className="inline-flex rounded-xl bg-slate-200/70 p-1 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setTimePeriod('AM')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                      timePeriod === 'AM'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimePeriod('PM')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                      timePeriod === 'PM'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    PM
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Row 6: CONTENT / CHAPTER DETAILS */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              CONTENT / CHAPTER DETAILS
            </label>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. Chapter 4: Quadratic Equations revision with PYQ practice..."
              className="w-full bg-white border border-slate-200 rounded-2xl p-3.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition shadow-2xs resize-none"
            />
          </div>
        </form>

        {/* Footer matching screenshot exactly */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl bg-[#0B1120] hover:bg-[#1E293B] text-white text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Create YouTube Schedule</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
