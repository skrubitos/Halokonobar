import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useI18n } from './i18n/context.js';
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
  const { t, lang, setLang } = useI18n();
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-6">📱</div>
        <h1 className="text-white text-2xl font-bold mb-3">{t.scanToOrder}</h1>
        <p className="text-white/50 text-base mb-8">{t.scanToOrderSub}</p>
        <LanguageSwitcher lang={lang} setLang={setLang} />
      </div>
    </div>
  );
}

function LanguageSwitcher({ lang, setLang }: { lang: string; setLang: (l: 'en' | 'hr') => void }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-2">
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
          lang === 'en' ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/50 hover:text-white'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('hr')}
        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
          lang === 'hr' ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/50 hover:text-white'
        }`}
      >
        HR
      </button>
    </div>
  );
}

export { LanguageSwitcher };
