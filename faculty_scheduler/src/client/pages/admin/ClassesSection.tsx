import React, { useState } from 'react';
import type { ClassItem } from '../../types';

interface ClassesSectionProps {
  classes: ClassItem[];
  onAddClass: (payload: { name: string; batch?: string; academic_year?: string }) => Promise<void>;
  onUpdateClass: (id: number, payload: Partial<ClassItem>) => Promise<void>;
  onDeleteClass: (id: number) => Promise<void>;
}

export const ClassesSection: React.FC<ClassesSectionProps> = ({
  classes,
  onAddClass,
  onUpdateClass,
  onDeleteClass
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [name, setName] = useState('');
  const [batch, setBatch] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!name.trim()) return;

    try {
      if (editingClass) {
        await onUpdateClass(editingClass.id, {
          name: name.trim(),
          batch: batch.trim() || null,
          academic_year: academicYear.trim() || null
        });
      } else {
        await onAddClass({
          name: name.trim(),
          batch: batch.trim() || undefined,
          academic_year: academicYear.trim() || undefined
        });
      }
      setShowModal(false);
      setEditingClass(null);
      setName('');
      setBatch('');
      setAcademicYear('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save class');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Classes & Batches</h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage academic batches and classes (e.g. SSLC / RMS, Class 9 / DMS)
          </p>
        </div>

        <button
          onClick={() => {
            setEditingClass(null);
            setName('');
            setBatch('');
            setAcademicYear('');
            setErrorMsg(null);
            setShowModal(true);
          }}
          className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition self-start sm:self-auto"
        >
          + Add Class
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
          ⚠️ {errorMsg}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3.5">Class Name</th>
              <th className="px-6 py-3.5">Batch</th>
              <th className="px-6 py-3.5">Academic Year</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {classes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                  No classes registered yet.
                </td>
              </tr>
            ) : (
              classes.map((cls) => (
                <tr key={cls.id} className="hover:bg-slate-50/60 transition">
                  <td className="px-6 py-4 font-bold text-slate-900">{cls.name}</td>
                  <td className="px-6 py-4 text-slate-600 font-medium">{cls.batch || '—'}</td>
                  <td className="px-6 py-4 text-slate-500">{cls.academic_year || '—'}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        cls.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {cls.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => {
                        setEditingClass(cls);
                        setName(cls.name);
                        setBatch(cls.batch || '');
                        setAcademicYear(cls.academic_year || '');
                        setErrorMsg(null);
                        setShowModal(true);
                      }}
                      className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete class "${cls.name}"?`)) {
                          try {
                            await onDeleteClass(cls.id);
                          } catch (err: any) {
                            setErrorMsg(err.message || 'Cannot delete class');
                          }
                        }
                      }}
                      className="px-2.5 py-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {editingClass ? 'Edit Class' : 'Add Class'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Class Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SSLC"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Batch</label>
                <input
                  type="text"
                  placeholder="e.g. RMS"
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Academic Year</label>
                <input
                  type="text"
                  placeholder="e.g. 2026-2027"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs text-white bg-slate-900 rounded-xl hover:bg-slate-800 font-semibold"
                >
                  Save Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
