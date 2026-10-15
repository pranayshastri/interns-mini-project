'use client';
import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/providers';
import { Empty, ErrorState, Guard, Loading, Status, useResource } from '../../components/feedback/states';
import { errorMessage } from '../../lib/contracts';
export function CheckoutPage() { return <Guard role="CUSTOMER"><Checkout/></Guard>; }
function Checkout() {
  return <Empty title="Checkout is currently unavailable" href="/cart" action="Back to your bag">Ordering and payments are not available yet. Your bag has not been submitted and no payment has been taken.</Empty>;
}
export function CheckoutResult({ orderId }: { orderId: string }) { return <Guard role="CUSTOMER"><Result orderId={orderId}/></Guard>; }
function Result({ orderId }: { orderId: string }) {
  const { adapter } = useApp(); const load = useCallback(() => adapter!.payment(orderId), [adapter, orderId]); const { data, error, loading, reload } = useResource(load, !!adapter && !!orderId); const lock = useRef(false); const [busy, setBusy] = useState(false); const [retryError, setRetryError] = useState('');
  async function retry() { if (!adapter || lock.current) return; lock.current = true; setBusy(true); setRetryError(''); try { const current = await adapter.payment(orderId); if (current.state !== 'failed') { reload(); return; } await adapter.pay(orderId, () => undefined); reload(); } catch(e) { setRetryError(errorMessage(e)); } finally { setBusy(false); lock.current = false; } }
  if (!orderId) return <Empty title="No payment to look up" href="/orders" action="View your orders">Open an order to check its payment status.</Empty>;
  if (loading) return <Loading/>; if (error) return <ErrorState error={error} retry={reload}/>;
  const captured = data?.state === 'captured';
  return <div className="empty panel"><div className="success-symbol">{captured ? '✓' : '◷'}</div><span className="eyebrow">PAYMENT UPDATE</span><h1 style={{ marginTop: 16 }}>{captured ? 'Payment confirmed.' : data?.state === 'failed' ? 'Payment was not completed.' : data?.state === 'dismissed' ? 'Checkout was closed.' : 'We’re checking your payment.'}</h1><p className="muted">{captured ? 'Your payment is recorded. Your order has its own confirmation status.' : 'Check the current status before attempting another payment. Closing checkout does not prove that a payment failed.'}</p>{data && <Status value={data.state}/>}<p className="small muted" style={{ marginTop: 16 }}>Order {orderId}{data?.reference && ` · ${data.reference}`}</p>{retryError && <ErrorState error={retryError}/>}<div className="form-actions" style={{ justifyContent: 'center' }}><button className="button secondary" onClick={reload}>Check payment status</button>{data?.state === 'failed' && <button className="button" onClick={retry} disabled={busy}>{busy ? 'Checking…' : 'Retry payment'}</button>}<Link className="button" href={`/orders/${encodeURIComponent(orderId)}`}>View order →</Link></div></div>;
}
