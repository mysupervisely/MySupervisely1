import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { accessService, grantsPlan } from '../services/accessService';
import type { AccessPlan, AccessState } from '../models/access';

/**
 * M9 — the one hook every screen uses to read/act on entitlement state;
 * "expose access state to the UI" from the AccessService's own
 * responsibility list. Screens never call `accessService` methods
 * directly except through this hook (or `PremiumGate`, which itself
 * uses this hook) — "do not scatter entitlement checks throughout
 * screens."
 *
 * Loads the cached state immediately (fast first render, no network
 * wait), then refreshes against the network on mount and on focus —
 * same pattern as every other focus-refreshing hook in this app
 * (useProgressDashboard, useStudyRecommendations, etc.), so returning to
 * a gated screen after e.g. redeeming access on the Pricing tab reflects
 * the new state without a manual reload.
 */
export function useAccessState() {
  const [state, setState] = useState<AccessState | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadCached = useCallback(() => {
    let cancelled = false;
    accessService.getState().then((cached) => {
      if (!cancelled) setState(cached);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const next = await accessService.refresh();
      setState(next);
      return next;
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => loadCached(), [loadCached]);
  useFocusEffect(
    useCallback(() => {
      refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is stable (useCallback, no deps); only re-run on focus
    }, [])
  );

  const verifyToken = useCallback(async (token: string) => {
    const outcome = await accessService.verifyToken(token);
    if (outcome.ok) setState(outcome.state);
    return outcome;
  }, []);

  const redeemStripeSession = useCallback(async (sessionId: string) => {
    const outcome = await accessService.redeemStripeSession(sessionId);
    if (outcome.ok) setState(outcome.state);
    return outcome;
  }, []);

  const clearAccess = useCallback(async () => {
    await accessService.clearAccess();
    setState({ status: 'none' });
  }, []);

  const hasAccess = useCallback(
    (requiredPlan: AccessPlan): boolean => {
      return state?.status === 'granted' && grantsPlan(state.record, requiredPlan);
    },
    [state]
  );

  return {
    isLoading: state === null,
    isRefreshing,
    state,
    hasAccess,
    refresh,
    verifyToken,
    redeemStripeSession,
    clearAccess,
  };
}
