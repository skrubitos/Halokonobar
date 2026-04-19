import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store.js';
import { useI18n } from '../i18n/context.js';
import { apiFetch } from '../utils/api.js';

interface StaffMember {
  id: string;
  club_id: string;
  email: string;
  display_name: string;
  role: 'waiter' | 'manager' | 'admin';
  assigned_zones: string[];
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface Zone {
  id: string;
  name: string;
  zone_type: string;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-checked={checked ? 'true' : 'false'}
      role="switch"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-white/20'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-500/20 text-red-300 border-red-500/30',
  manager: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  waiter: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
};

function RoleBadge({ role, label }: { role: string; label: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${ROLE_COLORS[role] ?? ROLE_COLORS.waiter}`}>
      {label}
    </span>
  );
}

function EditStaffModal({
  member,
  zones,
  clubId,
  token,
  onClose,
}: {
  member: StaffMember | null;
  zones: Zone[];
  clubId: string;
  token: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const isNew = member === null;

  const [displayName, setDisplayName] = useState(member?.display_name ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'waiter' | 'manager' | 'admin'>(member?.role ?? 'waiter');
  const [assignedZones, setAssignedZones] = useState<string[]>(member?.assigned_zones ?? []);
  const [isActive, setIsActive] = useState(member?.is_active ?? true);
  const [error, setError] = useState('');

  const toggleZone = (zoneId: string) => {
    setAssignedZones((prev) =>
      prev.includes(zoneId) ? prev.filter((z) => z !== zoneId) : [...prev, zoneId]
    );
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!displayName.trim()) throw new Error(t.nameRequired);
      if (isNew && !email.trim()) throw new Error(t.emailRequired);
      if (isNew && !password) throw new Error(t.passwordRequired);

      if (isNew) {
        return apiFetch(`/api/v1/admin/clubs/${clubId}/staff`, {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim(),
            password,
            displayName: displayName.trim(),
            role,
            assignedZones,
          }),
        }, token);
      } else {
        const body: Record<string, unknown> = {
          displayName: displayName.trim(),
          role,
          assignedZones,
          isActive,
        };
        if (password) body.password = password;
        return apiFetch(`/api/v1/admin/clubs/${clubId}/staff/${member!.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        }, token);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-staff', clubId] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-safe-bottom">
      <div className="w-full max-w-lg bg-gray-900 rounded-2xl border border-white/10 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-lg font-bold">{isNew ? t.newStaff : t.editStaff}</h2>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-white/60 text-sm block mb-1">{t.staffName} *</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
              placeholder={t.staffNamePlaceholder}
            />
          </div>

          <div>
            <label className="text-white/60 text-sm block mb-1">{t.staffEmail} *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!isNew}
              className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
              placeholder={t.staffEmailPlaceholder}
            />
          </div>

