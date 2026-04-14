import type { FastifyInstance } from 'fastify';
import { handleNfcTap } from '../services/session.service.js';
import crypto from 'node:crypto';

export async function nfcRoutes(fastify: FastifyInstance) {
  // GET /api/v1/nfc/:tag_uid
  fastify.get<{
    Params: { tag_uid: string };
    Querystring: { source?: 'nfc' | 'qr' };
  }>(
    '/nfc/:tag_uid',
    {
      schema: {
        params: {
          type: 'object',
          properties: { tag_uid: { type: 'string', minLength: 1, maxLength: 64 } },
          required: ['tag_uid'],
        },
      },
    },
    async (req, reply) => {
      // Normalize: strip colons, uppercase
      const rawUid = req.params.tag_uid;
      const tagUid = rawUid.replace(/:/g, '').toUpperCase();

      // Build device fingerprint from available request headers
      const fpInput = [
        req.headers['user-agent'] ?? '',
        req.headers['accept-language'] ?? '',
        req.ip,
      ].join('|');
      const deviceFp = crypto.createHash('sha256').update(fpInput).digest('hex');

      const result = await handleNfcTap({
        tagUid,
        deviceFp,
        ipAddress: req.ip,
        source: req.query.source ?? 'nfc',
      });

      return reply.send({ data: result, error: null });
    }
  );
}
