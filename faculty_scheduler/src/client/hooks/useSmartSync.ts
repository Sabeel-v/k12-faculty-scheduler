import { useEffect, useRef } from 'react';
import { api } from '../lib/api';

interface UseSmartSyncOptions {
  facultyId?: number | null;
  onSyncNeeded: () => void | Promise<void>;
  enabled?: boolean;
  activeIntervalMs?: number; // default: 25000ms (25s)
  idleIntervalMs?: number;   // default: 90000ms (90s)
  idleTimeoutMs?: number;    // default: 180000ms (3 mins)
}

/**
 * useSmartSync:
 * Provides battery and quota-friendly real-time sync with Cloudflare Workers.
 *
 * 1. Checks tiny /api/sync/version (~50 bytes) instead of downloading heavy full schedules.
 * 2. Only calls `onSyncNeeded()` when the version token has actually changed.
 * 3. Pauses polling completely when tab/PWA is hidden or backgrounded.
 * 4. Backs off from 25s to 90s when the user is idle (>3m without input).
 * 5. Immediately performs a fast version check whenever the tab is focused or returns from background.
 */
export function useSmartSync({
  facultyId,
  onSyncNeeded,
  enabled = true,
  activeIntervalMs = 25000,
  idleIntervalMs = 90000,
  idleTimeoutMs = 180000
}: UseSmartSyncOptions) {
  const lastVersionRef = useRef<string | null>(null);
  const timerRef = useRef<any>(null);
  const isIdleRef = useRef<boolean>(false);
  const lastActivityRef = useRef<number>(Date.now());
  const onSyncNeededRef = useRef(onSyncNeeded);
  onSyncNeededRef.current = onSyncNeeded;

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    let isMounted = true;

    // Fast check: inspect version fingerprint
    const checkVersion = async () => {
      try {
        const data = await api.getSyncVersion(facultyId ?? undefined);
        if (!isMounted) return;

        if (lastVersionRef.current === null) {
          // Store initial baseline version
          lastVersionRef.current = data.version;
        } else if (lastVersionRef.current !== data.version) {
          // Version changed! Trigger update callback
          lastVersionRef.current = data.version;
          await onSyncNeededRef.current();
        }
      } catch (err) {
        // Silently tolerate network drops
        console.warn('Sync version check failed:', err);
      }
    };

    const scheduleNext = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!isMounted) return;

      // Don't poll at all if tab is hidden
      if (document.visibilityState === 'hidden') return;

      // Check if user has become idle
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      isIdleRef.current = timeSinceActivity > idleTimeoutMs;

      const delay = isIdleRef.current ? idleIntervalMs : activeIntervalMs;

      timerRef.current = setTimeout(async () => {
        if (document.visibilityState === 'visible' && isMounted) {
          await checkVersion();
        }
        scheduleNext();
      }, delay);
    };

    // User activity listeners to switch between active & idle states
    const onUserActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdleRef.current) {
        isIdleRef.current = false;
        // User woke up, trigger immediate check and resume fast polling
        checkVersion();
        scheduleNext();
      }
    };

    // Visibility & focus handlers
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastActivityRef.current = Date.now();
        isIdleRef.current = false;
        checkVersion();
        scheduleNext();
      } else {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        lastActivityRef.current = Date.now();
        isIdleRef.current = false;
        checkVersion();
        scheduleNext();
      }
    };

    // Initial version baseline check and start schedule
    checkVersion();
    scheduleNext();

    // Attach listeners
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('mousemove', onUserActivity, { passive: true });
    window.addEventListener('keydown', onUserActivity, { passive: true });
    window.addEventListener('touchstart', onUserActivity, { passive: true });

    return () => {
      isMounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('mousemove', onUserActivity);
      window.removeEventListener('keydown', onUserActivity);
      window.removeEventListener('touchstart', onUserActivity);
    };
  }, [enabled, facultyId, activeIntervalMs, idleIntervalMs, idleTimeoutMs]);

  return {
    resetVersionBaseline: () => {
      lastVersionRef.current = null;
    }
  };
}
