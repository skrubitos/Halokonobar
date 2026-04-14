import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/auth.store.js';
import { Login } from './pages/Login.js';
import { OrderFeed } from './pages/OrderFeed.js';
import { Dashboard } from './pages/Dashboard.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated()) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { path: '/orders', icon: '📋', label: 'Orders' },
    { path: '/dashboard', icon: '📊', label: 'Summary' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-950 border-t border-white/10 flex pb-safe-bottom">
      {tabs.map((tab) => (
        <button
          key={tab.path}
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
          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
