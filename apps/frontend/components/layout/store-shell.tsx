'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useApp } from '../providers';
import { useCart } from '../../features/cart/cart-provider';
import { Icon } from './icons';
import { internalPath, type Notice } from '../../lib/contracts';
import { useResource } from '../feedback/states';
function NotificationBell() {
  const { adapter, user, privateVersion } = useApp();
  const load = useCallback(() => adapter!.notifications(), [adapter]);
  const resource = useResource<Notice[]>(load, !!adapter && !!user);
  const [open, setOpen] = useState(false);
  useEffect(() => { window.addEventListener('robonest:notifications', resource.reload); return () => window.removeEventListener('robonest:notifications', resource.reload); }, [resource.reload]);
  const notices = user && privateVersion >= 0 ? resource.data || [] : [];
  return <div className="notification-menu"><button className="icon-button" aria-label={`Notifications${notices.length ? `, ${notices.filter(n => !n.read).length} unread` : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="bell"/>{notices.some(n => !n.read) && <span className="notification-dot"/>}</button>{open && <div className="notification-popover" onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}><strong>Notifications</strong>{user ? <>{resource.error ? <p className="muted">Updates are unavailable right now.</p> : notices.slice(0, 3).map(n => <Link key={n.id} href={internalPath(n.href, '/notifications')} onClick={() => setOpen(false)}>{n.title}</Link>)}<Link href={user.role === 'SHOPKEEPER' ? '/seller/notifications' : '/notifications'} onClick={() => setOpen(false)}>View all updates →</Link></> : <Link href="/login" onClick={() => setOpen(false)}>Sign in to see your updates</Link>}</div>}</div>;
}
export function StoreShell({ children }: { children: ReactNode }) {
  const { user, privateVersion } = useApp(); const { count } = useCart(); const pathname = usePathname(); const router = useRouter();
  const [search, setSearch] = useState('');
  function submit(e: FormEvent) { e.preventDefault(); router.push(`/products?q=${encodeURIComponent(search.trim())}`); }
  const seller = pathname.startsWith('/seller');
  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/admin-preview') return <><a className="skip-link" href="#main-content">Skip to content</a><main id="main-content" key={privateVersion}>{children}</main></>;
  if (['/login', '/signup', '/profile'].includes(pathname)) return <div className="auth-layout"><a className="skip-link" href="#main-content">Skip to content</a><header className="auth-header"><Link className="brand" href="/login">robonest.</Link><span>Your account</span></header><main id="main-content" className="auth-main" key={privateVersion}>{children}</main><footer className="auth-footer">RoboNest account access</footer></div>;

  return <><a className="skip-link" href="#main-content">Skip to content</a>
  <header className="site-header"><div className="header-inner"><Link className="brand" href="/"><span className="brand-icon"><Icon name="bag" size={22}/></span>robonest<span className="brand-period">.</span></Link><form className="header-search" role="search" onSubmit={submit}><Icon name="search"/><input aria-label="Search products" placeholder="Search electronics and robotics components" value={search} onChange={e => setSearch(e.target.value)}/><button aria-label="Submit search"><Icon name="arrow" size={18}/></button></form><div className="header-actions"><Link className="account-link" href="/profile"><Icon name="user"/><span>{user ? user.fullName.split(' ')[0] : 'Account'}</span></Link><NotificationBell key={`${user?.id || 'guest'}-${privateVersion}`}/><Link className="header-bag button" href="/cart"><Icon name="bag"/><span>My bag</span><span className="cart-count">{count}</span></Link></div></div></header>
  {!seller && <nav className="store-nav" aria-label="Store navigation"><div className="container"><Link href="/products"><Icon name="grid" size={17}/> Shop all</Link><span className="nav-spacer"/>{user?.role === 'SHOPKEEPER' ? <Link href="/seller">Seller workspace →</Link> : user?.role === 'ADMIN' ? <Link href="/admin">Admin workspace →</Link> : <Link href="/orders">Your orders</Link>}</div></nav>}
  <main id="main-content" className={seller ? 'container main-content seller-container' : 'container main-content'} key={privateVersion}>{children}</main>
  <footer className="site-footer container"><div><Link className="brand" href="/">robonest.</Link><p>Electronics and robotics components.</p></div><div><Link href="/products">Explore the store</Link><Link href="/profile">Your account</Link><Link href="/billing">Billing & invoices</Link></div><p className="small">RoboNest · All prices shown in INR.</p></footer>
  {count > 0 && !['/cart', '/checkout', '/checkout/result'].includes(pathname) && <Link className="mobile-cart" href="/cart"><span><Icon name="bag"/> {count} {count === 1 ? 'item' : 'items'} in your bag</span><strong>View bag →</strong></Link>}
  <nav className="mobile-nav" aria-label="Mobile navigation">{[['/', 'home', 'Home'], ['/products', 'grid', 'Browse'], ['/orders', 'box', 'Orders'], ['/profile', 'user', 'Account']].map(([href, icon, label]) => <Link key={href} href={href!} aria-current={pathname === href ? 'page' : undefined}><Icon name={icon!}/>{label}</Link>)}</nav></>;
}
