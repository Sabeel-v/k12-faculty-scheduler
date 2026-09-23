import React from 'react';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPath,
  onNavigate,
  onLogout
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('/')}>
            <img
              src="/ms-logo.jpg"
              alt="Logo"
              className="w-9 h-9 rounded-xl object-contain border border-slate-200/80 shadow-xs bg-white p-0.5"
            />
            <div>
              <span className="font-bold text-slate-900 text-sm sm:text-base tracking-tight block leading-none">
                K12 FACULTY SCHEDULER
              </span>
              <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 block mt-0.5">
                Academic Timetable System
              </span>
            </div>
          </div>

          {/* Right side controls - Universal Logout button across all windows */}
          <div className="flex items-center gap-2">
            {currentPath !== '/' && (
              <button
                type="button"
                onClick={onLogout}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:border-slate-400 rounded-xl hover:bg-slate-50 shadow-2xs transition cursor-pointer flex items-center gap-1.5"
              >
                <span>Logout</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
