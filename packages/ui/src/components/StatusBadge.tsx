import React from 'react';
import type { OrderStatus, OrderPriority } from '@halokonobar/types';

interface StatusBadgeProps {
  status: OrderStatus;
  pulse?: boolean;
}

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; classes: string }
> = {
  pending:   { label: 'Pending',   classes: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  accepted:  { label: 'Accepted',  classes: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  preparing: { label: 'Preparing', classes: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  ready:     { label: 'Ready',     classes: 'bg-green-500/20 text-green-300 border-green-500/30' },
  delivered: { label: 'Delivered', classes: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  cancelled: { label: 'Cancelled', classes: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

export function StatusBadge({ status, pulse = false }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.classes}`}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {config.label}
    </span>
  );
}

interface PriorityBadgeProps {
  priority: OrderPriority;
}

const PRIORITY_CONFIG: Record<
  OrderPriority,
  { label: string; classes: string } | null
> = {
  normal:  null,
  vip:    { label: 'VIP',    classes: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  urgent: { label: 'URGENT', classes: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${config.classes}`}
    >
      {config.label}
    </span>
  );
}
