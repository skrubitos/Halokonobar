import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSessionStore } from './store/session.store.js';
import { NfcLanding } from './pages/NfcLanding.js';
import { Menu } from './pages/Menu.js';
import { Cart } from './pages/Cart.js';
import { OrderStatus } from './pages/OrderStatus.js';
import { OrderHistory } from './pages/OrderHistory.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

function RequireSession({ children }: { children: React.ReactNode }) {
  const isValid = useSessionStore((s) => s.isValid);
  if (!isValid()) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* NFC / QR entry point */}
          <Route path="/nfc/:tag_uid" element={<NfcLanding />} />

          {/* Session-protected routes */}
          <Route
            path="/menu"
            element={<RequireSession><Menu /></RequireSession>}
          />
          <Route
            path="/cart"
            element={<RequireSession><Cart /></RequireSession>}
          />
          <Route
            path="/orders"
            element={<RequireSession><OrderHistory /></RequireSession>}
          />
          <Route
            path="/orders/:order_id"
            element={<RequireSession><OrderStatus /></RequireSession>}
          />

          {/* Fallback */}
          <Route path="*" element={<NoSessionFallback />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function NoSessionFallback() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-6">📱</div>
        <h1 className="text-white text-2xl font-bold mb-3">Scan to order</h1>
        <p className="text-white/50 text-base">
          Tap the NFC tag on your table, or scan the QR code to start ordering.
        </p>
      </div>
    </div>
  );
}
