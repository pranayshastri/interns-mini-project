'use client';
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { accountRequest, AccountError } from '../lib/graphql-client';
import { liveAdapter } from '../lib/live-adapter';
import type { Config, CommerceAdapter, User } from '../lib/contracts';

type AppContext = { config: Config; adapter: CommerceAdapter | null; user: User | null; authLoading: boolean; authError: string; refreshUser: (required?: boolean) => Promise<void>; logout: () => Promise<void>; privateVersion: number };
const Context = createContext<AppContext | null>(null);
export function Providers({ config, children }: { config: Config; children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(config.auth);
  const [authError, setAuthError] = useState('');
  const [adapter] = useState<CommerceAdapter>(() => liveAdapter(config));
  const [privateVersion, setPrivateVersion] = useState(0);
  const identity = useRef<User | null>(null);
  const expire = useCallback(() => {
    // Only remount private screens when an authenticated identity actually expires.
    // An incorrect password must leave the sign-in form and its error visible.
    const hadIdentity = identity.current !== null;
    identity.current = null; setUser(null);
    if (hadIdentity) setPrivateVersion(v => v + 1);
  }, []);
  const refreshUser = useCallback(async (required = false) => {
    if (!config.auth) return;
    try { const data = await accountRequest<{ me: User }>('query { me { id fullName email role shopId phone } }'); identity.current = data.me; setUser(data.me); setAuthError(''); }
    catch (e) { expire(); setAuthError(e instanceof AccountError && e.code === 'UNAUTHENTICATED' ? '' : e instanceof Error ? e.message : 'Unable to load your account.'); if (required) throw e; }
    finally { setAuthLoading(false); }
  }, [config, expire]);
  useEffect(() => {
    let cancelled = false;
    // Initial account synchronization is async; the loading state is initialized above.
    void Promise.resolve().then(() => { if (!cancelled) return refreshUser(); });
    window.addEventListener('robonest:expired', expire);
    return () => { cancelled = true; window.removeEventListener('robonest:expired', expire); };
  }, [config, expire, refreshUser]);

  async function logout() {
    await accountRequest('mutation { logout }');
    expire();
  }
  return <Context.Provider value={{ config, adapter, user, authLoading, authError, refreshUser, logout, privateVersion }}>{children}</Context.Provider>;
}
export function useApp() { const value = useContext(Context); if (!value) throw new Error('Missing app provider'); return value; }
