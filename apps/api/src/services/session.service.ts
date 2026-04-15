import { webcrypto } from 'node:crypto';
import { getPool } from '@halokonobar/db';
import { getRedis } from '@halokonobar/db';
import type { NfcTapResponse } from '@halokonobar/types';
import { NotFoundError, AppError } from '../errors.js';

const SESSION_TTL_HOURS = 8;
const NFC_LOCK_TTL_SECONDS = 30;
const DEVICE_FP_RECENT_TTL_SECONDS = 1800; // 30 minutes

interface TapOptions {
  tagUid: string;
  deviceFp: string;
  ipAddress: string;
  source: 'nfc' | 'qr';
}

export async function handleNfcTap(opts: TapOptions): Promise<NfcTapResponse> {
  const { tagUid, deviceFp, ipAddress } = opts;
  const pool = getPool();
  const redis = getRedis();

  // 1. Validate tag exists and is active
  const { rows: tagRows } = await pool.query(
    `SELECT t.id, t.club_id, t.zone_id, t.tag_label, t.is_active,
            z.name as zone_name, z.zone_type,
            c.id as club_id_check, c.name as club_name, c.slug as club_slug, c.settings as club_settings
     FROM nfc_tags t
     JOIN zones z ON z.id = t.zone_id
     JOIN clubs c ON c.id = t.club_id
     WHERE t.tag_uid = $1`,
    [tagUid]
  );

  if (!tagRows[0]) throw new NotFoundError('TAG_NOT_FOUND', `NFC tag '${tagUid}' not found`);
  const tag = tagRows[0];
  if (!tag.is_active) throw new AppError(403, 'TAG_INACTIVE', 'This NFC tag is not active');

  // 2. Check 30-second dedup lock (handles rapid/simultaneous taps)
  const lockKey = `nfc_session_lock:${tagUid}`;
  const lockedToken = await redis.get(lockKey);
  if (lockedToken) {
    return buildTapResponse(pool, lockedToken, tag, true);
  }

  // 3. Check returning device fingerprint (same device, within 30 minutes)
  const fpKey = `device_fp:${deviceFp}:recent_session`;
  const recentToken = await redis.get(fpKey);
  if (recentToken) {
    // Verify it's for the same club
    const { rows: existing } = await pool.query(
      `SELECT id FROM sessions WHERE session_token = $1 AND club_id = $2 AND expires_at > now()`,
      [recentToken, tag.club_id]
    );
    if (existing[0]) {
      await redis.set(lockKey, recentToken, 'EX', NFC_LOCK_TTL_SECONDS);
      return buildTapResponse(pool, recentToken, tag, true);
    }
  }

  // 4. Create new session
  const sessionToken = Array.from(webcrypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();

  // Determine priority from zone type
  const priority = tag.zone_type === 'vip' ? 'vip' : 'normal';

  const { rows: [session] } = await pool.query(
    `INSERT INTO sessions (session_token, club_id, zone_id, nfc_tag_id, device_fp, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6::inet, $7)
     RETURNING id`,
    [sessionToken, tag.club_id, tag.zone_id, tag.id, deviceFp, ipAddress, expiresAt]
  );

  // 5. Cache session in Redis
  const sessionPayload = {
    id: session.id as string,
    clubId: tag.club_id as string,
    zoneId: tag.zone_id as string,
    nfcTagId: tag.id as string,
    expiresAt,
  };
  const ttlSeconds = SESSION_TTL_HOURS * 3600;
  await redis.set(`session:${sessionToken}`, JSON.stringify(sessionPayload), 'EX', ttlSeconds);

  // 6. Set dedup lock and device fingerprint cache
  await redis.set(lockKey, sessionToken, 'EX', NFC_LOCK_TTL_SECONDS);
  await redis.set(fpKey, sessionToken, 'EX', DEVICE_FP_RECENT_TTL_SECONDS);

  // 7. Update tap stats (fire and forget)
  pool.query(
    `UPDATE nfc_tags SET last_tapped_at = now(), tap_count = tap_count + 1 WHERE id = $1`,
    [tag.id]
  ).catch(console.error);

  return {
    sessionToken,
    expiresAt,
    isReturning: false,
    club: {
      id: tag.club_id as string,
      name: tag.club_name as string,
      slug: tag.club_slug as string,
      settings: tag.club_settings as NfcTapResponse['club']['settings'],
    },
    zone: {
      id: tag.zone_id as string,
      name: tag.zone_name as string,
      zoneType: tag.zone_type as NfcTapResponse['zone']['zoneType'],
    },
    tag: {
      id: tag.id as string,
      tagLabel: tag.tag_label as string,
    },
  };
}

async function buildTapResponse(
  pool: ReturnType<typeof getPool>,
  token: string,
  tag: Record<string, unknown>,
  isReturning: boolean
): Promise<NfcTapResponse> {
  const { rows: [s] } = await pool.query(
    `SELECT expires_at FROM sessions WHERE session_token = $1`,
    [token]
  );

  return {
    sessionToken: token,
    expiresAt: (s?.expires_at as string) ?? new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    isReturning,
    club: {
      id: tag['club_id'] as string,
      name: tag['club_name'] as string,
      slug: tag['club_slug'] as string,
      settings: tag['club_settings'] as NfcTapResponse['club']['settings'],
    },
    zone: {
      id: tag['zone_id'] as string,
      name: tag['zone_name'] as string,
      zoneType: tag['zone_type'] as NfcTapResponse['zone']['zoneType'],
    },
    tag: {
      id: tag['id'] as string,
      tagLabel: tag['tag_label'] as string,
    },
  };
}
