"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useApp } from "../../components/providers";
import {
  Empty,
  ErrorState,
  Guard,
  Loading,
  Status,
  useResource,
} from "../../components/feedback/states";
import { useRouter } from "next/navigation";
import { useCart } from "../cart/cart-provider";
import { errorMessage, money, type Address } from "../../lib/contracts";

export function CheckoutPage() {
  return (
    <Guard role="CUSTOMER">
      <Checkout />
    </Guard>
  );
}

function Checkout() {
  const { adapter } = useApp();
  const cart = useCart();
  const router = useRouter();

  const load = useCallback(() => adapter!.products(), [adapter]);
  const { data, loading, error, reload } = useResource(
    load,
    !!adapter && cart.ready,
  );
  const loadAddresses = useCallback(() => adapter!.addresses(), [adapter]);
  const {
    data: addresses,
    loading: addressesLoading,
    error: addressesError,
  } = useResource<Address[]>(loadAddresses, !!adapter && cart.ready);

  const [shippingAddress, setShippingAddress] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const lock = useRef(false);

  const formatAddress = useCallback(
    (address: Address) =>
      [
        address.line1,
        address.line2,
        address.city,
        address.state,
        address.postal,
        address.country,
      ]
        .filter(Boolean)
        .join(", "),
    [],
  );

  useEffect(() => {
    if (!addresses?.length || selectedAddressId) return;
    const preferred =
      addresses.find((address) => address.isDefault) || addresses[0];
    if (!preferred) return;
    // The address list is loaded asynchronously and supplies the initial form value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedAddressId(preferred.id);
    setShippingAddress(formatAddress(preferred));
  }, [addresses, formatAddress, selectedAddressId]);

  function selectAddress(address: Address) {
    setSelectedAddressId(address.id);
    setShippingAddress(formatAddress(address));
    setSubmitError("");
  }

  const lines = cart.items.map((item) => ({
    ...item,
    product: data?.find((p) => p.id === item.productId),
  }));

  const total = lines.reduce(
    (sum, line) => sum + (line.product?.priceCents ?? 0) * line.quantity,
    0,
  );

  const invalid = lines.some(
    ({ product, quantity }) =>
      !product ||
      !product.shopId ||
      !Number.isSafeInteger(product.priceCents) ||
      product.priceCents < 0 ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      quantity > product.availableStock,
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!adapter || lock.current || invalid || !cart.items.length) return;

    const address = shippingAddress.trim();

    if (!address || address.length > 500) {
      setSubmitError("Enter a shipping address of up to 500 characters.");
      return;
    }

    if (!Number.isSafeInteger(total) || total < 0 || total > 2147483647) {
      setSubmitError(
        "The order total is outside the currently supported range.",
      );
      return;
    }

    lock.current = true;
    setBusy(true);
    setSubmitError("");

    try {
      const items = lines.map(({ productId, quantity, product }) => {
        if (!product) throw new Error("A product is no longer available.");

        return {
          productId,
          quantity,
          shopId: product.shopId,
          unitPriceCents: product.priceCents,
        };
      });

      const order = await adapter.createOrder(items, address);

      if (!order?.id) {
        throw new Error("No order confirmation was returned by the service.");
      }

      cart.clear();
      router.push(`/orders/${encodeURIComponent(order.id)}`);
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  if (!cart.ready || loading) return <Loading />;

  if (!cart.items.length) {
    return (
      <Empty
        title="Your cart is empty"
        href="/products"
        action="Browse products"
      >
        Add products to your bag before checking out.
      </Empty>
    );
  }

  if (error) return <ErrorState error={error} retry={reload} />;

  if (!data) {
    return (
      <Empty
        title="Products are unavailable"
        href="/cart"
        action="Back to cart"
      >
        Current product details could not be loaded. Your bag has not been
        submitted.
      </Empty>
    );
  }

  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">ORDER DETAILS</span>
        <h1>Checkout</h1>
      </div>

      <form className="panel stack" onSubmit={submit}>
        <h2>Review your order</h2>

        {lines.map(({ productId, quantity, product }) => (
          <div className="summary-line" key={productId}>
            <span>
              {product?.name ?? "Unavailable product"} × {quantity}
            </span>
            <strong>
              {product ? money(product.priceCents * quantity) : "Unavailable"}
            </strong>
          </div>
        ))}

        <hr />

        <div className="summary-line total">
          <span>Estimated total</span>
          <strong>{money(total)}</strong>
        </div>

        {invalid && (
          <p className="danger" role="alert">
            A product is unavailable, its price is invalid, or stock has
            changed. Return to your cart to review your items.
          </p>
        )}

        <label htmlFor="shippingAddress">Shipping address</label>
        {addressesLoading && (
          <p className="small muted">Loading your saved addresses…</p>
        )}
        {addressesError && (
          <p className="small muted">
            Saved addresses are unavailable. You can enter a new address below.
          </p>
        )}
        {!!addresses?.length && (
          <div className="stack" role="group" aria-label="Saved addresses">
            {addresses.map((address) => (
              <button
                className={`button secondary${selectedAddressId === address.id ? " selected" : ""}`}
                type="button"
                key={address.id}
                onClick={() => selectAddress(address)}
                disabled={busy}
              >
                {address.label || "Saved address"} · {address.line1},{" "}
                {address.city}, {address.postal}
                {address.isDefault ? " · Default" : ""}
              </button>
            ))}
          </div>
        )}
        <textarea
          id="shippingAddress"
          name="shippingAddress"
          value={shippingAddress}
          onChange={(event) => setShippingAddress(event.target.value)}
          maxLength={500}
          rows={4}
          required
          disabled={busy}
          placeholder={
            addresses?.length
              ? "Select a saved address or enter a new one"
              : "Enter your delivery address"
          }
        />

        {submitError && (
          <p className="danger" role="alert">
            {submitError}
          </p>
        )}

        <button
          className="button full"
          type="submit"
          disabled={busy || invalid || !shippingAddress.trim()}
        >
          {busy ? "Submitting order…" : "Place order"}
        </button>

        <p className="small muted">
          This submits an order only. Payment is not processed by this checkout.
        </p>

        <Link className="text-link" href="/cart">
          Back to cart
        </Link>
      </form>
    </div>
  );
}

