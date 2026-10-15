'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { accountRequest } from '../lib/graphql-client';
import { useApp } from './providers';
import { Guard } from './feedback/states';
import styles from '../app/page.module.css';
export function ProfileForm() { return <Guard><Profile/></Guard>; }
function Profile() {
  const { user, refreshUser, logout } = useApp(); const router = useRouter(); const [name, setName] = useState(user?.fullName || ''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  async function save(e: FormEvent) { e.preventDefault(); if (busy || !name.trim()) return; setBusy(true); setError(''); setNotice(''); try { await accountRequest('mutation($fullName:String!){updateProfile(fullName:$fullName){id fullName email role shopId}}', { fullName: name }); await refreshUser(true); setNotice('Your profile has been saved.'); } catch(e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); } }
  async function signOut() { if (busy) return; setBusy(true); setError(''); try { await logout(); router.replace('/login'); } catch(e) { setError(e instanceof Error ? e.message : 'Sign out failed. Please retry.'); } finally { setBusy(false); } }
  if (!user) return null;
  return <><h1>Your profile</h1><p className={styles.subtitle}>A little space for your account.</p><nav className="account-navigation" aria-label="Account navigation">{user.role === 'CUSTOMER' && <><Link href="/orders">Orders</Link><Link href="/billing">Billing</Link></>}<Link href="/notifications">Updates</Link>{user.role === 'SHOPKEEPER' && <Link href="/seller">Seller workspace</Link>}{user.role === 'ADMIN' && <Link href="/admin">Admin workspace</Link>}</nav>{error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.success}>{notice}</p>}<div className={styles.identity}><span className={styles.avatar} aria-hidden="true">{user.fullName.slice(0, 1)}</span><div><strong>{user.fullName}</strong><span>{user.role.toLowerCase()} account</span></div></div><form onSubmit={save} className={styles.form} aria-busy={busy}><div className={styles.field}><label htmlFor="fullName">Full name</label><input id="fullName" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required maxLength={128} disabled={busy}/></div><div className={styles.field}><label htmlFor="email">Email address</label><input id="email" type="email" value={user.email} readOnly/><p className={styles.hint}>Your account email cannot be changed here.</p></div><div className={styles.field}><label htmlFor="role">Account role</label><input id="role" value={user.role} readOnly/></div>{user.shopId && <div className={styles.field}><label htmlFor="shopId">Shop ID</label><input id="shopId" value={user.shopId} readOnly/></div>}<button className={styles.primary} disabled={busy || name.trim() === user.fullName}>{busy ? 'Please wait…' : 'Save changes'}</button></form><button className={styles.logout} onClick={signOut} disabled={busy}>Sign out</button></>;
}
