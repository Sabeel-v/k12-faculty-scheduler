import React from 'react';

interface RoleSelectionPageProps {
  onSelectRole: (role: 'faculty' | 'mentor' | 'admin') => void;
}

export const RoleSelectionPage: React.FC<RoleSelectionPageProps> = ({ onSelectRole }) => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[75vh]">
      {/* Brand / Welcome badge */}
      <div className="text-center space-y-3 mb-10">
        <img
          src="/ms-logo.jpg"
          alt="Logo"
          className="w-20 h-20 rounded-2xl object-contain mx-auto shadow-md border border-slate-200/80 bg-white p-1"
        />
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          K12 FACULTY SCHEDULER
        </h1>
        <p className="text-sm font-medium text-slate-500 max-w-md mx-auto">
          Please select your portal to continue
        </p>
      </div>

      {/* 3 Portal Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl">
        {/* 1. Faculty */}
        <button
          type="button"
          onClick={() => onSelectRole('faculty')}
          className="group p-6 rounded-3xl bg-white border border-slate-200/90 hover:border-slate-900 shadow-sm hover:shadow-xl transition-all text-left flex flex-col justify-between space-y-6 cursor-pointer hover:-translate-y-1"
        >
          <div className="space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              👨‍🏫
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                Faculty Portal
              </h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Check personal daily schedules, today/tomorrow classes, and your academic timetable.
              </p>
            </div>
          </div>

          <div className="flex items-center text-xs font-bold text-blue-600 group-hover:translate-x-1 transition-transform">
            <span>Continue as Faculty</span>
            <span className="ml-1 text-base leading-none">→</span>
          </div>
        </button>

        {/* 2. Mentor */}
        <button
          type="button"
          onClick={() => onSelectRole('mentor')}
          className="group p-6 rounded-3xl bg-white border border-slate-200/90 hover:border-slate-900 shadow-sm hover:shadow-xl transition-all text-left flex flex-col justify-between space-y-6 cursor-pointer hover:-translate-y-1"
        >
          <div className="space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              🎓
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                Mentor Portal
              </h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Master 3-day board overview across classes, subjects, and complete institutional calendar.
              </p>
            </div>
          </div>

          <div className="flex items-center text-xs font-bold text-emerald-600 group-hover:translate-x-1 transition-transform">
            <span>Continue as Mentor</span>
            <span className="ml-1 text-base leading-none">→</span>
          </div>
        </button>

        {/* 3. Admin */}
        <button
          type="button"
          onClick={() => onSelectRole('admin')}
          className="group p-6 rounded-3xl bg-white border border-slate-200/90 hover:border-slate-900 shadow-sm hover:shadow-xl transition-all text-left flex flex-col justify-between space-y-6 cursor-pointer hover:-translate-y-1"
        >
          <div className="space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              ⚙️
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
                Admin Portal
              </h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Manage timetable schedules, assign faculties, register classes, and system settings.
              </p>
            </div>
          </div>

          <div className="flex items-center text-xs font-bold text-purple-600 group-hover:translate-x-1 transition-transform">
            <span>Continue as Admin</span>
            <span className="ml-1 text-base leading-none">→</span>
          </div>
        </button>
      </div>
    </div>
  );
};