export function CheckoutResult({ orderId }: { orderId: string }) {
  return (
    <Guard role="CUSTOMER">
      <Result orderId={orderId} />
    </Guard>
  );
}
function Result({ orderId }: { orderId: string }) {
  const { adapter } = useApp();
  const load = useCallback(() => adapter!.payment(orderId), [adapter, orderId]);
  const { data, error, loading, reload } = useResource(
    load,
    !!adapter && !!orderId,
  );
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [retryError, setRetryError] = useState("");
  async function retry() {
    if (!adapter || lock.current) return;
    lock.current = true;
    setBusy(true);
    setRetryError("");
    try {
      const current = await adapter.payment(orderId);
      if (current.state !== "failed") {
        reload();
        return;
      }
      await adapter.pay(orderId, () => undefined);
      reload();
    } catch (e) {
      setRetryError(errorMessage(e));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  if (!orderId)
    return (
      <Empty
        title="No payment to look up"
        href="/orders"
        action="View your orders"
      >
        Open an order to check its payment status.
      </Empty>
    );
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const captured = data?.state === "captured";
  return (
    <div className="empty panel">
      <div className="success-symbol">{captured ? "✓" : "◷"}</div>
      <span className="eyebrow">PAYMENT UPDATE</span>
      <h1 style={{ marginTop: 16 }}>
        {captured
          ? "Payment confirmed."
          : data?.state === "failed"
            ? "Payment was not completed."
            : data?.state === "dismissed"
              ? "Checkout was closed."
              : "We’re checking your payment."}
      </h1>
      <p className="muted">
        {captured
          ? "Your payment is recorded. Your order has its own confirmation status."
          : "Check the current status before attempting another payment. Closing checkout does not prove that a payment failed."}
      </p>
      {data && <Status value={data.state} />}
      <p className="small muted" style={{ marginTop: 16 }}>
        Order {orderId}
        {data?.reference && ` · ${data.reference}`}
      </p>
      {retryError && <ErrorState error={retryError} />}
      <div className="form-actions" style={{ justifyContent: "center" }}>
        <button className="button secondary" onClick={reload}>
          Check payment status
        </button>
        {data?.state === "failed" && (
          <button className="button" onClick={retry} disabled={busy}>
            {busy ? "Checking…" : "Retry payment"}
          </button>
        )}
        <Link
          className="button"
          href={`/orders/${encodeURIComponent(orderId)}`}
        >
          View order →
        </Link>
      </div>
    </div>
  );
}
