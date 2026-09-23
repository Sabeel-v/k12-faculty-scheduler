import React, { useState, useEffect, useMemo } from 'react';
import { api, getAdminToken, setAdminToken, removeAdminToken } from '../../lib/api';
import type { Subject, Faculty, ClassItem, Schedule } from '../../types';
import { ScheduleModal } from './ScheduleModal';
import { SubjectFacultySection } from './SubjectFacultySection';
import { ClassesSection } from './ClassesSection';
import { getSubjectTheme } from '../../lib/subjectColors';

export const AdminPage: React.FC = () => {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getAdminToken());
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Active Admin Sub-tab
  const [activeTab, setActiveTab] = useState<'schedules' | 'subjects_faculty' | 'classes'>('schedules');

  // Schedule View Mode
  const [scheduleViewMode, setScheduleViewMode] = useState<'date' | 'subject' | 'class' | 'faculty'>('date');
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState('');

  // Master Data
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [facultyList, setFacultyList] = useState<Faculty[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [alertBanner, setAlertBanner] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Schedule Modal
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [targetScheduleDate, setTargetScheduleDate] = useState<string | undefined>(undefined);

  // Drag & drop state for Date-wise schedule view
  const [draggedScheduleId, setDraggedScheduleId] = useState<number | null>(null);
  // Date-wise schedule view state: toggle to show previous/past date schedules
  const [showPreviousDates, setShowPreviousDates] = useState(false);

  // Auto-scroll when dragging near top/bottom of the viewport
  useEffect(() => {
    if (!draggedScheduleId) return;

    let animationFrameId: number | null = null;
    let scrollSpeed = 0;

    const handleDragOver = (e: DragEvent) => {
      const edgeThreshold = 100; // px from top or bottom of viewport
      const y = e.clientY;
      const windowHeight = window.innerHeight;

      if (y < edgeThreshold) {
        // Near top of screen: scroll up (faster the closer to the edge)
        scrollSpeed = -Math.round(((edgeThreshold - y) / edgeThreshold) * 16);
      } else if (y > windowHeight - edgeThreshold) {
        // Near bottom of screen: scroll down (faster the closer to the edge)
        scrollSpeed = Math.round(((y - (windowHeight - edgeThreshold)) / edgeThreshold) * 16);
      } else {
        scrollSpeed = 0;
      }

      if (scrollSpeed !== 0 && !animationFrameId) {
        const step = () => {
          if (scrollSpeed !== 0) {
            window.scrollBy(0, scrollSpeed);
            animationFrameId = requestAnimationFrame(step);
          } else {
            animationFrameId = null;
          }
        };
        animationFrameId = requestAnimationFrame(step);
      }
    };

    const handleDragEnd = () => {
      scrollSpeed = 0;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragend', handleDragEnd);
    window.addEventListener('drop', handleDragEnd);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragend', handleDragEnd);
      window.removeEventListener('drop', handleDragEnd);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [draggedScheduleId]);

  // Load all admin data
  const refreshAllData = async () => {
    try {
      setLoading(true);
      const [schData, subData, facData, clsData] = await Promise.all([
        api.getSchedules(),
        api.getSubjects(),
        api.getFaculty(),
        api.getClasses()
      ]);
      setSchedules(schData);
      setSubjects(subData);
      setFacultyList(facData);
      setClasses(clsData);
    } catch (err: any) {
      if (err.status === 401) {
        removeAdminToken();
        setIsAuthenticated(false);
      } else {
        setAlertBanner({ type: 'error', message: err.message || 'Failed to load admin data' });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      refreshAllData();
    }
  }, [isAuthenticated]);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!loginPassword) return;

    try {
      setIsLoggingIn(true);
      const res = await api.adminLogin(loginPassword);
      if (res.token) {
        setAdminToken(res.token);
        setIsAuthenticated(true);
        setLoginPassword('');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Invalid admin password');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Schedule Actions
  const handleSaveSchedule = async (payload: any) => {
    const targetDate = payload.schedule_date;
    const todayStr = new Date().toISOString().split('T')[0];

    // If schedule is created for a past date, automatically show previous dates
    if (targetDate && targetDate < todayStr && !showPreviousDates) {
      setShowPreviousDates(true);
    }

    if (editingSchedule) {
      await api.updateSchedule(editingSchedule.id, payload);
      setAlertBanner({ type: 'success', message: 'Schedule updated successfully' });
    } else {
      await api.createSchedule(payload);
      setAlertBanner({ type: 'success', message: 'Schedule created successfully' });
    }
    await refreshAllData();

    // Scroll smoothly to the date card of the created/edited schedule
    if (targetDate) {
      setTimeout(() => {
        const el = document.getElementById(`schedule-date-card-${targetDate}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-4', 'ring-blue-500/40');
          setTimeout(() => {
            el.classList.remove('ring-4', 'ring-blue-500/40');
          }, 2000);
        }
      }, 150);
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    try {
      await api.deleteSchedule(id);
      setAlertBanner({ type: 'success', message: 'Schedule deleted' });
      await refreshAllData();
    } catch (err: any) {
      setAlertBanner({ type: 'error', message: err.message || 'Failed to delete schedule' });
    }
  };

  // Drag & drop drop handler on Date group
  const handleDropOnDate = async (targetDate: string) => {
    if (!draggedScheduleId) return;
    try {
      await api.updateScheduleDate(draggedScheduleId, targetDate);
      setAlertBanner({ type: 'success', message: `Schedule moved to ${targetDate}` });
      await refreshAllData();
    } catch (err: any) {
      setAlertBanner({ type: 'error', message: err.message || 'Cannot move schedule to this date (Conflict)' });
    } finally {
      setDraggedScheduleId(null);
    }
  };

  // Subjects & Faculty Handlers
  const handleAddSubject = async (payload: { name: string; display_order?: number }) => {
    await api.createSubject(payload);
    await refreshAllData();
  };
  const handleUpdateSubject = async (id: number, payload: Partial<Subject>) => {
    await api.updateSubject(id, payload);
    await refreshAllData();
  };
  const handleDeleteSubject = async (id: number) => {
    await api.deleteSubject(id);
    await refreshAllData();
  };
  const handleAddFaculty = async (payload: any) => {
    await api.createFaculty(payload);
    await refreshAllData();
  };
  const handleUpdateFaculty = async (id: number, payload: any) => {
    await api.updateFaculty(id, payload);
    await refreshAllData();
  };
  const handleDeleteFaculty = async (id: number) => {
    const res = await api.deleteFaculty(id);
    if (res.soft_deleted) {
      setAlertBanner({ type: 'success', message: res.message });
    }
    await refreshAllData();
  };

  // Classes Handlers
  const handleAddClass = async (payload: any) => {
    await api.createClass(payload);
    await refreshAllData();
  };
  const handleUpdateClass = async (id: number, payload: any) => {
    await api.updateClass(id, payload);
    await refreshAllData();
  };
  const handleDeleteClass = async (id: number) => {
    await api.deleteClass(id);
    await refreshAllData();
  };

  // Helper to trigger browser CSV download
  const downloadCSV = (filename: string, rows: (string | number | null | undefined)[][]) => {
    const csvContent = rows
      .map((row) =>
        row
          .map((cell) => {
            const str = cell === null || cell === undefined ? '' : String(cell);
            // Escape double quotes
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(',')
      )
      .join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadSubjectCSV = (subjectName: string, subjectId: number) => {
    const items = schedules
      .filter((s) => s.subject_id === subjectId)
      .sort((a, b) => {
        const dDiff = (a.schedule_date || '').localeCompare(b.schedule_date || '');
        if (dDiff !== 0) return dDiff;
        return (a.start_time || '').localeCompare(b.start_time || '');
      });

    const headers = ['Date', 'Start Time', 'Class', 'Batch', 'Faculty', 'Session Type', 'Content / Topic'];
    const rows = items.map((s) => [
      s.schedule_date,
      s.start_time || '',
      s.class?.name || 'General',
      s.class?.batch || '',
      s.faculty?.name || 'Unassigned',
      s.schedule_type || '',
      s.content || ''
    ]);

    const sanitizedName = subjectName.toLowerCase().replace(/[^a-z0-9]/gi, '_');
    downloadCSV(`${sanitizedName}_schedules.csv`, [headers, ...rows]);
  };

  const downloadClassCSV = (className: string, batch: string | null | undefined, classId: number) => {
    const items = schedules
      .filter((s) => s.class_id === classId)
      .sort((a, b) => {
        const dDiff = (a.schedule_date || '').localeCompare(b.schedule_date || '');
        if (dDiff !== 0) return dDiff;
        return (a.start_time || '').localeCompare(b.start_time || '');
      });

    const headers = ['Date', 'Start Time', 'Subject', 'Faculty', 'Session Type', 'Content / Topic'];
    const rows = items.map((s) => [
      s.schedule_date,
      s.start_time || '',
      s.subject?.name || 'Unassigned',
      s.faculty?.name || 'Unassigned',
      s.schedule_type || '',
      s.content || ''
    ]);

    const fullName = `${className}${batch ? `_${batch}` : ''}`.toLowerCase().replace(/[^a-z0-9]/gi, '_');
    downloadCSV(`${fullName}_schedules.csv`, [headers, ...rows]);
  };

  const downloadFacultyCSV = (facultyName: string, facultyId: number) => {
    const items = schedules
      .filter((s) => s.faculty_id === facultyId)
      .sort((a, b) => {
        const dDiff = (a.schedule_date || '').localeCompare(b.schedule_date || '');
        if (dDiff !== 0) return dDiff;
        return (a.start_time || '').localeCompare(b.start_time || '');
      });

    const headers = ['Date', 'Start Time', 'Class', 'Batch', 'Subject', 'Session Type', 'Content / Topic'];
    const rows = items.map((s) => [
      s.schedule_date,
      s.start_time || '',
      s.class?.name || 'General',
      s.class?.batch || '',
      s.subject?.name || 'Unassigned',
      s.schedule_type || '',
      s.content || ''
    ]);

    const sanitizedName = facultyName.toLowerCase().replace(/[^a-z0-9]/gi, '_');
    downloadCSV(`${sanitizedName}_schedules.csv`, [headers, ...rows]);
  };

  const downloadDateCSV = (targetDate: string) => {
    const items = schedules
      .filter((s) => s.schedule_date === targetDate)
      .sort((a, b) => {
        const wA = getClassWeight(a.class?.name);
        const wB = getClassWeight(b.class?.name);
        if (wA !== wB) return wA - wB;
        return (a.start_time || '').localeCompare(b.start_time || '');
      });

    const headers = ['Date', 'Start Time', 'Class', 'Batch', 'Subject', 'Faculty', 'Session Type', 'Content / Topic'];
    const rows = items.map((s) => [
      s.schedule_date,
      s.start_time || '',
      s.class?.name || 'General',
      s.class?.batch || '',
      s.subject?.name || 'Unassigned',
      s.faculty?.name || 'Unassigned',
      s.schedule_type || '',
      s.content || ''
    ]);

    downloadCSV(`schedules_${targetDate}.csv`, [headers, ...rows]);
  };

  const downloadAllSchedulesCSV = () => {
    const todayStr = new Date().toISOString().split('T')[0];

    // If showPreviousDates is true, download entire schedule;
    // otherwise download schedule from today onwards.
    const filtered = showPreviousDates
      ? schedules
      : schedules.filter((s) => !s.schedule_date || s.schedule_date >= todayStr);

    const items = [...filtered].sort((a, b) => {
      const dDiff = (a.schedule_date || '').localeCompare(b.schedule_date || '');
      if (dDiff !== 0) return dDiff;
      const wA = getClassWeight(a.class?.name);
      const wB = getClassWeight(b.class?.name);
      if (wA !== wB) return wA - wB;
      return (a.start_time || '').localeCompare(b.start_time || '');
    });

    const headers = ['Date', 'Start Time', 'Class', 'Batch', 'Subject', 'Faculty', 'Session Type', 'Content / Topic'];
    const rows = items.map((s) => [
      s.schedule_date,
      s.start_time || '',
      s.class?.name || 'General',
      s.class?.batch || '',
      s.subject?.name || 'Unassigned',
      s.faculty?.name || 'Unassigned',
      s.schedule_type || '',
      s.content || ''
    ]);

    const filename = showPreviousDates
      ? `entire_schedule_${todayStr}.csv`
      : `schedule_from_today_${todayStr}.csv`;

    downloadCSV(filename, [headers, ...rows]);
  };

  // Canonical class sorting weight: SSLC (1), Class 9 (2), Class 8 (3), etc.
  const getClassWeight = (className?: string) => {
    if (!className) return 999;
    const lower = className.toLowerCase();
    if (lower.includes('sslc')) return 1;
    if (lower.includes('9') || lower.includes('nine')) return 2;
    if (lower.includes('8') || lower.includes('eight')) return 3;
    if (lower.includes('10') || lower.includes('ten')) return 4;
    return 100;
  };

  // Grouping for Date-wise Schedule View (organized by date -> class groups with canonical ordering)
  const dateWiseGroups = useMemo(() => {
    const map: Record<string, Schedule[]> = {};

    // Ensure today and upcoming 4 days exist for easy drag-and-drop targets
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    for (let i = 0; i < 5; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const str = d.toISOString().split('T')[0];
      map[str] = [];
    }

    for (const item of schedules) {
      if (!map[item.schedule_date]) {
        map[item.schedule_date] = [];
      }
      map[item.schedule_date].push(item);
    }

    // Check if there are past dates with schedules
    const hasPast = Object.keys(map).some((date) => date < todayStr && map[date].length > 0);

    // If showPreviousDates is true, include past dates that have schedules;
    // otherwise only include dates starting from today so Today is the 1st card.
    const sortedDates = Object.keys(map)
      .filter((date) => {
        if (showPreviousDates) {
          // Include past dates with schedules, plus all today/future dates
          return date >= todayStr || map[date].length > 0;
        }
        return date >= todayStr;
      })
      .sort();

    const groups = sortedDates.map((date) => {
      const daySchedules = map[date];
      
      // Group by Class
      const classMap: Record<string, { label: string; classObj: any; weight: number; items: Schedule[] }> = {};

      for (const item of daySchedules) {
        const classKey = item.class_id ? `class_${item.class_id}` : 'unassigned';
        const label = item.class ? `${item.class.name}${item.class.batch ? ` (${item.class.batch})` : ''}` : 'General';
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

      // Sort classes: SSLC first (weight 1), Class 9 (weight 2), Class 8 (weight 3), etc.
      const sortedClasses = Object.values(classMap).sort((a, b) => {
        if (a.weight !== b.weight) return a.weight - b.weight;
        return a.label.localeCompare(b.label);
      });

      // Sort items within each class by start_time
      sortedClasses.forEach((c) => {
        c.items.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
      });

      return {
        date,
        totalCount: daySchedules.length,
        classGroups: sortedClasses
      };
    });

    return {
      hasPastSchedules: hasPast,
      groups
    };
  }, [schedules, showPreviousDates]);

  // Structured Hierarchy for Subject-wise View:
  // SUBJECT -> DATE -> CLASS -> SCHEDULES (chronologically sorted)
  const subjectWiseHierarchy = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Sorted active classes canonical ordering: SSLC, Class 9, Class 8, then others
    const sortedClasses = [...classes].sort((a, b) => {
      const wA = getClassWeight(a.name);
      const wB = getClassWeight(b.name);
      if (wA !== wB) return wA - wB;
      return a.name.localeCompare(b.name);
    });

    const q = scheduleSearchQuery.trim().toLowerCase();
    const filteredSubjects = q
      ? subjects.filter((subj) => subj.name.toLowerCase().includes(q))
      : subjects;

    return filteredSubjects.map((subj) => {
      const subjSchedules = schedules.filter((s) => s.subject_id === subj.id);

      // Collect all future/today dates that have schedules for this subject
      const scheduleDatesSet = new Set<string>();
      subjSchedules.forEach((s) => {
        if (s.schedule_date && s.schedule_date >= todayStr) {
          scheduleDatesSet.add(s.schedule_date);
        }
      });

      // Always include Today
      scheduleDatesSet.add(todayStr);

      // Ensure at least 3 columns are available starting from today (e.g., today, tomorrow, day after)
      for (let i = 1; scheduleDatesSet.size < 3 && i < 14; i++) {
        const nextD = new Date(now);
        nextD.setDate(nextD.getDate() + i);
        scheduleDatesSet.add(nextD.toISOString().split('T')[0]);
      }

      const datesToDisplay = Array.from(scheduleDatesSet).sort();

      // Build each date column with its ordered classes
      const dateColumns = datesToDisplay.map((dateStr) => {
        const isToday = dateStr === todayStr;
        const isTomorrow = dateStr === tomorrowStr;

        let dateLabel = '';
        let subLabel = '';
        try {
          const [y, m, d] = dateStr.split('-').map(Number);
          const dateObj = new Date(y, m - 1, d);
          const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
          const month = dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
          const day = String(d).padStart(2, '0');
          const year = dateObj.getFullYear();

          if (isToday) {
            dateLabel = 'TODAY';
            subLabel = `${weekday}, ${month} ${day}, ${year}`;
          } else if (isTomorrow) {
            dateLabel = 'TOMORROW';
            subLabel = `${weekday}, ${month} ${day}, ${year}`;
          } else {
            dateLabel = `${weekday}, ${month} ${day}`;
            subLabel = `${year}`;
          }
        } catch {
          dateLabel = dateStr;
          subLabel = '';
        }

        const dateSchedules = subjSchedules.filter((s) => s.schedule_date === dateStr);

        // ONLY include classes that actually have schedules on this date
        const classRows = sortedClasses
          .map((cls) => {
            const classSchedules = dateSchedules
              .filter((s) => s.class_id === cls.id)
              .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

            return {
              cls,
              schedules: classSchedules
            };
          })
          .filter((row) => row.schedules.length > 0);

        return {
          dateStr,
          isToday,
          isTomorrow,
          dateLabel,
          subLabel,
          classRows,
          totalSchedules: dateSchedules.length
        };
      });

      return {
        subject: subj,
        totalSchedules: subjSchedules.length,
        dateColumns
      };
    });
  }, [subjects, schedules, classes, scheduleSearchQuery]);

  // Grouping for Horizontal Class-wise Timetable View:
  // ONLY SCHEDULED DATES (ASCENDING) -> SCHEDULES (SORTED CHRONOLOGICALLY)
  const classWiseTimetable = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Canonical sorted classes: SSLC (1), Class 9 (2), Class 8 (3), etc.
    let sortedClasses = [...classes].sort((a, b) => {
      const wA = getClassWeight(a.name);
      const wB = getClassWeight(b.name);
      if (wA !== wB) return wA - wB;
      return a.name.localeCompare(b.name);
    });

    const q = scheduleSearchQuery.trim().toLowerCase();
    if (q) {
      sortedClasses = sortedClasses.filter((cls) =>
        `${cls.name} ${cls.batch || ''}`.toLowerCase().includes(q)
      );
    }

    const formatCol = (dateStr: string) => {
      const isToday = dateStr === todayStr;
      const isTomorrow = dateStr === tomorrowStr;

      let dateLabel = '';
      let subLabel = '';
      try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
        const month = dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
        const day = String(d).padStart(2, '0');

        if (isToday) {
          dateLabel = 'TODAY';
          subLabel = `${weekday}, ${month} ${day}`;
        } else if (isTomorrow) {
          dateLabel = 'TOMORROW';
          subLabel = `${weekday}, ${month} ${day}`;
        } else {
          dateLabel = `${weekday}, ${month} ${day}`;
          subLabel = '';
        }
      } catch {
        dateLabel = dateStr;
      }

      return {
        dateStr,
        isToday,
        isTomorrow,
        dateLabel,
        subLabel
      };
    };

    const rows = sortedClasses.map((cls) => {
      const classSchedules = schedules.filter((s) => s.class_id === cls.id);

      // Collect all future/today dates that have schedules for this class
      const classDatesSet = new Set<string>();
      classSchedules.forEach((s) => {
        if (s.schedule_date && s.schedule_date >= todayStr) {
          classDatesSet.add(s.schedule_date);
        }
      });

      // Always include Today
      classDatesSet.add(todayStr);

      // Ensure at least 3 columns are available starting from today (today, tomorrow, day after)
      for (let i = 1; classDatesSet.size < 3 && i < 14; i++) {
        const nextD = new Date(now);
        nextD.setDate(nextD.getDate() + i);
        classDatesSet.add(nextD.toISOString().split('T')[0]);
      }

      const datesToDisplay = Array.from(classDatesSet).sort();

      const slots = datesToDisplay.map((dateStr) => {
        const col = formatCol(dateStr);
        const dateSchedules = classSchedules
          .filter((s) => s.schedule_date === dateStr)
          .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

        return {
          col,
          schedules: dateSchedules
        };
      });

      return {
        cls,
        totalSchedules: classSchedules.filter((s) => s.schedule_date >= todayStr).length,
        slots
      };
    });

    return {
      rows
    };
  }, [classes, schedules, scheduleSearchQuery]);

  // Grouping for Horizontal Faculty-wise Timetable View:
  // FACULTY -> ONLY SCHEDULED DATES (ASCENDING) -> SCHEDULES (SORTED CHRONOLOGICALLY)
  const facultyWiseTimetable = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    let sortedFaculty = [...facultyList].sort((a, b) => {
      const ordA = a.display_order ?? 999;
      const ordB = b.display_order ?? 999;
      if (ordA !== ordB) return ordA - ordB;
      return a.name.localeCompare(b.name);
    });

    const q = scheduleSearchQuery.trim().toLowerCase();
    if (q) {
      sortedFaculty = sortedFaculty.filter((fac) =>
        `${fac.name} ${fac.department || ''}`.toLowerCase().includes(q)
      );
    }

    const formatCol = (dateStr: string) => {
      const isToday = dateStr === todayStr;
      const isTomorrow = dateStr === tomorrowStr;

      let dateLabel = '';
      let subLabel = '';
      try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
        const month = dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
        const day = String(d).padStart(2, '0');

        if (isToday) {
          dateLabel = 'TODAY';
          subLabel = `${weekday}, ${month} ${day}`;
        } else if (isTomorrow) {
          dateLabel = 'TOMORROW';
          subLabel = `${weekday}, ${month} ${day}`;
        } else {
          dateLabel = `${weekday}, ${month} ${day}`;
          subLabel = '';
        }
      } catch {
        dateLabel = dateStr;
      }

      return {
        dateStr,
        isToday,
        isTomorrow,
        dateLabel,
        subLabel
      };
    };

    const rows = sortedFaculty.map((fac) => {
      const facSchedules = schedules.filter((s) => s.faculty_id === fac.id);

      // Collect all future/today dates that have schedules for this faculty
      const facDatesSet = new Set<string>();
      facSchedules.forEach((s) => {
        if (s.schedule_date && s.schedule_date >= todayStr) {
          facDatesSet.add(s.schedule_date);
        }
      });

      // Always include Today
      facDatesSet.add(todayStr);

      // Ensure at least 3 columns are available starting from today (today, tomorrow, day after)
      for (let i = 1; facDatesSet.size < 3 && i < 14; i++) {
        const nextD = new Date(now);
        nextD.setDate(nextD.getDate() + i);
        facDatesSet.add(nextD.toISOString().split('T')[0]);
      }

      const datesToDisplay = Array.from(facDatesSet).sort();

      const slots = datesToDisplay.map((dateStr) => {
        const col = formatCol(dateStr);
        const dateSchedules = facSchedules
          .filter((s) => s.schedule_date === dateStr)
          .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

        return {
          col,
          schedules: dateSchedules
        };
      });

      return {
        faculty: fac,
        totalSchedules: facSchedules.filter((s) => s.schedule_date >= todayStr).length,
        slots
      };
    });

    return {
      rows
    };
  }, [facultyList, schedules, scheduleSearchQuery]);

  // If not logged in, render Login Screen
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto mt-16 px-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center space-y-6">
          <div className="w-12 h-12 bg-slate-900 text-white rounded-xl flex items-center justify-center mx-auto text-xl font-bold">
            🔒
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Admin Access</h2>
            
          </div>

          {loginError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
              ⚠️ {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Admin Password
              </label>
              <input
                type="password"
                required
                placeholder="Enter admin password..."
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2.5 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-800 transition shadow-sm disabled:opacity-50"
            >
              {isLoggingIn ? 'Verifying...' : 'Unlock Admin Portal'}
            </button>
          </form>

          
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Top Banner Alert */}
      {alertBanner && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between border ${
            alertBanner.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <span>{alertBanner.message}</span>
          <button
            onClick={() => setAlertBanner(null)}
            className="text-slate-400 hover:text-slate-700 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Admin Sub Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('schedules')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'schedules'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            📅 Schedules
          </button>
          <button
            onClick={() => setActiveTab('subjects_faculty')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'subjects_faculty'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            📚 Subjects & Faculty
          </button>
          <button
            onClick={() => setActiveTab('classes')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'classes'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            🏫 Classes
          </button>
        </div>
      </div>

      {/* TAB 1: SCHEDULES MANAGEMENT */}
      {activeTab === 'schedules' && (
        <div className="space-y-6">
          {/* Streamlined Schedule Section Header with Integrated View Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">SCHEDULES</h2>
                {scheduleViewMode === 'date' && (
                  <span className="text-[11px] text-slate-400 font-medium hidden md:inline">
                    ↔ Drag schedules between dates to reschedule
                  </span>
                )}
              </div>
              {/* Integrated tabs and small search box */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                  <button
                    onClick={() => {
                      setScheduleViewMode('date');
                      setScheduleSearchQuery('');
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                      scheduleViewMode === 'date'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Date-wise
                  </button>
                  <button
                    onClick={() => setScheduleViewMode('subject')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                      scheduleViewMode === 'subject'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Subject-wise
                  </button>
                  <button
                    onClick={() => setScheduleViewMode('class')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                      scheduleViewMode === 'class'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Class-wise
                  </button>
                  <button
                    onClick={() => setScheduleViewMode('faculty')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                      scheduleViewMode === 'faculty'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Faculty-wise
                  </button>
                </div>

                {/* Small Search Box (shown for subject-wise, class-wise, faculty-wise) */}
                {scheduleViewMode !== 'date' && (
                  <div className="relative flex items-center">
                    <span className="absolute left-2.5 text-slate-400 text-xs pointer-events-none">
                      🔍
                    </span>
                    <input
                      type="text"
                      value={scheduleSearchQuery}
                      onChange={(e) => setScheduleSearchQuery(e.target.value)}
                      placeholder={
                        scheduleViewMode === 'subject'
                          ? 'Search subject...'
                          : scheduleViewMode === 'class'
                          ? 'Search class...'
                          : 'Search faculty...'
                      }
                      className="pl-7 pr-7 py-1.5 w-44 sm:w-52 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
                    />
                    {scheduleSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setScheduleSearchQuery('')}
                        className="absolute right-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                setEditingSchedule(null);
                setTargetScheduleDate(undefined);
                setIsScheduleModalOpen(true);
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-sm self-start sm:self-center"
            >
              + Create Schedule
            </button>
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading schedules...</div>
          ) : scheduleViewMode === 'date' ? (
            /* Date-wise Drag-and-Drop View */
            <div className="space-y-4">
              {/* Top Controls: Previous Schedules (left) and Download Entire Schedule CSV (right) */}
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => setShowPreviousDates((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs border ${
                    showPreviousDates
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 border-slate-200'
                  }`}
                  title={showPreviousDates ? 'Hide previous dates' : 'Show previous dates'}
                >
                  <span className={`inline-block transition-transform duration-200 ${showPreviousDates ? 'rotate-180' : ''}`}>
                    ←
                  </span>
                  <span>{showPreviousDates ? 'Hide Previous Schedules' : 'Previous Schedules'}</span>
                  {dateWiseGroups.hasPastSchedules && !showPreviousDates && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={downloadAllSchedulesCSV}
                  title={showPreviousDates ? "Download entire schedule as CSV (including previous dates)" : "Download schedule from today onwards as CSV"}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>CSV</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {dateWiseGroups.groups.map((group) => (
                  <div
                    key={group.date}
                    id={`schedule-date-card-${group.date}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add('ring-2', 'ring-slate-900', 'bg-slate-50');
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove('ring-2', 'ring-slate-900', 'bg-slate-50');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('ring-2', 'ring-slate-900', 'bg-slate-50');
                      handleDropOnDate(group.date);
                    }}
                    className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 min-h-[240px] transition"
                  >
                    {/* Date Column Header: "Wed, Sep 09, 2026", count badge, and dark square "+" button */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
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
                        <button
                          type="button"
                          onClick={() => downloadDateCSV(group.date)}
                          title={`Download schedules for ${group.date} as CSV`}
                          className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition shadow-2xs cursor-pointer active:scale-95"
                        >
                          <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                          {group.totalCount} {group.totalCount === 1 ? 'schedule' : 'schedules'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSchedule(null);
                            setTargetScheduleDate(group.date);
                            setIsScheduleModalOpen(true);
                          }}
                          title={`Create new schedule on ${group.date}`}
                          className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-lg leading-none transition shadow-sm cursor-pointer hover:scale-105 active:scale-95"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {group.totalCount === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">
                        Drop schedule here
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {group.classGroups.map((clsGroup) => (
                          <div key={clsGroup.label} className="space-y-2.5">
                            {/* Class Header with Dark Pill and Sessions Count on Right */}
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

                            {/* Schedule Cards for this class */}
                            <div className="space-y-2.5">
                              {clsGroup.items.map((item) => {
                                const theme = getSubjectTheme(item.subject?.name);
                                const isAllDay = !item.start_time;

                                return (
                                  <div
                                    key={item.id}
                                    draggable
                                    onDragStart={() => setDraggedScheduleId(item.id)}
                                    onDragEnd={() => setDraggedScheduleId(null)}
                                    className={`p-4 rounded-2xl border ${theme.border} ${theme.bg} hover:shadow-xs transition cursor-grab active:cursor-grabbing space-y-2.5 relative overflow-hidden`}
                                  >
                                    {/* Thick left accent color bar */}
                                    <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${theme.accent}`} />

                                    {/* Top Line: Time (left) and Session pill (right) */}
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

                                    {/* Content (if exists) */}
                                    {item.content && (
                                      <div className="text-xs text-slate-700 bg-white/95 p-2.5 rounded-xl border border-slate-200/80 ml-1">
                                        {item.content}
                                      </div>
                                    )}

                                    {/* Action Buttons: Edit / Delete */}
                                    <div className="pt-1 border-t border-slate-200/60 flex items-center justify-end gap-3 text-xs pl-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingSchedule(item);
                                          setIsScheduleModalOpen(true);
                                        }}
                                        className="text-slate-700 hover:text-slate-900 font-semibold hover:underline"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSchedule(item.id)}
                                        className="text-rose-600 hover:text-rose-800 font-semibold hover:underline"
                                      >
                                        Delete
                                      </button>
                                    </div>
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
            </div>
          ) : scheduleViewMode === 'subject' ? (
            /* Structured Subject-wise View: SUBJECT -> DATE -> CLASS -> SCHEDULE */
            <div className="space-y-8">
              {subjectWiseHierarchy.map((group) => {
                const theme = getSubjectTheme(group.subject.name);

                return (
                  <div
                    key={group.subject.id}
                    className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
                  >
                    {/* 1. SUBJECT SECTION HEADER */}
                    <div className="px-6 py-4.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-3.5 h-3.5 rounded-full ${theme.accent} shadow-2xs`} />
                        <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight uppercase">
                          {group.subject.name}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => downloadSubjectCSV(group.subject.name, group.subject.id)}
                          title={`Download ${group.subject.name} schedules as CSV`}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-bold transition shadow-2xs cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          <span>CSV</span>
                        </button>
                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-700 shadow-2xs">
                          {group.totalSchedules} {group.totalSchedules === 1 ? 'SCHEDULE' : 'SCHEDULES'}
                        </span>
                      </div>
                    </div>

                    {/* 2. DATES HORIZONTAL COLUMNS (3 columns per view on desktop, smooth horizontal slide/scroll) */}
                    <div className="overflow-x-auto scroll-smooth">
                      <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 min-w-full">
                        {group.dateColumns.map((col) => (
                          <div key={col.dateStr} className="flex flex-col bg-white w-full md:w-1/3 md:min-w-[320px] md:max-w-[400px] shrink-0">
                            {/* DATE COLUMN HEADER */}
                            <div className={`px-4 py-3 border-b border-slate-200 ${col.isToday ? 'bg-blue-50/50' : 'bg-slate-50/40'}`}>
                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-black tracking-wider ${col.isToday ? 'text-blue-700' : 'text-slate-800'}`}>
                                  {col.dateLabel}
                                </span>
                                {col.totalSchedules > 0 ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                    {col.totalSchedules}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-slate-400">0</span>
                                )}
                              </div>
                              {col.subLabel && (
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight mt-0.5">
                                  {col.subLabel}
                                </p>
                              )}
                            </div>

                            {/* 3. CLASSES & SCHEDULES INSIDE DATE */}
                            <div className="p-4 space-y-4 flex-1">
                              {col.classRows.length === 0 ? (
                                <div className="py-8 px-4 rounded-xl bg-slate-50/60 border border-dashed border-slate-200 text-center flex flex-col items-center justify-center">
                                  <span className="text-xs font-medium text-slate-400">
                                    No schedules
                                  </span>
                                </div>
                              ) : (
                                col.classRows.map(({ cls, schedules: classSchedules }) => (
                                  <div key={cls.id} className="space-y-2">
                                    {/* CLASS HEADER */}
                                    <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                                      <span className="text-xs font-extrabold text-slate-800 tracking-tight flex items-center gap-1.5">
                                        <span>🎓</span>
                                        <span>{cls.name} {cls.batch ? `(${cls.batch})` : ''}</span>
                                      </span>
                                    </div>

                                    {/* SCHEDULE CARDS */}
                                    <div className="space-y-2.5">
                                      {classSchedules.map((item) => (
                                        <div
                                          key={item.id}
                                          className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs space-y-2 relative overflow-hidden transition"
                                        >
                                          {/* Subtle subject colored accent left bar */}
                                          <div className={`absolute top-0 left-0 bottom-0 w-1 ${theme.accent}`} />

                                          {/* Top: Actual Prominent Time (left) and Session Type pill (right) */}
                                          <div className="flex items-center justify-between pl-1">
                                            {item.start_time ? (
                                              <span className="text-xs font-bold text-slate-900 font-mono tracking-tight">
                                                {item.start_time}{item.end_time ? ` – ${item.end_time}` : ''}
                                              </span>
                                            ) : (
                                              <span />
                                            )}

                                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 uppercase tracking-wide border border-slate-200/80">
                                              {item.schedule_type}
                                            </span>
                                          </div>

                                          {/* Faculty */}
                                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 pl-1">
                                            <span className="text-slate-400">👤</span>
                                            <span>{item.faculty?.name || 'Unassigned'}</span>
                                          </div>

                                          {/* Content / Topic (if exists) */}
                                          {item.content && (
                                            <div className="text-[11px] text-slate-600 font-medium bg-slate-50 p-2 rounded-lg border border-slate-100 pl-2">
                                              {item.content}
                                            </div>
                                          )}

                                          {/* Action Buttons: Edit / Delete (Admin view) */}
                                          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-end gap-3 text-[11px] pl-1">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingSchedule(item);
                                                setIsScheduleModalOpen(true);
                                              }}
                                              className="text-slate-600 hover:text-slate-900 font-semibold hover:underline"
                                            >
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteSchedule(item.id)}
                                              className="text-rose-600 hover:text-rose-800 font-semibold hover:underline"
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : scheduleViewMode === 'class' ? (
            /* Horizontal Class-wise Timetable View: CLASS (ROW) -> DATE (COLUMN) -> SCHEDULES (CHRONOLOGICAL) */
            <div className="space-y-8">
              {classWiseTimetable.rows.map((row) => (
                <div
                  key={row.cls.id}
                  className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
                >
                  {/* CLASS HEADER */}
                  <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🎓</span>
                      <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight uppercase">
                        {row.cls.name} {row.cls.batch ? `(${row.cls.batch})` : ''}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => downloadClassCSV(row.cls.name, row.cls.batch, row.cls.id)}
                        title={`Download ${row.cls.name} schedules as CSV`}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-bold transition shadow-2xs cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>CSV</span>
                      </button>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-700 shadow-2xs">
                        {row.totalSchedules} {row.totalSchedules === 1 ? 'SCHEDULE' : 'SCHEDULES'}
                      </span>
                    </div>
                  </div>

                  {/* HORIZONTAL 3-COLUMN TIMETABLE: 1st card Today, 3 columns per view with smooth slide for more */}
                  <div className="overflow-x-auto scroll-smooth">
                    <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 min-w-full">
                      {row.slots.map(({ col, schedules: slotSchedules }) => (
                        <div key={col.dateStr} className="flex flex-col bg-white w-full md:w-1/3 md:min-w-[320px] md:max-w-[400px] shrink-0">
                          {/* DATE COLUMN HEADER */}
                          <div className={`px-4 py-3 border-b border-slate-200 ${col.isToday ? 'bg-blue-50/50' : 'bg-slate-50/40'}`}>
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-black tracking-wider ${col.isToday ? 'text-blue-700' : 'text-slate-800'}`}>
                                {col.dateLabel}
                              </span>
                              {slotSchedules.length > 0 ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                  {slotSchedules.length}
                                </span>
                              ) : null}
                            </div>
                            {col.subLabel && (
                              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight mt-0.5">
                                {col.subLabel}
                              </p>
                            )}
                          </div>

                          {/* SCHEDULES OR BLANK */}
                          <div className="p-3.5 space-y-3 flex-1 min-h-[140px]">
                            {slotSchedules.length === 0 ? (
                              <div className="h-full min-h-[100px] flex items-center justify-center rounded-xl border border-dashed border-slate-200/80 bg-slate-50/40 text-[11px] font-medium text-slate-400">
                                —
                              </div>
                            ) : (
                              <div className="space-y-2.5">
                                {slotSchedules.map((item) => {
                                  const theme = getSubjectTheme(item.subject?.name);

                                  return (
                                    <div
                                      key={item.id}
                                      className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs space-y-2 relative overflow-hidden transition"
                                    >
                                      {/* Colored left bar */}
                                      <div className={`absolute top-0 left-0 bottom-0 w-1 ${theme.accent}`} />

                                      {/* Top Row: Time (left) and Session Type pill (right) */}
                                      <div className="flex items-center justify-between pl-1">
                                        {item.start_time ? (
                                          <span className="text-xs font-bold text-slate-900 font-mono tracking-tight">
                                            {item.start_time}{item.end_time ? ` – ${item.end_time}` : ''}
                                          </span>
                                        ) : (
                                          <span />
                                        )}

                                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 uppercase tracking-wide border border-slate-200/80">
                                          {item.schedule_type}
                                        </span>
                                      </div>

                                      {/* Subject with colored dot */}
                                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900 pl-1">
                                        <span className={`w-2 h-2 rounded-full ${theme.accent}`} />
                                        <span>{item.subject?.name}</span>
                                      </div>

                                      {/* Faculty */}
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 pl-1">
                                        <span className="text-slate-400">👤</span>
                                        <span>{item.faculty?.name || 'Unassigned'}</span>
                                      </div>

                                      {/* Content / Topic (if exists) */}
                                      {item.content && (
                                        <div className="text-[11px] text-slate-600 font-medium bg-slate-50 p-2 rounded-lg border border-slate-100 pl-2">
                                          {item.content}
                                        </div>
                                      )}

                                      {/* Action Buttons: Edit / Delete */}
                                      <div className="pt-1.5 border-t border-slate-100 flex items-center justify-end gap-3 text-[11px] pl-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingSchedule(item);
                                            setIsScheduleModalOpen(true);
                                          }}
                                          className="text-slate-600 hover:text-slate-900 font-semibold hover:underline"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteSchedule(item.id)}
                                          className="text-rose-600 hover:text-rose-800 font-semibold hover:underline"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Horizontal Faculty-wise Timetable View */
            <div className="space-y-8">
              {facultyWiseTimetable.rows.map((row) => (
                <div
                  key={row.faculty.id}
                  className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
                >
                  {/* FACULTY HEADER */}
                  <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">👨‍🏫</span>
                      <div>
                        <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                          {row.faculty.name}
                        </h3>
                        {row.faculty.department && (
                          <p className="text-[11px] font-semibold text-slate-500">
                            {row.faculty.department}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => downloadFacultyCSV(row.faculty.name, row.faculty.id)}
                        title={`Download ${row.faculty.name} schedules as CSV`}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-bold transition shadow-2xs cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>CSV</span>
                      </button>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-700 shadow-2xs">
                        {row.totalSchedules} {row.totalSchedules === 1 ? 'SCHEDULE' : 'SCHEDULES'}
                      </span>
                    </div>
                  </div>

                  {/* HORIZONTAL 3-COLUMN TIMETABLE */}
                  <div className="overflow-x-auto scroll-smooth">
                    <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 min-w-full">
                      {row.slots.map(({ col, schedules: slotSchedules }) => (
                        <div key={col.dateStr} className="flex flex-col bg-white w-full md:w-1/3 md:min-w-[320px] md:max-w-[400px] shrink-0">
                          {/* DATE COLUMN HEADER */}
                          <div className={`px-4 py-3 border-b border-slate-200 ${col.isToday ? 'bg-blue-50/50' : 'bg-slate-50/40'}`}>
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-black tracking-wider ${col.isToday ? 'text-blue-700' : 'text-slate-800'}`}>
                                {col.dateLabel}
                              </span>
                              {slotSchedules.length > 0 ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                  {slotSchedules.length}
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-slate-400">0</span>
                              )}
                            </div>
                            {col.subLabel && (
                              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight mt-0.5">
                                {col.subLabel}
                              </p>
                            )}
                          </div>

                          {/* SCHEDULES OR BLANK */}
                          <div className="p-3.5 space-y-3 flex-1 min-h-[140px]">
                            {slotSchedules.length === 0 ? (
                              <div className="h-full min-h-[100px] flex items-center justify-center rounded-xl border border-dashed border-slate-200/80 bg-slate-50/40 text-[11px] font-medium text-slate-400">
                                —
                              </div>
                            ) : (
                              <div className="space-y-2.5">
                                {slotSchedules.map((item) => {
                                  const theme = getSubjectTheme(item.subject?.name);

                                  return (
                                    <div
                                      key={item.id}
                                      className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs space-y-2 relative overflow-hidden transition"
                                    >
                                      {/* Colored left bar */}
                                      <div className={`absolute top-0 left-0 bottom-0 w-1 ${theme.accent}`} />

                                      {/* Top Row: Time (left) and Session Type pill (right) */}
                                      <div className="flex items-center justify-between pl-1">
                                        {item.start_time ? (
                                          <span className="text-xs font-bold text-slate-900 font-mono tracking-tight">
                                            {item.start_time}{item.end_time ? ` – ${item.end_time}` : ''}
                                          </span>
                                        ) : (
                                          <span />
                                        )}

                                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 uppercase tracking-wide border border-slate-200/80">
                                          {item.schedule_type}
                                        </span>
                                      </div>

                                      {/* Class name */}
                                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900 pl-1">
                                        <span>🎓</span>
                                        <span>{item.class?.name} {item.class?.batch ? `(${item.class.batch})` : ''}</span>
                                      </div>

                                      {/* Subject with colored dot */}
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 pl-1">
                                        <span className={`w-2 h-2 rounded-full ${theme.accent}`} />
                                        <span>{item.subject?.name || 'Unassigned'}</span>
                                      </div>

                                      {/* Content / Topic (if exists) */}
                                      {item.content && (
                                        <div className="text-[11px] text-slate-600 font-medium bg-slate-50 p-2 rounded-lg border border-slate-100 pl-2">
                                          {item.content}
                                        </div>
                                      )}

                                      {/* Action Buttons: Edit / Delete */}
                                      <div className="pt-1.5 border-t border-slate-100 flex items-center justify-end gap-3 text-[11px] pl-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingSchedule(item);
                                            setIsScheduleModalOpen(true);
                                          }}
                                          className="text-slate-600 hover:text-slate-900 font-semibold hover:underline"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteSchedule(item.id)}
                                          className="text-rose-600 hover:text-rose-800 font-semibold hover:underline"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SUBJECTS & FACULTY */}
      {activeTab === 'subjects_faculty' && (
        <SubjectFacultySection
          subjects={subjects}
          facultyList={facultyList}
          onRefresh={refreshAllData}
          onAddSubject={handleAddSubject}
          onUpdateSubject={handleUpdateSubject}
          onDeleteSubject={handleDeleteSubject}
          onAddFaculty={handleAddFaculty}
          onUpdateFaculty={handleUpdateFaculty}
          onDeleteFaculty={handleDeleteFaculty}
        />
      )}

      {/* TAB 3: CLASSES */}
      {activeTab === 'classes' && (
        <ClassesSection
          classes={classes}
          onAddClass={handleAddClass}
          onUpdateClass={handleUpdateClass}
          onDeleteClass={handleDeleteClass}
        />
      )}

      {/* Schedule Creation / Edit Modal */}
      <ScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setEditingSchedule(null);
          setTargetScheduleDate(undefined);
        }}
        onSave={handleSaveSchedule}
        initialData={editingSchedule}
        defaultDate={targetScheduleDate}
        classes={classes}
        subjects={subjects}
        facultyList={facultyList}
      />
    </div>
  );
};
