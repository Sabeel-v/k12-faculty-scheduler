import React, { useState, useEffect } from 'react';
import { Navbar } from './client/components/Navbar';
import { RoleSelectionPage } from './client/pages/RoleSelectionPage';
import { FacultyPage } from './client/pages/faculty/FacultyPage';
import { FacultyCalendarPage } from './client/pages/faculty/FacultyCalendarPage';
import { MentorPage } from './client/pages/mentor/MentorPage';
import { MentorCalendarPage } from './client/pages/mentor/MentorCalendarPage';
import { AdminPage } from './client/pages/admin/AdminPage';
import { getAdminToken, removeAdminToken } from './client/lib/api';

const STORAGE_KEY_USER_ROLE = 'fs_user_role';

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    const path = window.location.pathname;
    if (path && path !== '/') {
      return path;
    }
    // If opening root '/', check if user previously chose or logged into a portal
    const savedRole = localStorage.getItem(STORAGE_KEY_USER_ROLE);
    if (savedRole === 'faculty') return '/faculty';
    if (savedRole === 'mentor') return '/mentor';
    if (savedRole === 'admin') return '/admin';
    return '/';
  });

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => !!getAdminToken());

  useEffect(() => {
    // If root path was requested and a saved role exists, sync history URL
    if (window.location.pathname === '/' && currentPath !== '/') {
      window.history.replaceState({}, '', currentPath);
    }
  }, [currentPath]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
      setIsAdminLoggedIn(!!getAdminToken());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    setIsAdminLoggedIn(!!getAdminToken());
  };

  const handleLogout = () => {
    // Clear all saved user/session info from local storage
    localStorage.removeItem(STORAGE_KEY_USER_ROLE);
    localStorage.removeItem('fs_selected_faculty_id');
    removeAdminToken();
    setIsAdminLoggedIn(false);
    handleNavigate('/');
  };

  const handleSelectRole = (role: 'faculty' | 'mentor' | 'admin') => {
    localStorage.setItem(STORAGE_KEY_USER_ROLE, role);
    if (role === 'faculty') handleNavigate('/faculty');
    else if (role === 'mentor') handleNavigate('/mentor');
    else if (role === 'admin') handleNavigate('/admin');
  };

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-900 flex flex-col font-sans antialiased">
      <Navbar
        currentPath={currentPath}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />

      <main className="flex-1 pb-16">
        {currentPath === '/admin' ? (
          <AdminPage />
        ) : currentPath === '/mentor/calendar' || currentPath === '/calendar' ? (
          <MentorCalendarPage onNavigate={handleNavigate} />
        ) : currentPath === '/faculty/calendar' ? (
          <FacultyCalendarPage onNavigate={handleNavigate} />
        ) : currentPath === '/mentor' ? (
          <MentorPage />
        ) : currentPath === '/faculty' ? (
          <FacultyPage />
        ) : (
          <RoleSelectionPage onSelectRole={handleSelectRole} />
        )}
      </main>
    </div>
  );
};

export default App;