          <div>
            <label className="text-white/60 text-sm block mb-1">
              {isNew ? t.staffPassword : t.staffNewPassword} {isNew && '*'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
              placeholder={t.staffPasswordPlaceholder}
            />
          </div>

          <div>
            <label className="text-white/60 text-sm block mb-1">{t.staffRole}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'waiter' | 'manager' | 'admin')}
              title={t.staffRole}
              className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
            >
              <option value="waiter" className="bg-gray-900">{t.roleWaiter}</option>
              <option value="manager" className="bg-gray-900">{t.roleManager}</option>
              <option value="admin" className="bg-gray-900">{t.roleAdmin}</option>
            </select>
          </div>

          <div>
            <label className="text-white/60 text-sm block mb-1">{t.staffZones}</label>
            <p className="text-white/30 text-xs mb-2">
              {assignedZones.length === 0 ? t.staffZonesAll : `${assignedZones.length} selected`}
            </p>
            <div className="flex flex-wrap gap-2">
              {zones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => toggleZone(zone.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    assignedZones.includes(zone.id)
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-white/5 border-white/10 text-white/50'
                  }`}
                >
                  {zone.name}
                </button>
              ))}
            </div>
          </div>

          {!isNew && (
            <div className="flex items-center justify-between py-2">
              <span className="text-white/60 text-sm">{t.staffActive}</span>
              <Toggle checked={isActive} onChange={setIsActive} />
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-white/20 text-white/60 font-semibold"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50"
          >
            {mutation.isPending ? t.saving : t.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function StaffAdmin() {
  const { accessToken, staff: currentStaff } = useAuthStore();
  const { t } = useI18n();
  const clubId = currentStaff?.clubId ?? '';
  const qc = useQueryClient();

  const [editingMember, setEditingMember] = useState<StaffMember | 'new' | null>(null);

  const { data: staffData, isLoading } = useQuery({
    queryKey: ['admin-staff', clubId],
    queryFn: () =>
      apiFetch<{ staff: StaffMember[] }>(
        `/api/v1/admin/clubs/${clubId}/staff`,
        {},
        accessToken ?? undefined
      ),
    enabled: !!clubId && !!accessToken,
  });

  const { data: zonesData } = useQuery({
    queryKey: ['staff-zones', clubId],
    queryFn: () =>
      apiFetch<{ zones: Zone[] }>(
        '/api/v1/staff/zones',
        {},
        accessToken ?? undefined
      ),
    enabled: !!clubId && !!accessToken,
  });

  const toggleActive = useMutation({
    mutationFn: ({ memberId, isActive }: { memberId: string; isActive: boolean }) =>
      apiFetch(
        `/api/v1/admin/clubs/${clubId}/staff/${memberId}`,
        { method: 'PATCH', body: JSON.stringify({ isActive }) },
        accessToken ?? undefined
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-staff', clubId] }),
  });

  const roleLabel = (role: string) => {
    if (role === 'admin') return t.roleAdmin;
    if (role === 'manager') return t.roleManager;
    return t.roleWaiter;
  };

  const members = staffData?.staff ?? [];
  const zones = zonesData?.zones ?? [];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-white/10 px-4 pt-safe-top">
        <div className="py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold">{t.staffAdmin}</h1>
          <button
            type="button"
            onClick={() => setEditingMember('new')}
            className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            {t.addStaff}
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 space-y-3 pb-24">
        {isLoading && (
          <div className="text-center text-white/30 py-16">{t.loading}</div>
        )}

        {!isLoading && members.length === 0 && (
          <div className="text-center text-white/30 py-16">{t.noStaff}</div>
        )}

        {members.map((member) => {
          const isSelf = member.id === currentStaff?.id;
          return (
            <div
              key={member.id}
              className={`bg-white/5 rounded-2xl p-4 border transition-colors ${
                member.is_active ? 'border-white/10' : 'border-white/5 opacity-50'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-base leading-tight">{member.display_name}</p>
                    <RoleBadge role={member.role} label={roleLabel(member.role)} />
                    {!member.is_active && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-white/40 border border-white/10">
                        {t.staffInactive}
                      </span>
                    )}
                    {isSelf && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-white/40 text-sm mt-0.5">{member.email}</p>
                  {member.assigned_zones.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {member.assigned_zones.map((zId) => {
                        const zone = zones.find((z) => z.id === zId);
                        return (
                          <span key={zId} className="text-xs bg-white/10 px-2 py-0.5 rounded text-white/50">
                            {zone?.name ?? zId.slice(0, 8)}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-white/20 text-xs mt-2">{t.staffZonesAll}</p>
                  )}
                  <p className="text-white/20 text-xs mt-1">
                    {t.staffLastLogin}: {formatDate(member.last_login_at)}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-3">
                  {!isSelf && (
                    <Toggle
                      checked={member.is_active}
                      onChange={(v) => toggleActive.mutate({ memberId: member.id, isActive: v })}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingMember(member)}
                    className="text-white/40 hover:text-white text-sm px-3 py-1.5 rounded-lg bg-white/5 border border-white/10"
                  >
                    {t.editStaff}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </main>

      {editingMember !== null && (
        <EditStaffModal
          member={editingMember === 'new' ? null : editingMember}
          zones={zones}
          clubId={clubId}
          token={accessToken ?? ''}
          onClose={() => setEditingMember(null)}
        />
      )}
    </div>
  );
}
