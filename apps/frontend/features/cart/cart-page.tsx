'use client';
import { useCallback } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/providers';
import { useCart } from './cart-provider';
import { ProductImage, Quantity } from '../../components/commerce/product-card';
import { Empty, ErrorState, Loading, useResource } from '../../components/feedback/states';
import { money } from '../../lib/contracts';
export function CartPage() {
  const { adapter } = useApp(); const cart = useCart(); const load = useCallback(() => adapter!.products(), [adapter]); const { data, loading, error, reload } = useResource(load, !!adapter);
  if (!cart.ready || loading) return <Loading/>;
  if (!cart.items.length) return <Empty title="Your cart is empty" href="/products" action="Browse components">Products you add will appear here.</Empty>;
  if (error) return <ErrorState error={error} retry={reload}/>;
  const lines = cart.items.map(i => ({ ...i, product: data?.find(p => p.id === i.productId) })); const shops = [...new Set(lines.map(i => i.product?.seller || i.product?.shopId || 'Unavailable products'))]; const total = lines.reduce((s, i) => s + (i.product?.priceCents || 0) * i.quantity, 0); const invalid = lines.some(i => !i.product || i.quantity > i.product.availableStock);
  return <><div className="page-title"><div><span className="eyebrow">GOOD THINGS, ALL TOGETHER</span><h1>Your shopping bag <span className="muted">({cart.count})</span></h1></div><Link className="text-link" href="/products">Continue shopping ↗</Link></div><div className="two-column"><div className="stack">{shops.map(shop => <section className="panel cart-shop" key={shop}><h2>From {shop}</h2>{lines.filter(i => (i.product?.seller || i.product?.shopId || 'Unavailable products') === shop).map(i => <div className="cart-line" key={i.productId}>{i.product && <ProductImage product={i.product}/>}<div className="cart-line-info"><Link href={`/products/${encodeURIComponent(i.productId)}`}><h3>{i.product?.name || 'Product unavailable'}</h3></Link><p className="muted small">{i.product?.pack}</p>{(!i.product || i.quantity > i.product.availableStock) && <p className="danger small">Availability changed. Reduce the quantity or remove this item.</p>}<button className="text-button" onClick={() => cart.remove(i.productId)}>Remove</button></div><div className="cart-line-end"><strong>{money((i.product?.priceCents || 0) * i.quantity)}</strong>{i.product && <Quantity product={i.product}/>}</div></div>)}</section>)}</div><aside className="panel summary"><h2>Your bag at a glance</h2><div className="summary-line"><span>Items ({cart.count})</span><span>{money(total)}</span></div><p className="small muted">Delivery, discounts and tax will appear with your checkout quote.</p><hr/><div className="summary-line total"><span>Estimated subtotal</span><strong>{money(total)}</strong></div>{invalid ? <p role="alert" className="danger">Review unavailable items before checkout.</p> : <Link className="button full" href="/checkout">Continue to checkout →</Link>}<p className="small muted">Your bag is saved on this device. Final pricing is confirmed at checkout.</p></aside></div></>;
}
