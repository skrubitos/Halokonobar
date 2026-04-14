import { useEffect, useRef, useCallback } from 'react';
import type { WsEvent } from '@halokonobar/types';

const WS_URL = import.meta.env['VITE_WS_URL'] ?? 'ws://localhost:3000';

interface UseWebSocketOptions {
  token: string | null;
  onEvent: (event: WsEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useWebSocket({ token, onEvent, onConnect, onDisconnect }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const shouldConnectRef = useRef(false);

  const connect = useCallback(() => {
    if (!token || !shouldConnectRef.current) return;

    const ws = new WebSocket(`${WS_URL}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptsRef.current = 0;
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = (evt) => {
      let msg: { type?: string; event?: string; payload?: unknown };
      try {
        msg = JSON.parse(evt.data as string) as typeof msg;
      } catch {
        return;
      }

      if (msg.type === 'auth_ok') { onConnect?.(); return; }
      if (msg.type === 'pong') return;
      if (msg.event) onEvent(msg as unknown as WsEvent);
    };

    ws.onclose = () => {
      onDisconnect?.();
      if (!shouldConnectRef.current) return;
      const delay = Math.min(500 * Math.pow(2, attemptsRef.current) + Math.random() * 1000, 30_000);
      attemptsRef.current++;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  }, [token, onEvent, onConnect, onDisconnect]);

  useEffect(() => {
    if (!token) return;
    shouldConnectRef.current = true;
    connect();
    return () => {
      shouldConnectRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [token, connect]);
}
