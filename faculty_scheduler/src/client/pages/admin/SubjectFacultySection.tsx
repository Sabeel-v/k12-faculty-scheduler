import React, { useState } from 'react';
import type { Subject, Faculty } from '../../types';
import { getSubjectTheme } from '../../lib/subjectColors';

interface SubjectFacultySectionProps {
  subjects: Subject[];
  facultyList: Faculty[];
  onRefresh: () => Promise<void>;
  onAddSubject: (payload: { name: string; display_order?: number }) => Promise<void>;
  onUpdateSubject: (id: number, payload: Partial<Subject>) => Promise<void>;
  onDeleteSubject: (id: number) => Promise<void>;
  onAddFaculty: (payload: {
    subject_id: number;
    name: string;
    department?: string;
    phone?: string;
    status?: string;
  }) => Promise<void>;
  onUpdateFaculty: (id: number, payload: Partial<Faculty>) => Promise<void>;
  onDeleteFaculty: (id: number) => Promise<void>;
}

export const SubjectFacultySection: React.FC<SubjectFacultySectionProps> = ({
  subjects,
  facultyList,
  onAddSubject,
  onUpdateSubject,
  onDeleteSubject,
  onAddFaculty,
  onUpdateFaculty,
  onDeleteFaculty
}) => {
  // Modal states
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectName, setSubjectName] = useState('');

  const [showAddFacultyModal, setShowAddFacultyModal] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);
  const [facultyForm, setFacultyForm] = useState<{
    subject_id: number;
    name: string;
    department: string;
    phone: string;
    status: string;
  }>({
    subject_id: subjects[0]?.id || 1,
    name: '',
    department: '',
    phone: '',
    status: 'active'
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Handle Subject Form Submit
  const handleSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!subjectName.trim()) return;

    try {
      if (editingSubject) {
        await onUpdateSubject(editingSubject.id, { name: subjectName.trim() });
      } else {
        await onAddSubject({ name: subjectName.trim() });
      }
      setShowAddSubjectModal(false);
      setEditingSubject(null);
      setSubjectName('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save subject');
    }
  };

  // Handle Faculty Form Submit
  const handleFacultySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!facultyForm.name.trim() || !facultyForm.subject_id) {
      setErrorMsg('Faculty name and Subject selection are required.');
      return;
    }

    try {
      if (editingFaculty) {
        await onUpdateFaculty(editingFaculty.id, {
          subject_id: facultyForm.subject_id,
          name: facultyForm.name.trim(),
          department: facultyForm.department.trim() || null,
          phone: facultyForm.phone.trim() || null,
          status: facultyForm.status
        });
      } else {
        await onAddFaculty({
          subject_id: facultyForm.subject_id,
          name: facultyForm.name.trim(),
          department: facultyForm.department.trim() || undefined,
          phone: facultyForm.phone.trim() || undefined,
          status: facultyForm.status
        });
      }
      setShowAddFacultyModal(false);
      setEditingFaculty(null);
      setFacultyForm({
        subject_id: subjects[0]?.id || 1,
        name: '',
        department: '',
        phone: '',
        status: 'active'
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save faculty');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Subjects & Faculty</h2>
          <p className="text-xs text-slate-500 mt-1">
            Faculty members belong to specific subjects. One subject can have multiple faculty members.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingSubject(null);
              setSubjectName('');
              setErrorMsg(null);
              setShowAddSubjectModal(true);
            }}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            + Add Subject
          </button>
          <button
            onClick={() => {
              setEditingFaculty(null);
              setFacultyForm({
                subject_id: subjects[0]?.id || 1,
                name: '',
                department: '',
                phone: '',
                status: 'active'
              });
              setErrorMsg(null);
              setShowAddFacultyModal(true);
            }}
            disabled={subjects.length === 0}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition disabled:opacity-50"
          >
            + Add Faculty
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Tree / Grouped View */}
      <div className="space-y-4">
        {subjects.map((subj) => {
          const matchingFaculty = facultyList.filter((f) => f.subject_id === subj.id);
          const theme = getSubjectTheme(subj.name);

          return (
            <div
              key={subj.id}
              className={`bg-white border ${theme.border} rounded-2xl shadow-2xs overflow-hidden`}
            >
              {/* Subject Row */}
              <div className={`${theme.bgLight} px-6 py-4 flex items-center justify-between border-b ${theme.border}`}>
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${theme.accent} shadow-2xs`}></span>
                  <span className="text-sm font-bold text-slate-900 tracking-tight">
                    {subj.name}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${theme.badge}`}>
                    {matchingFaculty.length} faculty
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setFacultyForm({
                        subject_id: subj.id,
                        name: '',
                        department: '',
                        phone: '',
                        status: 'active'
                      });
                      setEditingFaculty(null);
                      setErrorMsg(null);
                      setShowAddFacultyModal(true);
                    }}
                    className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-md transition"
                    title="Add faculty to this subject"
                  >
                    + Add Faculty
                  </button>
                  <button
                    onClick={() => {
                      setEditingSubject(subj);
                      setSubjectName(subj.name);
                      setErrorMsg(null);
                      setShowAddSubjectModal(true);
                    }}
                    className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-md transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`Delete subject "${subj.name}"?`)) {
                        try {
                          await onDeleteSubject(subj.id);
                        } catch (err: any) {
                          setErrorMsg(err.message || 'Cannot delete subject');
                        }
                      }
                    }}
                    className="px-2 py-1 text-[11px] font-medium text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md transition"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Faculty Items under Subject */}
              <div className="p-4 sm:p-6 divide-y divide-slate-100">
                {matchingFaculty.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400">
                    No faculty assigned to {subj.name} yet.
                  </div>
                ) : (
                  matchingFaculty.map((fac) => (
                    <div
                      key={fac.id}
                      className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-3 pl-4 border-l-2 border-slate-200">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800">{fac.name}</span>
                            <span
                              className={`text-[10px] px-2 py-0.2 rounded-full font-semibold ${
                                fac.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              {fac.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {fac.department ? `${fac.department} • ` : ''}
                            {fac.phone ? `Phone: ${fac.phone}` : 'No phone listed'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 self-end sm:self-auto">
                        <button
                          onClick={() => {
                            setEditingFaculty(fac);
                            setFacultyForm({
                              subject_id: fac.subject_id,
                              name: fac.name,
                              department: fac.department || '',
                              phone: fac.phone || '',
                              status: fac.status
                            });
                            setErrorMsg(null);
                            setShowAddFacultyModal(true);
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`Remove faculty member "${fac.name}"?`)) {
                              try {
                                await onDeleteFaculty(fac.id);
                              } catch (err: any) {
                                setErrorMsg(err.message || 'Cannot delete faculty');
                              }
                            }
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Subject */}
      {showAddSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {editingSubject ? 'Edit Subject' : 'Add Subject'}
            </h3>
            <form onSubmit={handleSubjectSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Subject Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mathematics"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSubjectModal(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs text-white bg-slate-900 rounded-xl hover:bg-slate-800 font-semibold"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Faculty */}
      {showAddFacultyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {editingFaculty ? 'Edit Faculty' : 'Add Faculty'}
            </h3>
            <form onSubmit={handleFacultySubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Subject *</label>
                <select
                  required
                  value={facultyForm.subject_id}
                  onChange={(e) =>
                    setFacultyForm({ ...facultyForm, subject_id: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Faculty Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Teacher A"
                  value={facultyForm.name}
                  onChange={(e) => setFacultyForm({ ...facultyForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  placeholder="e.g. Science"
                  value={facultyForm.department}
                  onChange={(e) =>
                    setFacultyForm({ ...facultyForm, department: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phone</label>
                <input
                  type="text"
                  placeholder="e.g. +91 9876543210"
                  value={facultyForm.phone}
                  onChange={(e) => setFacultyForm({ ...facultyForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={facultyForm.status}
                  onChange={(e) => setFacultyForm({ ...facultyForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddFacultyModal(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs text-white bg-slate-900 rounded-xl hover:bg-slate-800 font-semibold"
                >
                  Save Faculty
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
