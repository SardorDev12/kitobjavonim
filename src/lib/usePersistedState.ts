import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useState that survives a page refresh or an app restart: the value is read
 * from storage once on mount and written back whenever it changes (AsyncStorage
 * is localStorage on web). Whatever comes back from storage goes through
 * `parse`, which returns the value to use or null to ignore it — old or
 * malformed data must never break the screen. Nothing is written until the
 * stored value has been read, so the default can't overwrite it.
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
  parse: (stored: unknown) => T | null,
  serialize: (value: T) => unknown = (value) => value
): [T, (value: T | ((previous: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const parseRef = useRef(parse);
  parseRef.current = parse;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled || raw === null) return;
        try {
          const parsed = parseRef.current(JSON.parse(raw));
          if (parsed !== null) setValue(parsed);
        } catch {
          // Malformed storage — keep the default.
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const serializeRef = useRef(serialize);
  serializeRef.current = serialize;
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(key, JSON.stringify(serializeRef.current(value))).catch(() => {});
  }, [key, loaded, value]);

  const set = useCallback((next: T | ((previous: T) => T)) => setValue(next), []);
  return [value, set, loaded];
}
