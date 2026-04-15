import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store.js';
import { useI18n } from '../i18n/context.js';
import { apiFetch, formatPrice } from '../utils/api.js';
import type { DashboardSummaryResponse } from '@halokonobar/types';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
      <p className="text-white/50 text-sm">{label}</p>
      <p className="text-white text-3xl font-bold mt-1">{value}</p>
      {sub && <p className="text-white/30 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export function Dashboard() {
  const { accessToken } = useAuthStore();
  const { t } = useI18n();

  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () =>
      apiFetch<DashboardSummaryResponse>(
        '/api/v1/staff/dashboard/summary',
        {},
        accessToken ?? undefined
      ),
    enabled: !!accessToken,
    refetchInterval: 30_000,
  });

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-white/40">{t.loading}</div>
      </div>
    );
  }

  const avgWaitMins = Math.round(data.avgWaitTimeSeconds / 60);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="px-4 py-6 pt-safe-top border-b border-white/10">
        <h1 className="text-2xl font-bold">{t.tonightSummary}</h1>
      </header>

      <main className="px-4 py-4 grid grid-cols-2 gap-3">
        <Stat
          label={t.activeOrders}
          value={String(data.activeOrdersCount)}
          sub={`${data.pendingOrdersCount} ${t.pending}`}
        />
        <Stat
          label={t.avgWait}
          value={`${avgWaitMins}m`}
          sub={t.toDelivery}
        />
        <Stat
          label={t.ordersLastHour}
          value={String(data.ordersLastHour)}
        />
        <Stat
          label={t.revenueToday}
          value={formatPrice(data.revenueTodayPence)}
        />
      </main>
    </div>
  );
}
