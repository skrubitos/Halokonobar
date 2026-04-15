import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store.js';
import { useI18n } from '../i18n/context.js';
import { apiFetch } from '../utils/api.js';

// ─── Local types (snake_case from DB) ────────────────────────────────────────

interface NfcTagRow {
  id: string;
  zone_id: string;
  zone_name: string;
  zone_type: string;
  tag_uid: string;
  tag_label: string;
  is_active: boolean;
  tap_count: number;
  last_tapped_at: string | null;
  qr_fallback_url: string | null;
}

interface ZoneRow {
  id: string;
  name: string;
  zoneType: string;
  activeOrderCount: number;
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
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

// ─── Table modal (add / edit) ─────────────────────────────────────────────────

function TableModal({
  tag,
  zones,
  clubId,
  token,
  onClose,
}: {
  tag: NfcTagRow | null;
  zones: ZoneRow[];
  clubId: string;
  token: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const isNew = tag === null;

  const [label, setLabel] = useState(tag?.tag_label ?? '');
  const [zoneId, setZoneId] = useState(tag?.zone_id ?? zones[0]?.id ?? '');
  const [uid, setUid] = useState(tag?.tag_uid ?? '');
  const [isActive, setIsActive] = useState(tag?.is_active ?? true);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (!label.trim()) throw new Error(t.labelRequired);
      if (isNew && !uid.trim()) throw new Error(t.uidRequired);

      if (isNew) {
        return apiFetch(
          `/api/v1/admin/clubs/${clubId}/nfc-tags`,
          {
            method: 'POST',
            body: JSON.stringify({ zoneId, tagUid: uid.trim(), tagLabel: label.trim() }),
          },
          token
        );
      } else {
        return apiFetch(
          `/api/v1/admin/clubs/${clubId}/nfc-tags/${tag!.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ tagLabel: label.trim(), zoneId, isActive }),
          },
          token
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-nfc-tags', clubId] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const ZONE_EMOJI: Record<string, string> = {
    vip: '⭐', bar: '🍸', terrace: '🌿', standard: '🪑',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-safe-bottom">
      <div className="w-full max-w-lg bg-gray-900 rounded-2xl border border-white/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-lg font-bold">
            {isNew ? t.newTable : t.editTable}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Label */}
        <div>
          <label className="text-white/60 text-sm block mb-1">{t.tableLabel} *</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t.tableLabelPlaceholder}
            className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Zone */}
        <div>
          <label className="text-white/60 text-sm block mb-1">{t.tableZone}</label>
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            title={t.tableZone}
            className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id} className="bg-gray-900">
                {ZONE_EMOJI[z.zoneType] ?? '🪑'} {z.name}
              </option>
            ))}
          </select>
        </div>

        {/* NFC UID — only on create */}
        {isNew && (
          <div>
            <label className="text-white/60 text-sm block mb-1">{t.tableTagUid} *</label>
            <input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder={t.tableTagUidPlaceholder}
              className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <p className="text-white/30 text-xs mt-1">{t.tableTagUidHelp}</p>
          </div>
        )}

        {/* Active toggle — only on edit */}
        {!isNew && (
          <div className="flex items-center justify-between py-2">
            <span className="text-white/60 text-sm">{t.tableActive}</span>
            <Toggle checked={isActive} onChange={setIsActive} />
          </div>
        )}

        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
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

// ─── TablesAdmin ──────────────────────────────────────────────────────────────

export function TablesAdmin() {
  const { accessToken, staff } = useAuthStore();
  const { t } = useI18n();
  const clubId = staff?.clubId ?? '';
  const [editing, setEditing] = useState<NfcTagRow | 'new' | null>(null);

  const { data: tagsData, isLoading } = useQuery({
    queryKey: ['admin-nfc-tags', clubId],
    queryFn: () =>
      apiFetch<{ tags: NfcTagRow[] }>(
        `/api/v1/admin/clubs/${clubId}/nfc-tags`,
        {},
        accessToken ?? undefined
      ),
    enabled: !!clubId && !!accessToken,
  });

  const { data: zonesData } = useQuery({
    queryKey: ['staff-zones'],
    queryFn: () =>
      apiFetch<{ zones: ZoneRow[] }>('/api/v1/staff/zones', {}, accessToken ?? undefined),
    enabled: !!accessToken,
  });

  const tags = tagsData?.tags ?? [];
  const zones = zonesData?.zones ?? [];

  // Group tags by zone
  const grouped = tags.reduce<Record<string, NfcTagRow[]>>((acc, tag) => {
    const key = tag.zone_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(tag);
    return acc;
  }, {});

  const ZONE_EMOJI: Record<string, string> = {
    vip: '⭐', bar: '🍸', terrace: '🌿', standard: '🪑',
  };

  function fmtDate(iso: string | null) {
    if (!iso) return t.never;
    return new Date(iso).toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-white/10 px-4 py-4 pt-safe-top flex items-center justify-between">
        <h1 className="text-lg font-bold">{t.tablesAdmin}</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          {t.addTable}
        </button>
      </header>

      <main className="flex-1 px-4 py-4 pb-24 space-y-6">
        {isLoading && (
          <div className="text-center py-16 text-white/40">{t.loading}</div>
        )}

        {!isLoading && tags.length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🪑</div>
            <p className="text-white/40">{t.noTables}</p>
          </div>
        )}

        {Object.entries(grouped).map(([zoneName, zoneTags]) => {
          const zoneType = zoneTags[0]?.zone_type ?? 'standard';
          return (
            <section key={zoneName}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{ZONE_EMOJI[zoneType] ?? '🪑'}</span>
                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">
                  {zoneName}
                </h2>
                <span className="text-white/20 text-xs">({zoneTags.length})</span>
              </div>

              <div className="space-y-2">
                {zoneTags.map((tag) => (
                  <div
                    key={tag.id}
                    className={`bg-white/5 rounded-2xl border px-4 py-3 flex items-center justify-between gap-4 transition-colors ${
                      tag.is_active ? 'border-white/10' : 'border-white/5 opacity-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {!tag.is_active && (
                          <span className="text-xs bg-white/10 text-white/40 px-2 py-0.5 rounded-full">
                            off
                          </span>
                        )}
                        <p className="font-semibold text-white">{tag.tag_label}</p>
                      </div>
                      <p className="text-white/30 text-xs mt-0.5 font-mono">{tag.tag_uid}</p>
                      <p className="text-white/25 text-xs mt-0.5">
                        {tag.tap_count} {t.tapCount} · {t.lastScan}: {fmtDate(tag.last_tapped_at)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditing(tag)}
                      className="flex-shrink-0 text-white/40 hover:text-white text-sm px-3 py-2 rounded-lg bg-white/5 border border-white/10"
                    >
                      {t.editTable}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </main>

      {editing !== null && (
        <TableModal
          tag={editing === 'new' ? null : editing}
          zones={zones}
          clubId={clubId}
          token={accessToken ?? ''}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
