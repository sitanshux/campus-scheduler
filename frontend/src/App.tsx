import { useState, useCallback } from 'react';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import DashboardPage from './pages/DashboardPage';
import TimetablePage from './pages/TimetablePage';
import RoomsPage from './pages/RoomsPage';
import FacultyPage from './pages/FacultyPage';
import ExamsPage from './pages/ExamsPage';
import BookingsPage from './pages/BookingsPage';
import type { PageId } from './types';

const pageTitles: Record<PageId, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Campus scheduling overview' },
  timetable: { title: 'Timetable', subtitle: 'Weekly class schedule' },
  rooms: { title: 'Rooms & Venues', subtitle: 'Manage campus facilities' },
  faculty: { title: 'Faculty', subtitle: 'Faculty directory & schedules' },
  exams: { title: 'Examinations', subtitle: 'Exam schedule management' },
  bookings: { title: 'Venue Bookings', subtitle: 'Booking requests & approvals' },
};

function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavigate = useCallback((page: string) => {
    setCurrentPage(page as PageId);
    setMobileMenuOpen(false);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const handleMenuToggle = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'timetable':
        return <TimetablePage />;
      case 'rooms':
        return <RoomsPage />;
      case 'faculty':
        return <FacultyPage />;
      case 'exams':
        return <ExamsPage />;
      case 'bookings':
        return <BookingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  const { title, subtitle } = pageTitles[currentPage];

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          transform transition-transform duration-300 ease-in-out
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <Sidebar
          currentPage={currentPage}
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          title={title}
          subtitle={subtitle}
          onMenuToggle={handleMenuToggle}
        />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
