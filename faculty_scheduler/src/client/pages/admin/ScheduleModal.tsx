import React, { useState } from 'react';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
  initialData?: any;
  defaultDate?: string;
  classes: any[];
  subjects: any[];
  facultyList: any[];
}

const SCHEDULE_TYPES = [
  'SESSION 1',
  'SESSION 2',
  'PREDICTION LIVE',
  'MODEL EXAM',
  'MODEL QUESTION PAPER DISCUSSION'
];

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
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
  const [classId, setClassId] = useState<string>(
    initialData?.class_id ? String(initialData.class_id) : classes[0]?.id ? String(classes[0].id) : ''
  );
  const [subjectId, setSubjectId] = useState<string>(
    initialData?.subject_id ? String(initialData.subject_id) : subjects[0]?.id ? String(subjects[0].id) : ''
  );
  const [facultyId, setFacultyId] = useState<string>(
    initialData?.faculty_id ? String(initialData.faculty_id) : ''
  );
  const [scheduleType, setScheduleType] = useState(initialData?.schedule_type || SCHEDULE_TYPES[0]);
  const [content, setContent] = useState(initialData?.content || '');
  const [startTime, setStartTime] = useState(initialData?.start_time || '');
  const [timeHour, setTimeHour] = useState<string>('');
  const [timeMinute, setTimeMinute] = useState<string>('');
  const [timePeriod, setTimePeriod] = useState<'AM' | 'PM'>('AM');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dateInputRef = React.useRef<HTMLInputElement>(null);

  // Helper to parse HH:mm (24-hr) into 12-hr hour, minute, period
  const parse24To12 = (val: string) => {
    if (!val || !val.includes(':')) {
      return { hour: '', minute: '', period: 'AM' as const };
    }
    const [hStr, mStr] = val.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr ? mStr.slice(0, 2) : '00';
    if (isNaN(h)) return { hour: '', minute: '', period: 'AM' as const };
    const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return {
      hour: String(h).padStart(2, '0'),
      minute: m.padStart(2, '0'),
      period
    };
  };

  // Helper to convert 12-hr hour, minute, period to HH:mm (24-hr)
  const format12To24 = (hStr: string, mStr: string, p: 'AM' | 'PM') => {
    if (!hStr && !mStr) return '';
    let h = parseInt(hStr || '12', 10);
    const m = parseInt(mStr || '00', 10);
    if (isNaN(h)) h = 12;
    if (p === 'PM' && h < 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(isNaN(m) ? 0 : m).padStart(2, '0')}`;
  };

  // Sync state whenever modal opens or props change
  React.useEffect(() => {
    if (isOpen) {
      const initDate = initialData?.schedule_date || defaultDate || new Date().toISOString().split('T')[0];
      const initClassId = initialData?.class_id ? String(initialData.class_id) : classes[0]?.id ? String(classes[0].id) : '';
      const initSubjectId = initialData?.subject_id ? String(initialData.subject_id) : subjects[0]?.id ? String(subjects[0].id) : '';

      setScheduleDate(initDate);
      setClassId(initClassId);
      setSubjectId(initSubjectId);

      // Auto-select first faculty of the subject if not editing
      if (initialData?.faculty_id) {
        setFacultyId(String(initialData.faculty_id));
      } else if (initSubjectId) {
        const matching = facultyList.filter(
          (f) => String(f.subject_id) === String(initSubjectId) && f.status === 'active'
        );
        setFacultyId(matching.length > 0 ? String(matching[0].id) : '');
      } else {
        setFacultyId('');
      }

      setScheduleType(initialData?.schedule_type || SCHEDULE_TYPES[0]);
      setContent(initialData?.content || '');
      const rawTime = initialData?.start_time || '';
      setStartTime(rawTime);
      const parsed = parse24To12(rawTime);
      setTimeHour(parsed.hour);
      setTimeMinute(parsed.minute);
      setTimePeriod(parsed.period);
      setErrorMsg(null);
    }
  }, [isOpen, initialData, defaultDate, classes, subjects, facultyList]);

  // Filter faculty by selected subject
  const availableFaculty = facultyList.filter(
    (f) => String(f.subject_id) === String(subjectId) && f.status === 'active'
  );

  const handleSubjectChange = (newSubjectId: string) => {
    setSubjectId(newSubjectId);
    // Auto-select first faculty of this newly selected subject
    const matching = facultyList.filter(
      (f) => String(f.subject_id) === String(newSubjectId) && f.status === 'active'
    );
    setFacultyId(matching.length > 0 ? String(matching[0].id) : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!scheduleDate || !classId || !subjectId || !facultyId) {
      setErrorMsg('Please fill in Date, Class, Subject, and Faculty.');
      return;
    }

    // Compute formatted 24h start_time if hour is selected
    const finalStartTime = timeHour ? format12To24(timeHour, timeMinute, timePeriod) : '';

    try {
      setIsSubmitting(true);
      await onSave({
        schedule_date: scheduleDate,
        class_id: Number(classId),
        subject_id: Number(subjectId),
        faculty_id: Number(facultyId),
        schedule_type: scheduleType,
        content: content.trim() || null,
        start_time: finalStartTime,
        end_time: null,
        status: initialData?.status || 'scheduled',
        notes: null
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save schedule');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 sm:p-6 space-y-3.5 my-auto border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              {initialData ? 'Edit Schedule' : 'Create New Schedule'}
            </h3>
            <p className="text-[11px] text-slate-400">Quick and easy schedule creation</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-lg leading-none transition"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {/* Date & Class side-by-side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Date *</label>
              <div
                onClick={() => {
                  try {
                    dateInputRef.current?.showPicker?.();
                  } catch (e) {
                    dateInputRef.current?.focus();
                  }
                }}
                className="relative flex items-center w-full px-3 py-2 border border-slate-300 rounded-xl bg-white focus-within:ring-2 focus-within:ring-slate-900 focus-within:border-transparent cursor-pointer transition"
              >
                <span className="font-medium text-slate-800 flex-1 select-none">
                  {(() => {
                    if (!scheduleDate) return <span className="text-slate-400">DD/MM/YYYY</span>;
                    const parts = scheduleDate.split('-');
                    if (parts.length === 3) {
                      const [y, m, d] = parts;
                      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
                    }
                    return scheduleDate;
                  })()}
                </span>
                <span className="text-slate-400 text-sm ml-2 select-none">📅</span>
                <input
                  ref={dateInputRef}
                  type="date"
                  required
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer pointer-events-auto"
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Class *</label>
              <select
                required
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
              >
                <option value="" disabled>Select Class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.batch ? `(${c.batch})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Subject with Auto-Faculty selection */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Subject *</label>
            <select
              required
              value={subjectId}
              onChange={(e) => handleSubjectChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
            >
              <option value="" disabled>Select Subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Faculty (Auto-selected to first faculty, changeable) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">Faculty *</label>
              {availableFaculty.length > 0 && (
                <span className="text-[10px] text-emerald-600 font-medium">✓ Auto-selected</span>
              )}
            </div>
            <select
              required
              value={facultyId}
              onChange={(e) => setFacultyId(e.target.value)}
              disabled={!subjectId || availableFaculty.length === 0}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
            >
              {availableFaculty.length === 0 ? (
                <option value="">-- No faculty under this subject --</option>
              ) : (
                availableFaculty.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Schedule Type */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Schedule Type *</label>
            <select
              required
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
            >
              {SCHEDULE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Content / Chapter Details */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Content / Chapter Details</label>
            <input
              type="text"
              placeholder="e.g. Chapter 4: Genetics & Cell Division"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          {/* Start Time (Hour, Minute, AM/PM) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-slate-700">Start Time</label>
              <div className="flex items-center gap-2">
                {timeHour && (
                  <button
                    type="button"
                    onClick={() => {
                      setTimeHour('');
                      setTimeMinute('');
                      setTimePeriod('AM');
                    }}
                    className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold hover:underline"
                  >
                    Clear time
                  </button>
                )}
                <span className="text-[10px] text-slate-400">(Optional)</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Hour Dropdown / Input */}
              <div className="flex-1 relative">
                <select
                  value={timeHour}
                  onChange={(e) => {
                    const newHour = e.target.value;
                    setTimeHour(newHour);
                    if (newHour && !timeMinute) {
                      setTimeMinute('00');
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-800"
                >
                  <option value="">Hour</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => {
                    const val = String(h).padStart(2, '0');
                    return (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    );
                  })}
                </select>
              </div>

              <span className="text-slate-400 font-bold text-base">:</span>

              {/* Minute Dropdown / Input */}
              <div className="flex-1 relative">
                <select
                  value={timeMinute}
                  disabled={!timeHour}
                  onChange={(e) => setTimeMinute(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">Minute</option>
                  {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => {
                    const val = String(m).padStart(2, '0');
                    return (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* AM / PM Segmented Control */}
              <div className="flex items-center rounded-xl bg-slate-100 p-0.5 border border-slate-200">
                <button
                  type="button"
                  disabled={!timeHour}
                  onClick={() => setTimePeriod('AM')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                    timePeriod === 'AM' && timeHour
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  } disabled:opacity-40`}
                >
                  AM
                </button>
                <button
                  type="button"
                  disabled={!timeHour}
                  onClick={() => setTimePeriod('PM')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                    timePeriod === 'PM' && timeHour
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  } disabled:opacity-40`}
                >
                  PM
                </button>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 rounded-xl hover:bg-slate-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition disabled:opacity-50 shadow-sm"
            >
              {isSubmitting ? 'Saving...' : initialData ? 'Save Changes' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
