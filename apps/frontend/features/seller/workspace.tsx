"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useApp } from "../../components/providers";
import {
  Empty,
  ErrorState,
  Guard,
  Loading,
  Status,
  useResource,
} from "../../components/feedback/states";
import { ProductImage } from "../../components/commerce/product-card";
import { Icon } from "../../components/layout/icons";
import { errorMessage, money, type Product } from "../../lib/contracts";
const links = [
  ["/seller", "grid", "Overview"],
  ["/seller/products", "bag", "Products"],
  ["/seller/inventory", "box", "Inventory"],
  ["/seller/orders", "box", "Orders"],
  ["/seller/notifications", "bell", "Notifications"],
];
export function SellerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const { user } = useApp();
  const nav = (
    <nav aria-label="Seller navigation">
      {links.map(([href, icon, label]) => (
        <Link
          key={href}
          href={href!}
          aria-current={pathname === href ? "page" : undefined}
          onClick={() => dialog.current?.close()}
        >
          <Icon name={icon!} size={18} />
          {label}
        </Link>
      ))}
    </nav>
  );
  return (
    <Guard role="SHOPKEEPER">
      <button
        className="button secondary seller-mobile-toggle"
        onClick={() => dialog.current?.showModal()}
      >
        <Icon name="menu" /> Seller menu
      </button>
      <dialog ref={dialog} aria-label="Seller navigation">
        <div className="seller-drawer-nav">
          {nav}
          <button
            className="button secondary"
            onClick={() => dialog.current?.close()}
          >
            Close menu
          </button>
        </div>
      </dialog>
      <div className="seller-layout">
        <aside className="seller-sidebar">
          <div className="seller-shop">
            <span>
              <Icon name="bag" />
            </span>
            <div>
              Your shop<small>{user?.shopId}</small>
            </div>
          </div>
          <p>WORKSPACE</p>
          {nav}
          <hr />
          <Link className="small text-link" href="/products">
            ← Back to storefront
          </Link>
        </aside>
        <div className="seller-content">{children}</div>
      </div>
    </Guard>
  );
}
export function SellerProducts({
  inventory = false,
  overview = false,
}: {
  inventory?: boolean;
  overview?: boolean;
}) {
  const { adapter } = useApp();
  const load = useCallback(() => adapter!.myProducts(), [adapter]);
  const { data, error, loading, reload } = useResource(load, !!adapter);
  const [search, setSearch] = useState("");
  const [low, setLow] = useState(false);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [notice, setNotice] = useState("");
  const products = (data || []).filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) &&
      (!low || p.availableStock <= 5),
  );
  const lowCount = data?.filter((p) => p.availableStock <= 5).length || 0;
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">YOUR SHOP, AT A GLANCE</span>
          <h1>
            {overview
              ? "A good day to grow."
              : inventory
                ? "Inventory"
                : "Your products"}
          </h1>
          <p className="muted">
            {inventory
              ? "Keep your shelves ready for the next order."
              : "A little care for every product on your shelf."}
          </p>
        </div>
        <Link className="button" href="/seller/products/new">
          + Add product
        </Link>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} retry={reload} />
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat">
              <p>Products</p>
              <strong>{data?.length || 0}</strong>
              <small>In your shop</small>
            </div>
            <div className="stat">
              <p>Units available</p>
              <strong>
                {data?.reduce((s, p) => s + p.availableStock, 0) || 0}
              </strong>
              <small>Across your inventory</small>
            </div>
            <div className="stat">
              <p>Needs attention</p>
              <strong>{lowCount}</strong>
              <small>5 units or fewer</small>
            </div>
          </div>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <div className="table-toolbar">
            <input
              type="search"
              aria-label="Search your products"
              placeholder="Search your products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={low}
                onChange={(e) => setLow(e.target.checked)}
              />{" "}
              Low stock only
            </label>
            <button className="button secondary" onClick={reload}>
              Refresh
            </button>
          </div>
          {products.length ? (
            <div
              className="table-scroll"
              role="region"
              aria-label="Shop product inventory"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Available</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="table-product">
                          <ProductImage product={p} />
                          <div>
                            <strong>{p.name}</strong>
                            <small>{p.pack || p.id}</small>
                          </div>
                        </div>
                      </td>
                      <td>{money(p.priceCents)}</td>
                      <td>
                        <strong>{p.availableStock}</strong> units
                      </td>
                      <td>
                        <Status
                          value={
                            !p.availableStock
                              ? "Out of stock"
                              : p.availableStock <= 5
                                ? "Low stock"
                                : "In stock"
                          }
                        />
                      </td>
                      <td>
                        {inventory ? (
                          <button
                            className="button secondary"
                            onClick={() => setAdjusting(p)}
                            aria-label={`Adjust stock for ${p.name}`}
                          >
                            Adjust stock
                          </button>
                        ) : (
                          <Link
                            className="button secondary"
                            href={`/seller/products/${encodeURIComponent(p.id)}/edit`}
                          >
                            Edit product
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No matching products"
              href="/seller/products/new"
              action="Add your first product"
            >
              Try a different search or stock filter.
            </Empty>
          )}
          {overview && (
            <div className="notice">
              Keep quantities current and check incoming orders.{" "}
              <Link href="/seller/orders" className="text-link">
                Open shop orders →
              </Link>
            </div>
          )}
        </>
      )}
      {adjusting && (
        <StockDialog
          product={adjusting}
          close={() => setAdjusting(null)}
          saved={() => {
            setAdjusting(null);
            setNotice("Stock updated. Your inventory has been refreshed.");
            reload();
          }}
        />
      )}
    </>
  );
}
function StockDialog({
  product,
  close,
  saved,
}: {
  product: Product;
  close: () => void;
  saved: () => void;
}) {
  const { adapter } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [direction, setDirection] = useState("add");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    const node = ref.current;
    const trigger = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);
  const delta = Number(amount) * (direction === "add" ? 1 : -1);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current || !adapter) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await adapter.updateStock(product.id, delta);
      saved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
      aria-labelledby="stock-title"
    >
      <h2 id="stock-title">Adjust stock</h2>
      <p className="muted small">
        {product.name} · {product.availableStock} available
      </p>
      {error && <ErrorState error={error} />}
      <form onSubmit={submit}>
        <label className="field">
          Adjustment
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            disabled={busy}
          >
            <option value="add">Add stock</option>
            <option value="remove">Remove stock</option>
          </select>
        </label>
        <label className="field">
          Number of units
          <input
            type="number"
            min="1"
            max={
              direction === "remove"
                ? product.availableStock
                : 2147483647 - product.availableStock
            }
            step="1"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
        </label>
        <p className="notice">
          New available quantity:{" "}
          <strong>{product.availableStock + delta}</strong>
        </p>
        <div className="form-actions">
          <button
            className="button"
            disabled={
              busy ||
              !Number.isInteger(delta) ||
              !delta ||
              product.availableStock + delta < 0
            }
          >
            {busy ? "Saving…" : "Confirm adjustment"}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={close}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function ProductEditor({ id }: { id?: string }) {
  const { adapter } = useApp();
  const load = useCallback(
    async () =>
      id
        ? (await adapter!.myProducts()).find((p) => p.id === id) || null
        : null,
    [adapter, id],
  );
  const { data, loading, error, reload } = useResource(load, !!adapter);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  if (id && !data)
    return (
      <Empty
        title="Product not found in your shop"
        href="/seller/products"
        action="Back to products"
      />
    );
  return <EditorForm key={id || "new"} product={data || undefined} />;
}
function EditorForm({ product }: { product?: Product }) {
  const { adapter } = useApp();
  const router = useRouter();
  const lock = useRef(false);
  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [price, setPrice] = useState(
    product ? (product.priceCents / 100).toFixed(2) : "",
  );
  const [stock, setStock] = useState("0");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (dirty) e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!adapter || lock.current) return;
    setError("");
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(price);
    if (!match) {
      setError("Enter a price with at most two decimal places.");
      return;
    }
    const cents =
      Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
    if (
      !name.trim() ||
      !description.trim() ||
      !Number.isSafeInteger(cents) ||
      cents > 2147483647 ||
      !Number.isInteger(Number(stock)) ||
      Number(stock) < 0 ||
      Number(stock) > 2147483647
    ) {
      setError("Check the name, description, price and stock values.");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const input = {
        name: name.trim(),
        description: description.trim(),
        priceCents: cents,
      };
      if (product) await adapter.updateProduct(product.id, input);
      else
        await adapter.createProduct({ ...input, initialStock: Number(stock) });
      setDirty(false);
      router.push("/seller/products");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <p className="breadcrumb">
        <Link
          href="/seller/products"
          onClick={(e) => {
            if (dirty) {
              e.preventDefault();
              setConfirmLeave(true);
            }
          }}
        >
          Products
        </Link>{" "}
        / {product ? "Edit" : "New product"}
      </p>
      <div className="page-title">
        <div>
          <span className="eyebrow">MAKE ROOM ON YOUR SHELF</span>
          <h1>{product ? "Edit product" : "Add a product"}</h1>
          <p className="muted">
            A clear name and description make a good first impression.
          </p>
        </div>
      </div>
      {error && <ErrorState error={error} />}
      <form className="panel" onSubmit={submit} onChange={() => setDirty(true)}>
        <div className="form-grid">
          <label className="field full">
            Product name
            <input
              required
              maxLength={255}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field full">
            Description
            <textarea
              required
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            Price (INR)
            <input
              required
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={busy}
            />
          </label>
          {!product ? (
            <label className="field">
              Initial stock
              <input
                type="number"
                min="0"
                max="2147483647"
                step="1"
                required
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                disabled={busy}
              />
            </label>
          ) : (
            <div className="field">
              Current stock<strong>{product.availableStock} units</strong>
              <Link
                href="/seller/inventory"
                onClick={(e) => {
                  if (dirty) {
                    e.preventDefault();
                    setConfirmLeave(true);
                  }
                }}
                className="text-link"
              >
                Manage stock separately →
              </Link>
            </div>
          )}
        </div>
        <p className="notice">
          Images, categories and pack sizes aren’t editable yet.{" "}
          {product
            ? "Stock is managed with an explicit inventory adjustment."
            : "Initial stock is set once when the product is created."}
        </p>
        <div className="form-actions">
          <button className="button" disabled={busy || (!!product && !dirty)}>
            {busy
              ? "Saving product…"
              : product
                ? "Save changes"
                : "Create product"}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              dirty ? setConfirmLeave(true) : router.push("/seller/products")
            }
          >
            Cancel
          </button>
        </div>
      </form>
      {confirmLeave && (
        <LeaveDialog
          close={() => setConfirmLeave(false)}
          leave={() => {
            setDirty(false);
            router.push("/seller/products");
          }}
        />
      )}
    </>
  );
}
function LeaveDialog({
  close,
  leave,
}: {
  close: () => void;
  leave: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    const trigger = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);
  return (
    <dialog ref={ref} onCancel={close} aria-labelledby="leave-title">
      <h2 id="leave-title">Leave without saving?</h2>
      <p className="muted">Your product changes haven’t been saved.</p>
      <div className="form-actions">
        <button className="button" onClick={close}>
          Keep editing
        </button>
        <button className="button secondary" onClick={leave}>
          Discard changes
        </button>
      </div>
    </dialog>
  );
}
