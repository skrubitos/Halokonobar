import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store.js';
import { apiFetch } from '../utils/api.js';
import type { StaffLoginResponse } from '@halokonobar/types';
import { Button } from '@halokonobar/ui';

export function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<StaffLoginResponse>('/api/v1/staff/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.staff);
      navigate('/orders', { replace: true });
    },
  });

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🍸</div>
          <h1 className="text-white text-2xl font-bold">Staff Login</h1>
          <p className="text-white/50 mt-1">Halokonobar</p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="space-y-4"
        >
          <div>
            <label className="text-white/60 text-sm block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoCapitalize="none"
              autoComplete="email"
              className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3.5 text-base focus:outline-none focus:border-indigo-500 placeholder-white/30"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="text-white/60 text-sm block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3.5 text-base focus:outline-none focus:border-indigo-500 placeholder-white/30"
              placeholder="••••••••"
            />
          </div>

          {mutation.isError && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm">
              {(mutation.error as { message?: string })?.message ?? 'Login failed'}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={mutation.isPending}
          >
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
