import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSessionStore } from '../store/session.store.js';
import { apiFetch } from '../utils/api.js';
import { useI18n } from '../i18n/context.js';
import type { NfcTapResponse } from '@halokonobar/types';
import { FullScreenSpinner } from '@halokonobar/ui';

type State = 'loading' | 'error';
type ErrorCode = 'TAG_NOT_FOUND' | 'TAG_INACTIVE' | 'NETWORK' | 'UNKNOWN';

export function NfcLanding() {
  const { tag_uid } = useParams<{ tag_uid: string }>();
  const navigate = useNavigate();
  const setSession = useSessionStore((s) => s.setSession);
  const { t } = useI18n();
  const [state, setState] = useState<State>('loading');
  const [errorCode, setErrorCode] = useState<ErrorCode>('UNKNOWN');

  useEffect(() => {
    if (!tag_uid) {
      setErrorCode('TAG_NOT_FOUND');
      setState('error');
      return;
    }

    apiFetch<NfcTapResponse>(`/api/v1/nfc/${tag_uid}?source=nfc`)
      .then((data) => {
        setSession(data);
        navigate('/menu', { replace: true });
      })
      .catch((err: { code?: string }) => {
        if (err.code === 'TAG_NOT_FOUND') setErrorCode('TAG_NOT_FOUND');
        else if (err.code === 'TAG_INACTIVE') setErrorCode('TAG_INACTIVE');
        else if (!navigator.onLine) setErrorCode('NETWORK');
        else setErrorCode('UNKNOWN');
        setState('error');
      });
  }, [tag_uid, navigate, setSession]);

  if (state === 'loading') return <FullScreenSpinner />;

  const title = {
    TAG_NOT_FOUND: t.tagNotFound,
    TAG_INACTIVE:  t.tagInactive,
    NETWORK:       t.noConnection,
    UNKNOWN:       t.somethingWentWrong,
  }[errorCode];

  const subtitle = {
    TAG_NOT_FOUND: t.tagNotFoundSub,
    TAG_INACTIVE:  t.tagInactiveSub,
    NETWORK:       t.noConnectionSub,
    UNKNOWN:       t.somethingWentWrongSub,
  }[errorCode];

  const emoji = {
    TAG_NOT_FOUND: '🔍',
    TAG_INACTIVE:  '🚫',
    NETWORK:       '📶',
    UNKNOWN:       '⚠️',
  }[errorCode];

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-6">{emoji}</div>
        <h1 className="text-white text-2xl font-bold mb-3">{title}</h1>
        <p className="text-white/60 text-base mb-8">{subtitle}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full bg-indigo-600 text-white font-semibold py-4 rounded-xl text-lg"
        >
          {t.tryAgain}
        </button>
      </div>
    </div>
  );
}
