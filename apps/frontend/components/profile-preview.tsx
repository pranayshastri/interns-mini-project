"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import { useRouter } from "next/navigation";
import { useApp } from "./providers";
import { accountRequest, type JsonValue } from "../lib/graphql-client";
import styles from "./profile-preview.module.css";

type Address = {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal: string;
  country: string;
  isDefault: boolean;
};
const blank: Address = {
  id: "",
  label: "Home",
  recipient: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal: "",
  country: "",
  isDefault: false,
};
const fields = [
  ["label", "Address label", "off"],
  ["recipient", "Recipient name", "shipping name"],
  ["phone", "Phone number", "shipping tel"],
  ["line1", "Address line 1", "shipping address-line1"],
  ["line2", "Address line 2 (optional)", "shipping address-line2"],
  ["city", "City", "shipping address-level2"],
  ["state", "State / region", "shipping address-level1"],
  ["postal", "Postal code", "shipping postal-code"],
  ["country", "Country", "shipping country-name"],
] as const;

const addressFields =
  "id label recipient phone line1 line2 city state postal country isDefault";
export function ProfilePreview() {
  return <AccountProfile preview />;
}
export function AccountProfile({ preview = false }: { preview?: boolean }) {
  const { user, refreshUser, logout } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState("details");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [draft, setDraft] = useState<Address>(blank);
  const [notice, setNotice] = useState("");
  const [name, setName] = useState(preview ? "" : user?.fullName || "");
  const [phone, setPhone] = useState(preview ? "" : user?.phone || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(!preview);
  const [retry, setRetry] = useState(0);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const editor = useRef<HTMLDialogElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    accountRequest<{ myAddresses: Address[] }>(
      `query { myAddresses { ${addressFields} } }`,
    )
      .then((result) => {
        if (!cancelled) {
          setAddresses(result.myAddresses);
          setLoadError("");
        }
      })
      .catch((error) => {
        if (!cancelled)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not load addresses.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preview, retry]);

  async function updateDetails(event: FormEvent) {
    event.preventDefault();
    if (preview) {
      setNotice("Details updated in this preview. Changes reset on reload.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await accountRequest(
        "mutation($fullName:String!,$phone:String!){updateProfile(fullName:$fullName,phone:$phone){id phone fullName}}",
        { fullName: name, phone },
      );
      setNotice("Your profile has been saved.");
      await refreshUser(true);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save details.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function writeAddress(
    operation: "saveAddress" | "deleteAddress" | "setDefaultAddress",
    address?: Address,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const query =
        operation === "saveAddress"
          ? `mutation($input:AddressInput!){saveAddress(input:$input){${addressFields}}}`
          : `mutation($id:ID!){${operation}(id:$id){${addressFields}}}`;
      const variables: Record<string, JsonValue> =
        operation === "saveAddress"
          ? { input: { ...draft, id: draft.id || null } }
          : { id: address!.id };
      const result = await accountRequest<Record<string, Address[]>>(
        query,
        variables,
      );
      setAddresses(result[operation]!);
      editor.current?.close();
      confirmation.current?.close();
      setDeleting(null);
      setNotice(
        operation === "deleteAddress"
          ? "Address deleted."
          : operation === "setDefaultAddress"
            ? "Default delivery address updated."
            : "Address saved.",
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not update addresses.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await logout();
      router.replace("/login");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }
  function openAddress(address?: Address) {
    setError("");
    setDraft(
      address
        ? { ...address }
        : { ...blank, isDefault: addresses.length === 0 },
    );
    editor.current?.showModal();
  }
  function saveAddress(event: FormEvent) {
    event.preventDefault();
    if (!preview) {
      void writeAddress("saveAddress");
      return;
    }
    const saved = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      isDefault: addresses.length === 0 || draft.isDefault,
    };
    const next = addresses
      .filter((address) => address.id !== saved.id)
      .map((address) =>
        saved.isDefault ? { ...address, isDefault: false } : address,
      );
    next.push(saved);
    if (!next.some((address) => address.isDefault)) saved.isDefault = true;
    setAddresses(next);
    editor.current?.close();
    setNotice("Address updated in this preview. Changes reset on reload.");
  }
  function removeAddress() {
    if (!preview) {
      void writeAddress("deleteAddress", deleting!);
      return;
    }
    const next = addresses.filter((address) => address.id !== deleting?.id);
    if (next.length && !next.some((address) => address.isDefault))
      next[0] = { ...next[0]!, isDefault: true };
    setAddresses(next);
    confirmation.current?.close();
    setDeleting(null);
    setNotice("Address removed from this preview.");
  }

  return (
    <div className={styles.page}>
      <div className={styles.brand}>
        <BrandLogo />
        <small>YOUR ACCOUNT</small>
      </div>
      {preview && (
        <div className={styles.preview}>
          <strong>DESIGN PREVIEW</strong>
          <span>
            Try the layout. Entries stay on this page only and reset on reload.
          </span>
        </div>
      )}
      <div className={styles.heading}>
        <p className={styles.eyebrow}>YOUR ROBONEST ACCOUNT</p>
        <h1>A place for your details.</h1>
        <p>Keep your contact information and delivery addresses together.</p>
      </div>
      {!preview && (
        <nav className={styles.links} aria-label="Account navigation">
          {user?.role === "CUSTOMER" && (
            <>
              <Link href="/orders">Orders</Link>
              <Link href="/billing">Billing</Link>
            </>
          )}
          {user?.role === "SHOPKEEPER" && (
            <Link href="/seller">Seller workspace</Link>
          )}
          {user?.role === "ADMIN" && <Link href="/admin">Admin workspace</Link>}
          <Link href="/notifications">Updates</Link>
          <button disabled={busy} onClick={signOut}>
            Sign out
          </button>
        </nav>
      )}
      <div className={styles.layout}>
        <nav className={styles.navigation} aria-label="Account sections">
          <button
            disabled={busy}
            aria-current={tab === "details" ? "page" : undefined}
            onClick={() => {
              setTab("details");
              setNotice("");
            }}
          >
            <span>01</span>Personal details
          </button>
          <button
            disabled={busy}
            aria-current={tab === "addresses" ? "page" : undefined}
            onClick={() => {
              setTab("addresses");
              setNotice("");
            }}
          >
            <span>02</span>Saved addresses <small>{addresses.length}</small>
          </button>
          <p>
            Your details belong to your account. Shop information will have its
            own section.
          </p>
        </nav>
        <section
          className={styles.panel}
          aria-label={
            tab === "details" ? "Personal details" : "Saved addresses"
          }
        >
          {loadError && (
            <p className={styles.error} role="alert">
              {loadError}
            </p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          {tab === "details" ? (
            <>
              <div className={styles.sectionHeading}>
                <div>
                  <h2>Personal details</h2>
                  <p>How we can address you and reach you.</p>
                </div>
                <span className={styles.badge}>Account settings</span>
              </div>
              <form
                className={styles.form}
                onSubmit={updateDetails}
                aria-busy={busy}
              >
                <label>
                  Full name
                  <input
                    disabled={busy}
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={128}
                    placeholder="Your full name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label>
                  Phone number{" "}
                  <span className={styles.optional}>(optional)</span>
                  <input
                    disabled={busy}
                    aria-label="Phone number"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={32}
                    placeholder="Include your country code"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                  <small>Used to contact you about your deliveries.</small>
                </label>
                <label className={styles.wide}>
                  Email address
                  <input
                    aria-label="Email address"
                    type="email"
                    value={preview ? "" : user?.email || ""}
                    readOnly
                    placeholder="Your account email will appear here"
                  />
                  <small>
                    Your sign-in email. Email changes will be handled
                    separately.
                  </small>
                </label>
                {!preview && (
                  <>
                    <label>
                      Account role
                      <input value={user?.role || ""} readOnly />
                    </label>
                    {user?.shopId && (
                      <label>
                        Shop ID
                        <input value={user.shopId} readOnly />
                      </label>
                    )}
                  </>
                )}
                <div className={styles.formFooter}>
                  <span>Review your details before saving.</span>
                  <button disabled={busy} className={styles.primary}>
                    {busy
                      ? "Saving…"
                      : preview
                        ? "Preview save"
                        : "Save changes"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className={styles.sectionHeading}>
                <div>
                  <h2>Saved addresses</h2>
                  <p>Choose where your next project arrives.</p>
                </div>
                <button
                  className={styles.primary}
                  disabled={busy || loading || (!preview && Boolean(loadError))}
                  onClick={() => openAddress()}
                >
                  + Add address
                </button>
              </div>
              {loading ? (
                <p role="status">Loading your addresses…</p>
              ) : loadError && !addresses.length ? (
                <button
                  className={styles.secondary}
                  onClick={() => {
                    setLoading(true);
                    setRetry(retry + 1);
                  }}
                >
                  Retry loading addresses
                </button>
              ) : !addresses.length ? (
                <div className={styles.empty}>
                  <span aria-hidden="true">⌂</span>
                  <h3>Your address book starts here</h3>
                  <p>
                    Add a delivery address for home, work, or wherever you
                    build.
                  </p>
                  <button
                    className={styles.secondary}
                    disabled={
                      busy || loading || (!preview && Boolean(loadError))
                    }
                    onClick={() => openAddress()}
                  >
                    Add your first address
                  </button>
                </div>
              ) : (
                <div className={styles.addresses}>
                  {addresses.map((address) => (
                    <article className={styles.address} key={address.id}>
                      <div className={styles.addressHeading}>
                        <h3>{address.label}</h3>
                        {address.isDefault && (
                          <span className={styles.badge}>Default delivery</span>
                        )}
                      </div>
                      <strong>{address.recipient}</strong>
                      <p>
                        {address.line1}
                        <br />
                        {address.line2 && (
                          <>
                            {address.line2}
                            <br />
                          </>
                        )}
                        {address.city}, {address.state} {address.postal}
                        <br />
                        {address.country}
                      </p>
                      <p>{address.phone}</p>
                      <div className={styles.actions}>
                        <button
                          disabled={busy}
                          onClick={() => openAddress(address)}
                          aria-label={`Edit ${address.label}`}
                        >
                          Edit
                        </button>
                        <button
                          disabled={busy}
                          className={styles.danger}
                          onClick={() => {
                            setError("");
                            setDeleting(address);
                            confirmation.current?.showModal();
                          }}
                          aria-label={`Delete ${address.label}`}
                        >
                          Delete
                        </button>
                        {!address.isDefault && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (!preview) {
                                void writeAddress("setDefaultAddress", address);
                                return;
                              }
                              setAddresses(
                                addresses.map((item) => ({
                                  ...item,
                                  isDefault: item.id === address.id,
                                })),
                              );
                              setNotice(
                                "Default delivery address changed in this preview.",
                              );
                            }}
                          >
                            Set as default
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <dialog
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        ref={editor}
        className={styles.dialog}
        aria-labelledby="address-title"
      >
        <form onSubmit={saveAddress}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>DELIVERY DETAILS</p>
              <h2 id="address-title">
                {draft.id ? "Edit address" : "Add an address"}
              </h2>
            </div>
            <button
              disabled={busy}
              type="button"
              className={styles.close}
              aria-label="Close address form"
              onClick={() => editor.current?.close()}
            >
              ×
            </button>
          </div>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <fieldset disabled={busy} className={styles.form}>
            {fields.map(([key, label, autoComplete]) => (
              <label
                key={key}
                className={
                  key === "line1" || key === "line2" ? styles.wide : undefined
                }
              >
                {label}
                <input
                  autoFocus={key === "label"}
                  autoComplete={autoComplete}
                  type={key === "phone" ? "tel" : "text"}
                  required={key !== "line2"}
                  maxLength={
                    key === "phone" || key === "postal"
                      ? 32
                      : key === "label"
                        ? 80
                        : key === "recipient"
                          ? 128
                          : key === "line1" || key === "line2"
                            ? 200
                            : 100
                  }
                  value={draft[key]}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: event.target.value })
                  }
                />
              </label>
            ))}
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={draft.isDefault}
                disabled={
                  !addresses.length ||
                  (draft.isDefault &&
                    addresses.some(
                      (address) => address.id === draft.id && address.isDefault,
                    ))
                }
                onChange={(event) =>
                  setDraft({ ...draft, isDefault: event.target.checked })
                }
              />
              Use as my default delivery address
            </label>
          </fieldset>
          <div className={styles.dialogFooter}>
            <button
              disabled={busy}
              type="button"
              className={styles.secondary}
              onClick={() => editor.current?.close()}
            >
              Cancel
            </button>
            <button disabled={busy} className={styles.primary}>
              {busy
                ? "Saving…"
                : preview
                  ? "Save preview address"
                  : "Save address"}
            </button>
          </div>
        </form>
      </dialog>
      <dialog
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        ref={confirmation}
        className={styles.dialog}
        aria-labelledby="delete-title"
      >
        <h2 id="delete-title">Delete this address?</h2>
        <p>
          Remove “{deleting?.label}” from{" "}
          {preview ? "this preview address book" : "your address book"}?
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.dialogFooter}>
          <button
            disabled={busy}
            className={styles.secondary}
            onClick={() => confirmation.current?.close()}
          >
            Keep address
          </button>
          <button
            disabled={busy}
            className={styles.primary}
            onClick={removeAddress}
          >
            {busy ? "Deleting…" : "Delete address"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
