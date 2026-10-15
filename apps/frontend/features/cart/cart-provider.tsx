'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CartItem, Product } from '../../lib/contracts';
type CartContext = { items: CartItem[]; ready: boolean; setQuantity: (p: Product, quantity: number) => void; remove: (id: string) => void; clear: () => void; message: string; count: number };
const Context = createContext<CartContext | null>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const key = 'robonest.cart.v1.live';
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    // Restore external browser storage after mount to preserve server/client hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { const raw: unknown = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(raw)) { const unique = new Map<string, CartItem>(); raw.slice(0, 100).forEach(i => { if (i && typeof i.productId === 'string' && i.productId.length <= 128 && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 999) unique.set(i.productId, { productId: i.productId, quantity: i.quantity }); }); setItems([...unique.values()]); } }
    catch { setMessage('Your saved bag could not be restored. You can start a new one.'); }
    setReady(true);
  }, [key]);
  useEffect(() => { if (ready) { try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* Browser storage is an external system; report its write failure. */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessage('Your bag is available in this tab, but could not be saved on this device.'); } } }, [items, key, ready]);
  function setQuantity(p: Product, quantity: number) { if (!ready || !Number.isInteger(quantity)) return; const q = Math.min(Math.max(0, quantity), p.availableStock, 999); setItems(items => [...items.filter(i => i.productId !== p.id), ...(q ? [{ productId: p.id, quantity: q }] : [])]); setMessage(`${p.name}: ${q ? `${q} in your bag` : 'removed from your bag'}.`); }
  return <Context.Provider value={{ items, ready, setQuantity, remove: id => { setItems(items => items.filter(i => i.productId !== id)); setMessage('Item removed from your bag.'); }, clear: () => setItems([]), message, count: items.reduce((s, i) => s + i.quantity, 0) }}>{children}<span className="sr-only" role="status" aria-live="polite">{message}</span></Context.Provider>;
}
export function useCart() { const value = useContext(Context); if (!value) throw new Error('Missing cart provider'); return value; }
