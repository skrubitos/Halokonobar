import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { getSubscriber } from '@halokonobar/db';
import type { WsClientMessage } from '@halokonobar/types';
import { verifySessionToken, verifyStaffToken } from './auth.js';

// Map: clubId → Set of connected WebSocket clients (with metadata)
interface WsClient {
  ws: WebSocket;
  type: 'customer' | 'staff';
  clubId: string;
  sessionId?: string;
  staffId?: string;
}

const clients = new Map<string, Set<WsClient>>();

function addClient(clubId: string, client: WsClient) {
  if (!clients.has(clubId)) clients.set(clubId, new Set());
  clients.get(clubId)!.add(client);
}

function removeClient(clubId: string, client: WsClient) {
  clients.get(clubId)?.delete(client);
}

/** Publish an event to all staff clients in a club */
export function broadcastToStaff(clubId: string, event: object) {
  const payload = JSON.stringify(event);
  clients.get(clubId)?.forEach((c) => {
    if (c.type === 'staff' && c.ws.readyState === 1 /* OPEN */) {
      c.ws.send(payload);
    }
  });
}

/** Publish an event to a specific customer session */
export function broadcastToSession(clubId: string, sessionId: string, event: object) {
  const payload = JSON.stringify(event);
  clients.get(clubId)?.forEach((c) => {
    if (c.type === 'customer' && c.sessionId === sessionId && c.ws.readyState === 1) {
      c.ws.send(payload);
    }
  });
}

/** Publish a menu update to all customers in a club */
export function broadcastMenuUpdate(clubId: string, event: object) {
  const payload = JSON.stringify(event);
  clients.get(clubId)?.forEach((c) => {
    if (c.type === 'customer' && c.ws.readyState === 1) {
      c.ws.send(payload);
    }
  });
}

async function websocketPlugin(fastify: FastifyInstance) {
  await fastify.register(websocket, {
    options: { maxPayload: 4096 },
  });

  // Subscribe to Redis pub/sub for cross-instance fan-out
  const subscriber = getSubscriber();

  // Subscribe to all club-level channels using pattern
  await subscriber.psubscribe('club:*');

  subscriber.on('pmessage', (_pattern, channel, message) => {
    // channel = "club:{clubId}:orders" | "club:{clubId}:session:{sessionId}" | "club:{clubId}:menu"
    const parts = channel.split(':');
    const clubId = parts[1];
    if (!clubId) return;

    let event: object;
    try {
      event = JSON.parse(message) as object;
    } catch {
      return;
    }

    if (parts[2] === 'orders') {
      broadcastToStaff(clubId, event);
    } else if (parts[2] === 'session' && parts[3]) {
      broadcastToSession(clubId, parts[3], event);
    } else if (parts[2] === 'menu') {
      broadcastMenuUpdate(clubId, event);
    }
  });

  // WebSocket endpoint
  fastify.get('/ws', { websocket: true }, (socket, _req) => {
    let client: WsClient | null = null;

    const pingInterval = setInterval(() => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }
    }, 30_000);

    socket.on('message', async (rawData) => {
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(rawData.toString()) as WsClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'auth') {
        // Try customer session token first, then staff JWT
        const session = await verifySessionToken(fastify, msg.token);
        if (session) {
          client = {
            ws: socket,
            type: 'customer',
            clubId: session.clubId,
            sessionId: session.id,
          };
          addClient(session.clubId, client);
          socket.send(
            JSON.stringify({
              type: 'auth_ok',
              subscribedChannels: [
                `club:${session.clubId}:session:${session.id}`,
                `club:${session.clubId}:menu`,
              ],
            })
          );
          return;
        }

        const staff = await verifyStaffToken(fastify, msg.token);
        if (staff) {
          client = {
            ws: socket,
            type: 'staff',
            clubId: staff.clubId,
            staffId: staff.sub,
          };
          addClient(staff.clubId, client);
          socket.send(
            JSON.stringify({
              type: 'auth_ok',
              subscribedChannels: [`club:${staff.clubId}:orders`],
            })
          );
          return;
        }

        socket.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }));
        return;
      }

      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }
    });

    socket.on('close', () => {
      clearInterval(pingInterval);
      if (client) removeClient(client.clubId, client);
    });

    socket.on('error', (err) => {
      console.error('WebSocket error:', err);
      clearInterval(pingInterval);
      if (client) removeClient(client.clubId, client);
    });
  });
}

export default fp(websocketPlugin, { name: 'websocket' });
