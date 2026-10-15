'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useApp } from '../providers';
import { AccountError } from '../../lib/graphql-client';
import { errorMessage } from '../../lib/contracts';
export function Empty({ title, children, href, action }: { title: string; children?: ReactNode; href?: string; action?: string }) { return <div className="empty panel"><span className="empty-symbol" aria-hidden="true">◇</span><h2>{title}</h2><div className="muted">{children}</div>{href && <Link className="button" href={href}>{action || 'Continue shopping'}</Link>}</div>; }
export function ErrorState({ error, retry }: { error: string; retry?: () => void }) { return <div className="error-panel" role="alert"><strong>We couldn’t finish that</strong><p>{error}</p>{retry && <button className="button secondary" onClick={retry}>Try again</button>}</div>; }
export function Loading() { return <div className="skeleton-grid" role="status" aria-label="Loading"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/><span className="sr-only">Loading…</span></div>; }
export function Status({ value }: { value: string }) { return <span className={`badge ${['CONFIRMED', 'captured'].includes(value) ? 'green' : ['CANCELLED', 'failed'].includes(value) ? 'red' : ''}`}>{value.replaceAll('-', ' ').toLowerCase()}</span>; }
export function Guard({ role, children }: { role?: string; children: ReactNode }) {
  const { user, authLoading, authError, refreshUser } = useApp();
  const pathname = usePathname(); const router = useRouter();
  useEffect(() => { if (!authLoading && !user && !authError) router.replace(pathname === '/profile' ? '/login' : `/login?returnTo=${encodeURIComponent(pathname)}`); }, [authLoading, user, authError, pathname, router]);
  if (authLoading) return <Loading/>;
  if (authError) return <ErrorState error={authError} retry={() => void refreshUser()}/>;
  if (!user) return <div className="empty panel"><h1>Make yourself at home</h1><p className="muted">Sign in to view your account and continue checkout.</p><Link className="button" href={`/login?returnTo=${encodeURIComponent(pathname)}`}>Sign in to continue</Link></div>;
  if (role && user.role !== role) return <Empty title="This space is for another account" href="/">Your account doesn’t have access to this page.</Empty>;
  if (role === 'SHOPKEEPER' && !user.shopId) return <Empty title="Your shop is not assigned yet">Ask your platform administrator to connect your account to a shop.</Empty>;
  return children;
}
export function useResource<T>(load: () => Promise<T>, enabled = true) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ load: typeof load; version: number; data: T | null; error: string } | null>(null);
  const reload = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void load().then(data => { if (active) setResult({ load, version, data, error: '' }); }).catch(e => {
      if (!active) return;
      if (e instanceof AccountError && e.code === 'UNAUTHENTICATED') window.dispatchEvent(new Event('robonest:expired'));
      setResult({ load, version, data: null, error: errorMessage(e) });
    });
    return () => { active = false; };
  }, [load, enabled, version]);
  const current = enabled && result?.load === load && result.version === version ? result : null;
  return { data: current?.data || null, error: current?.error || '', loading: !current, reload };
}
