import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../api.js';

export type AsyncState<T> =
  | { status: 'loading'; data?: T }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string; data?: T };

/**
 * Loads `fn()` on mount and whenever `deps` change; `reload()` refetches while keeping the last
 * data on screen. Ignores results from a superseded call so fast navigation never shows stale data.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const mine = ++generation.current;
    setState((s) => ({ status: 'loading', data: s.data }));
    fn().then(
      (data) => {
        if (generation.current === mine) setState({ status: 'ready', data });
      },
      (err: unknown) => {
        if (generation.current === mine) {
          setState((s) => ({ status: 'error', message: describeError(err), data: s.data }));
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
