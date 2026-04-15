import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/auth.store.js';
import { useI18n } from './i18n/context.js';
import { Login } from './pages/Login.js';
import { OrderFeed } from './pages/OrderFeed.js';
import { Dashboard } from './pages/Dashboard.js';
import { MenuAdmin } from './pages/MenuAdmin.js';
import { TablesAdmin } from './pages/TablesAdmin.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated()) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setLang('hr')}
        className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
          lang === 'hr' ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white'
        }`}
      >
        HR
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
          lang === 'en' ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white'
        }`}
      >
        EN
      </button>
    </div>
  );
}

function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { staff } = useAuthStore();
  const { t } = useI18n();
  const isManager = staff?.role === 'manager' || staff?.role === 'admin';

  const tabs = [
    { path: '/orders', icon: '📋', label: t.tabOrders },
    { path: '/dashboard', icon: '📊', label: t.tabSummary },
    ...(isManager ? [{ path: '/menu-admin', icon: '🍸', label: t.tabMenu }] : []),
    ...(isManager ? [{ path: '/tables-admin', icon: '🪑', label: t.tabTables }] : []),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-950 border-t border-white/10 flex pb-safe-bottom">
      {tabs.map((tab) => (
        <button
          key={tab.path}
          type="button"
          onClick={() => navigate(tab.path)}
          className={`flex-1 py-3 flex flex-col items-center gap-1 text-xs font-medium transition-colors ${
            location.pathname.startsWith(tab.path) ? 'text-indigo-400' : 'text-white/40'
          }`}
        >
          <span className="text-xl">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-16">
      {children}
      <TabBar />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/orders"
            element={
              <RequireAuth>
                <AuthenticatedLayout><OrderFeed /></AuthenticatedLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <AuthenticatedLayout><Dashboard /></AuthenticatedLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/menu-admin"
            element={
              <RequireAuth>
                <AuthenticatedLayout><MenuAdmin /></AuthenticatedLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/tables-admin"
            element={
              <RequireAuth>
                <AuthenticatedLayout><TablesAdmin /></AuthenticatedLayout>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
