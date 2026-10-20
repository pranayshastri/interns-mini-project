
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../components/providers';
import {
  Empty,
  ErrorState,
  Guard,
  Loading,
  Status,
  useResource,
} from '../../components/feedback/states';
import { errorMessage, money, type Order } from '../../lib/contracts';

export function OrdersPage({ seller = false }: { seller?: boolean }) {
  return (
    <Guard role={seller ? 'SHOPKEEPER' : 'CUSTOMER'}>
      <OrderList seller={seller} />
    </Guard>
  );
}

function OrderList({ seller }: { seller: boolean }) {
  const { adapter } = useApp();
  const load = useCallback(() => adapter!.orders(seller), [adapter, seller]);
  const { data, error, loading, reload } = useResource(load, !!adapter);
  const [filter, setFilter] = useState('ALL');

  const filteredOrders = data?.filter(
    (order) => filter === 'ALL' || order.status === filter,
  );

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">
            {seller ? 'YOUR SHOP' : 'YOUR SHOPPING STORY'}
          </span>
          <h1>{seller ? 'Shop orders' : 'Your orders'}</h1>
          <p className="muted">Keep an eye on the things you’ve picked.</p>
        </div>
        <button className="button secondary" onClick={reload}>
          Refresh
        </button>
      </div>

      <div className="filter-chips" aria-label="Order status">
        {['ALL', 'PENDING', 'CONFIRMED', 'CANCELLED'].map((status) => (
          <button
            key={status}
            className={filter === status ? 'selected' : ''}
            onClick={() => setFilter(status)}
          >
            {status === 'ALL' ? 'All orders' : status.toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} retry={reload} />
      ) : filteredOrders?.length ? (
        <div className="stack">
          {filteredOrders.map((order) => (
            <Link
              key={order.id}
              className="order-row"
              href={`${seller ? '/seller' : ''}/orders/${encodeURIComponent(order.id)}`}
            >
              <div>
                <h3>{order.id}</h3>
                <p className="muted">
                  {new Date(order.createdAt).toLocaleDateString('en-IN', {
                    dateStyle: 'medium',
                  })}
                  {order.items &&
                    ` · ${order.items.reduce((sum, item) => sum + item.quantity, 0)} items`}
                </p>
              </div>
              <Status value={order.status} />
              <strong>{money(order.totalAmountCents)}</strong>
              <span>→</span>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="No orders here yet"
          href={seller ? '/seller/products' : '/products'}
          action={seller ? 'View products' : 'Find your favourites'}
        >
          Your {filter === 'ALL' ? '' : filter.toLowerCase()} orders will
          appear here.
        </Empty>
      )}
    </>
  );
}

export function OrderDetail({
  id,
  seller = false,
}: {
  id: string;
  seller?: boolean;
}) {
  return (
    <Guard role={seller ? 'SHOPKEEPER' : 'CUSTOMER'}>
      <Detail key={id} id={id} seller={seller} />
    </Guard>
  );
}

function Detail({ id, seller }: { id: string; seller: boolean }) {
  const { adapter } = useApp();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [pollingEnded, setPollingEnded] = useState(false);

  function refresh() {
    setLoading(true);
    setPollingEnded(false);
    setError('');
    setVersion((value) => value + 1);
  }

  // One in-flight read; bounded exponential backoff; ignore late responses on exit.
  useEffect(() => {
    if (!adapter) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    async function poll() {
      if (!active || !adapter) return;

      if (document.hidden) {
        timer = setTimeout(poll, 5000);
        return;
      }

      try {
        const result = await adapter.order(id);

        if (!active) return;

        setOrder(result);
        setError('');

        if (result?.status === 'PENDING' && attempts++ < 4) {
          timer = setTimeout(
            poll,
            Math.min(5000 * 2 ** (attempts - 1), 40000),
          );
        } else if (result?.status === 'PENDING') {
          setPollingEnded(true);
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    }

    void poll();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [adapter, id, version]);

  if (loading) return <Loading />;

  if (error) {
    return <ErrorState error={error} retry={refresh} />;
  }

  if (!order) {
    return (
      <Empty
        title="Order not found"
        href={seller ? '/seller/orders' : '/orders'}
        action="Back to orders"
      >
        It may be unavailable, or not part of your account.
      </Empty>
    );
  }

  const paymentMethod = (order.paymentMethod || 'COD').toUpperCase();
  const paymentStatus = order.paymentStatus || 'PENDING';

  return (
    <>
      <p className="breadcrumb">
        <Link href={seller ? '/seller/orders' : '/orders'}>Orders</Link> /{' '}
        {order.id}
      </p>

      <div className="page-title">
        <div>
          <span className="eyebrow">ORDER DETAILS</span>
          <h1>{order.id}</h1>
          <p className="muted">
            Placed {new Date(order.createdAt).toLocaleString('en-IN')}
          </p>
        </div>
        <Status value={order.status} />
      </div>

      <div className="two-column">
        <div className="stack">
          <section className="panel">
            <h2>Your order’s progress</h2>

            <ol className="timeline">
              <li className="done">
                <strong>Order recorded</strong>
                <p className="muted">Your order has been received.</p>
              </li>

              <li className={order.status === 'CONFIRMED' ? 'done' : ''}>
                <strong>
                  {order.status === 'CANCELLED'
                    ? 'Order cancelled'
                    : order.status === 'CONFIRMED'
                      ? 'Order confirmed'
                      : 'Awaiting confirmation'}
                </strong>
                <p className="muted">
                  {order.status === 'PENDING'
                    ? 'Stock allocation and confirmation can take time. Payment is tracked separately.'
                    : 'This status comes from your order record.'}
                </p>
              </li>
            </ol>

            {pollingEnded && (
              <p className="notice">
                Confirmation is taking longer. Refresh when you’re ready to
                check again.
              </p>
            )}

            <button className="button secondary" onClick={refresh}>
              Refresh status
            </button>
          </section>

          <section className="panel">
            <h2>{seller ? 'Your shop’s items' : 'Inside your order'}</h2>

            {order.items?.length ? (
              order.items.map((item) => (
                <div className="summary-line" key={item.productId}>
                  <span>
                    {item.name || item.productId} × {item.quantity}
                  </span>
                  <strong>
                    {money(item.quantity * item.unitPriceCents)}
                  </strong>
                </div>
              ))
            ) : (
              <p className="muted">Item details aren’t available yet.</p>
            )}

            {order.shippingAddress && (
              <>
                <hr />
                <h3>Shipping address</h3>
                <p className="muted">{order.shippingAddress}</p>
              </>
            )}
          </section>
        </div>

        <aside className="panel summary">
          <h2>Order summary</h2>

          <div className="summary-line total">
            <span>{seller ? 'Shop total' : 'Order total'}</span>
            <strong>{money(order.totalAmountCents)}</strong>
          </div>

          {!seller && (
            <>
              <hr />

              <div className="summary-line">
                <span>Payment method</span>
                <strong>
                  {paymentMethod === 'COD'
                    ? 'Cash on Delivery (COD)'
                    : paymentMethod}
                </strong>
              </div>

              <div className="summary-line">
                <span>Payment status</span>
                <strong>{paymentStatus}</strong>
              </div>

              {paymentMethod === 'COD' && (
                <p className="small muted">
                  Pay when your order is delivered. No online payment is
                  collected at checkout.
                </p>
              )}

              {paymentMethod !== 'COD' && (
                <Link
                  className="button secondary full"
                  href={`/checkout/result?orderId=${encodeURIComponent(order.id)}`}
                >
                  Check payment status
                </Link>
              )}

              <OrderInvoices id={order.id} />
            </>
          )}

          {seller && (
            <p className="small muted">
              Fulfillment actions are not available yet.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

function OrderInvoices({ id }: { id: string }) {
  const { adapter } = useApp();
  const load = useCallback(() => adapter!.invoices(id), [adapter, id]);
  const { data, error, loading, reload } = useResource(load, !!adapter);

  return (
    <div style={{ marginTop: 20 }}>
      <h3>Invoices</h3>

      {loading ? (
        <p className="muted small">Loading invoices…</p>
      ) : error ? (
        <ErrorState error={error} retry={reload} />
      ) : data?.length ? (
        data.map((invoice) => (
          <Link
            className="text-link"
            key={invoice.id}
            href={`/billing/invoices/${encodeURIComponent(invoice.id)}`}
          >
            {invoice.id} →
          </Link>
        ))
      ) : (
        <p className="muted small">Invoice is being prepared.</p>
      )}
    </div>
  );
}
