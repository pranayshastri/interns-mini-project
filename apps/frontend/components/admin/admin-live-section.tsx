"use client";

import { useCallback, useState, type FormEvent } from "react";
import { accountRequest } from "../../lib/graphql-client";
import { ErrorState, Loading, useResource } from "../feedback/states";
import { useApp } from "../providers";
import styles from "./admin-workspace.module.css";

type Section = "overview" | "users" | "sellers" | "health" | "activity";
type User = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  shopId: string | null;
  status: string;
};
type UserPage = { users: User[]; total: number; page: number; limit: number };
type Audit = {
  id: string;
  actorName: string;
  targetEmail: string;
  action: string;
  reason: string;
  previousStatus: string;
  newStatus: string;
  createdAt: string;
};
const fields = "id fullName email role shopId status";
const auditFields =
  "id actorName targetEmail action reason previousStatus newStatus createdAt";
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The operation could not be completed.";

export function AdminLiveSection({
  section,
  navigate,
}: {
  section: Section;
  navigate: (section: Section) => void;
}) {
  if (section === "users" || section === "sellers")
    return <Directory sellers={section === "sellers"} />;
  if (section === "activity") return <Activity />;
  if (section === "health") return <Health />;
  return <Overview navigate={navigate} />;
}
function Overview({ navigate }: { navigate: (section: Section) => void }) {
  const load = useCallback(
    async () =>
      (
        await accountRequest<{
          adminOverview: {
            customers: number;
            sellers: number;
            admins: number;
            suspended: number;
          };
        }>("query { adminOverview { customers sellers admins suspended } }")
      ).adminOverview,
    [],
  );
  const result = useResource(load);
  if (result.error)
    return <ErrorState error={result.error} retry={result.reload} />;
  if (!result.data) return <Loading />;
  return (
    <>
      <div className={styles.panelHeading}>
        <p className={styles.filterHint}>
          Account counts from the live account service.
        </p>
        <button className={styles.secondary} onClick={result.reload}>
          Refresh counts
        </button>
      </div>
      <div className={styles.metrics}>
        {(
          [
            ["Customers", result.data.customers, "users"],
            ["Sellers", result.data.sellers, "sellers"],
            ["Administrators", result.data.admins, "users"],
            ["Suspended accounts", result.data.suspended, "users"],
          ] as const
        ).map(([label, count, target]) => (
          <button
            className={styles.metric}
            key={label}
            onClick={() => navigate(target)}
          >
            <span>{label}</span>
            <strong>{count}</strong>
            <small>View accounts →</small>
          </button>
        ))}
      </div>
      <div className={styles.columns}>
        <section className={styles.panel}>
          <h2>Manage platform access</h2>
          <p>
            Search accounts, inspect their details and change access with a
            recorded reason.
          </p>
          <button className={styles.primary} onClick={() => navigate("users")}>
            Manage users
          </button>
          <button
            className={styles.textButton}
            style={{ marginLeft: 16 }}
            onClick={() => navigate("sellers")}
          >
            View sellers →
          </button>
        </section>
        <section className={styles.panel}>
          <h2>Account service checks</h2>
          <p>
            Check the account database and session store. Commerce services are
            not connected yet.
          </p>
          <button
            className={styles.secondary}
            onClick={() => navigate("health")}
          >
            Check account health
          </button>
        </section>
      </div>
      <Activity compact />
    </>
  );
}
function Directory({ sellers }: { sellers: boolean }) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState({ search: "", role: "", status: "" });
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(
    async () =>
      (
        await accountRequest<{ adminUsers: UserPage }>(
          `query($search:String,$role:String,$status:String,$page:Int){adminUsers(search:$search,role:$role,status:$status,page:$page,limit:10){users{${fields}} total page limit}}`,
          { ...filter, role: sellers ? "SHOPKEEPER" : filter.role, page },
        )
      ).adminUsers,
    [filter, page, sellers],
  );
  const result = useResource(load);
  function apply(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilter({ search: search.trim(), role, status });
  }
  function clear() {
    setSearch("");
    setRole("");
    setStatus("");
    setPage(1);
    setFilter({ search: "", role: "", status: "" });
  }
  if (creating)
    return (
      <CreateSeller
        close={() => setCreating(false)}
        done={(email) => {
          setCreating(false);
          setCreated(email);
          clear();
          result.reload();
        }}
      />
    );
  if (selected)
    return (
      <UserDetails
        id={selected}
        back={() => {
          setSelected(null);
          result.reload();
        }}
      />
    );
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div>
          <h2>{sellers ? "Seller directory" : "All users"}</h2>
          <p>
            {sellers
              ? "Existing seller accounts and their assigned shop IDs."
              : "Customer, seller and administrator accounts."}
          </p>
        </div>
        <button className={styles.secondary} onClick={result.reload}>
          Refresh list
        </button>
      </div>
      {created && (
        <p role="status" className={styles.formNotice}>
          Seller {created} and their shop were created. They can now sign in.
        </p>
      )}
      {sellers && (
        <>
          <button className={styles.primary} onClick={() => setCreating(true)}>
            Create seller & shop
          </button>
          <p className={styles.filterHint}>
            Create seller accounts with a registered shop identity. Catalog and
            order services are connected separately.
          </p>
        </>
      )}
      <form className={styles.filters} onSubmit={apply}>
        <label className={styles.search}>
          <input
            type="search"
            aria-label={sellers ? "Search sellers" : "Search users"}
            placeholder="Search name or email"
            maxLength={128}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {!sellers && (
          <label>
            Role
            <select
              aria-label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="">All roles</option>
              <option value="CUSTOMER">Customer</option>
              <option value="SHOPKEEPER">Shopkeeper</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
        )}
        <label>
          Status
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </label>
        <button className={styles.primary} type="submit">
          Apply filters
        </button>
        <button className={styles.textButton} type="button" onClick={clear}>
          Clear filters
        </button>
      </form>
      {result.error ? (
        <ErrorState error={result.error} retry={result.reload} />
      ) : !result.data ? (
        <Loading />
      ) : (
        <>
          <div className={styles.tableScroll}>
            <table>
              <caption className="sr-only">Account directory</caption>
              <thead>
                <tr>
                  <th>Name / email</th>
                  <th>{sellers ? "Assigned shop ID" : "Role"}</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {result.data.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.fullName}</strong>
                      <small className={styles.cellSub}>{user.email}</small>
                    </td>
                    <td>
                      {sellers ? user.shopId || "Not assigned" : user.role}
                    </td>
                    <td>
                      <span className={styles.badge}>{user.status}</span>
                    </td>
                    <td>
                      <button
                        className={styles.textButton}
                        aria-label={`View ${user.email}`}
                        onClick={() => setSelected(user.id)}
                      >
                        View account →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result.data.users.length && (
            <p className={styles.unavailable}>
              No accounts match these filters.
            </p>
          )}
          <Pagination
            page={page}
            total={result.data.total}
            limit={10}
            change={setPage}
          />
        </>
      )}
    </section>
  );
}
function UserDetails({ id, back }: { id: string; back: () => void }) {
  const { user: actor } = useApp();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(
    async () =>
      (
        await accountRequest<{ adminUser: User }>(
          `query($id:ID!){adminUser(id:$id){${fields}}}`,
          { id },
        )
      ).adminUser,
    [id],
  );
  const result = useResource(load);
  async function update(event: FormEvent) {
    event.preventDefault();
    if (!result.data || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = result.data.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
      await accountRequest(
        `mutation($id:ID!,$status:String!,$expectedStatus:String!,$reason:String!){adminSetAccountStatus(id:$id,status:$status,expectedStatus:$expectedStatus,reason:$reason){${fields}}}`,
        {
          id,
          status: next,
          expectedStatus: result.data.status,
          reason: reason.trim(),
        },
      );
      setConfirm(false);
      setReason("");
      setNotice(
        next === "SUSPENDED"
          ? "Account suspended. Previous sessions are invalid."
          : "Account reactivated. A fresh sign-in is required.",
      );
      result.reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const account = result.data;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <button className={styles.textButton} onClick={back} disabled={busy}>
          ← Back to directory
        </button>
        <button
          className={styles.secondary}
          onClick={() => {
            setConfirm(false);
            setError("");
            result.reload();
          }}
          disabled={busy}
        >
          Refresh details
        </button>
      </div>
      {notice && (
        <p className={styles.formNotice} role="status">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.operationError}>
          {error}
        </p>
      )}
      {result.error ? (
        <ErrorState error={result.error} retry={result.reload} />
      ) : !account ? (
        <Loading />
      ) : (
        <>
          <h2>Account details</h2>
          <dl className={styles.details}>
            {[
              ["Full name", account.fullName],
              ["Email address", account.email],
              ["Account ID", account.id],
              ["Role", account.role],
              ["Status", account.status],
              ["Assigned shop ID", account.shopId || "Not assigned"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {account.shopId && <ShopDetails id={account.shopId} />}
          <hr />
          {actor?.id === account.id ? (
            <p>You cannot change your own account access.</p>
          ) : (
            <>
              {!confirm ? (
                <button
                  className={
                    account.status === "ACTIVE" ? styles.danger : styles.primary
                  }
                  onClick={() => {
                    setConfirm(true);
                    setNotice("");
                  }}
                >
                  {account.status === "ACTIVE"
                    ? "Suspend account"
                    : "Reactivate account"}
                </button>
              ) : (
                <form className={styles.accessForm} onSubmit={update}>
                  <h3>
                    {account.status === "ACTIVE"
                      ? "Confirm suspension"
                      : "Confirm reactivation"}
                  </h3>
                  <p>
                    {account.status === "ACTIVE"
                      ? "This account will lose access immediately. Existing sessions will no longer work."
                      : "This account will be able to sign in again. Old sessions will remain invalid."}
                  </p>
                  <label>
                    Reason for access change
                    <textarea
                      aria-label="Reason for access change"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      minLength={5}
                      maxLength={500}
                      required
                      rows={3}
                      disabled={busy}
                    />
                  </label>
                  <div className={styles.dialogActions}>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => setConfirm(false)}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                    <button
                      className={
                        account.status === "ACTIVE"
                          ? styles.danger
                          : styles.primary
                      }
                      disabled={busy || reason.trim().length < 5}
                    >
                      {busy ? "Saving…" : "Confirm access change"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
function Activity({ compact = false }: { compact?: boolean }) {
  const [page, setPage] = useState(1);
  const limit = compact ? 5 : 20;
  const load = useCallback(
    async () =>
      (
        await accountRequest<{
          adminActivity: { events: Audit[]; total: number };
        }>(
          `query($page:Int,$limit:Int){adminActivity(page:$page,limit:$limit){events{${auditFields}} total}}`,
          { page, limit },
        )
      ).adminActivity,
    [page, limit],
  );
  const result = useResource(load);
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div>
          <h2>{compact ? "Recent activity" : "Administrative activity"}</h2>
          <p>Recorded seller creation and account access changes.</p>
        </div>
        <button className={styles.secondary} onClick={result.reload}>
          Refresh activity
        </button>
      </div>
      {result.error ? (
        <ErrorState error={result.error} retry={result.reload} />
      ) : !result.data ? (
        <Loading />
      ) : (
        <>
          {result.data.events.map((event) => (
            <article key={event.id} className={styles.auditRow}>
              <div>
                <strong>
                  {event.action === "SELLER_CREATED"
                    ? "Seller and shop created"
                    : event.action === "ACCOUNT_SUSPENDED"
                      ? "Account suspended"
                      : "Account reactivated"}
                </strong>
                <time dateTime={event.createdAt}>
                  {new Date(event.createdAt).toLocaleString()}
                </time>
              </div>
              <p>
                {event.targetEmail} · by {event.actorName}
              </p>
              <p>{event.reason}</p>
              <small>
                {event.previousStatus} → {event.newStatus}
              </small>
            </article>
          ))}
          {!result.data.events.length && (
            <p className={styles.unavailable}>
              No account access changes have been recorded yet.
            </p>
          )}
          {!compact && (
            <Pagination
              page={page}
              limit={limit}
              total={result.data.total}
              change={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}
function Health() {
  const load = useCallback(
    async () =>
      (
        await accountRequest<{
          adminHealth: {
            checkedAt: string;
            database: boolean;
            sessions: boolean;
          };
        }>("query { adminHealth { checkedAt database sessions } }")
      ).adminHealth,
    [],
  );
  const result = useResource(load);
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <h2>Account service health</h2>
        <button className={styles.secondary} onClick={result.reload}>
          Run health checks
        </button>
      </div>
      {result.error ? (
        <ErrorState error={result.error} retry={result.reload} />
      ) : !result.data ? (
        <Loading />
      ) : (
        <>
          <p>Checked {new Date(result.data.checkedAt).toLocaleString()}</p>
          <div className={styles.healthGrid}>
            {[
              ["Account database", result.data.database],
              ["Session store", result.data.sessions],
            ].map(([label, healthy]) => (
              <div className={styles.healthCard} key={String(label)}>
                <h3>{label}</h3>
                <span className={styles.badge}>
                  {healthy ? "Reachable" : "Unavailable"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className={styles.formNotice}>
        Catalog, Orders and Inventory are not connected to these health checks.
      </p>
    </section>
  );
}
function Pagination({
  page,
  total,
  limit,
  change,
}: {
  page: number;
  total: number;
  limit: number;
  change: (page: number) => void;
}) {
  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <span>
        {total} {total === 1 ? "record" : "records"} · Page {page} of{" "}
        {Math.max(1, Math.ceil(total / limit))}
      </span>
      <div>
        <button
          className={styles.secondary}
          disabled={page <= 1}
          onClick={() => change(page - 1)}
        >
          Previous
        </button>
        <button
          className={styles.secondary}
          disabled={page * limit >= total}
          onClick={() => change(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}

function ShopDetails({ id }: { id: string }) {
  const load = useCallback(
    async () =>
      (
        await accountRequest<{
          adminShop: { name: string; description: string };
        }>("query($id:ID!){adminShop(id:$id){name description}}", { id })
      ).adminShop,
    [id],
  );
  const result = useResource(load);
  return (
    <section>
      <h3>Registered shop</h3>
      {result.error ? (
        <ErrorState error={result.error} retry={result.reload} />
      ) : !result.data ? (
        <Loading />
      ) : (
        <>
          <strong>{result.data.name}</strong>
          <p>{result.data.description || "No description provided."}</p>
        </>
      )}
    </section>
  );
}
function CreateSeller({
  close,
  done,
}: {
  close: () => void;
  done: (email: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = Object.fromEntries(Array.from(data.entries(), ([key, value]) => [key, String(value)]));
    setBusy(true);
    setError("");
    try {
      await accountRequest(
        "mutation($email:String!,$password:String!,$fullName:String!,$shopName:String!,$description:String!){adminCreateSeller(email:$email,password:$password,fullName:$fullName,shopName:$shopName,description:$description){user{id} shop{id}}}",
        input,
      );
      form.reset();
      done(String(input.email));
    } catch (error) {
      setError(message(error));
    } finally {
      (form.elements.namedItem("password") as HTMLInputElement).value = "";
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel}>
      <button className={styles.textButton} onClick={close} disabled={busy}>
        ← Back to sellers
      </button>
      <h2>Create seller & shop</h2>
      <p>
        Create a seller login and its shop together. Existing accounts cannot be
        converted with this form.
      </p>
      {error && (
        <p role="alert" className={styles.operationError}>
          {error}
        </p>
      )}
      <form className={styles.accessForm} onSubmit={submit} aria-busy={busy}>
        <label>
          Seller full name
          <input name="fullName" required maxLength={128} disabled={busy} />
        </label>
        <label>
          Seller email
          <input
            name="email"
            type="email"
            required
            maxLength={255}
            disabled={busy}
          />
        </label>
        <label>
          Seller password
          <input
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className={styles.textButton}
          onClick={() => setShow(!show)}
        >
          {show ? "Hide password" : "Show password"}
        </button>
        <p className={styles.filterHint}>
          Use a unique password of at least 8 characters (maximum 72 UTF-8
          bytes). Share it privately with the seller; it cannot be retrieved
          later. No invitation email is sent.
        </p>
        <label>
          Shop name
          <input name="shopName" required maxLength={128} disabled={busy} />
        </label>
        <label>
          Shop description
          <textarea
            name="description"
            maxLength={1000}
            rows={3}
            disabled={busy}
          />
        </label>
        <div className={styles.dialogActions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={close}
            disabled={busy}
          >
            Cancel
          </button>
          <button className={styles.primary} disabled={busy}>
            {busy ? "Creating…" : "Create seller & shop"}
          </button>
        </div>
      </form>
    </section>
  );
}
