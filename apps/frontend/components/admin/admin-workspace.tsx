"use client";

import Link from "next/link";
import { BrandLogo } from "../brand-logo";
import { useRef, useState } from "react";
import { Icon } from "../layout/icons";
import { useApp } from "../providers";
import { AdminLiveSection } from "./admin-live-section";
import styles from "./admin-workspace.module.css";

const sections = [
  {
    id: "overview",
    label: "Overview",
    icon: "grid",
    description: "A clear view of your platform, people and operations.",
  },
  {
    id: "users",
    label: "Users",
    icon: "user",
    description: "Find accounts and manage access to RoboNest.",
  },
  {
    id: "sellers",
    label: "Sellers & shops",
    icon: "bag",
    description: "Bring sellers on board and connect them to their shops.",
  },
  {
    id: "health",
    label: "Platform health",
    icon: "box",
    description: "Understand service availability before taking action.",
  },
  {
    id: "activity",
    label: "Activity log",
    icon: "menu",
    description: "A traceable record of administrative changes.",
  },
] as const;
type Section = (typeof sections)[number]["id"];
const services = ["Account service", "Product catalog", "Orders", "Inventory"];

export function AdminWorkspace({ preview = false }: { preview?: boolean }) {
  const { user } = useApp();
  const [section, setSection] = useState<Section>("overview");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const current = sections.find((item) => item.id === section)!;
  function navigate(next: Section) {
    setSection(next);
    setSearch("");
    setRole("all");
    setStatus("all");
    requestAnimationFrame(() => heading.current?.focus());
  }
  const identity = preview
    ? "Design review"
    : user?.fullName || "Administrator";

  return (
    <div className={styles.workspace}>
      <aside className={styles.sidebar}>
        <BrandLogo className={styles.brand} />
        <div className={styles.workspaceLabel}>
          <span className={styles.workspaceIcon}>
            <Icon name="grid" size={17} />
          </span>
          <div>
            <strong>Platform workspace</strong>
            <small>Administration</small>
          </div>
        </div>
        <p className={styles.navLabel}>MANAGE</p>
        <nav aria-label="Admin navigation" className={styles.navigation}>
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <Icon name={item.icon} size={19} />
              {item.label}
              {section === item.id && <span className={styles.activeDot} />}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.scopeNote}>
            <strong>Built for your builders.</strong>
            <p>
              People, shops and operations. One place to keep RoboNest moving.
            </p>
          </div>
          <Link href="/">
            <Icon name="arrow" size={17} /> View storefront
          </Link>
          <Link href="/profile">
            <span className={styles.avatar}>{identity.slice(0, 1)}</span>
            <span>
              <strong>{identity}</strong>
              <small>{preview ? "Layout preview" : "Admin account"}</small>
            </span>
            <Icon name="arrow" size={16} />
          </Link>
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <span>
            Workspace <span className={styles.slash}>/</span>{" "}
            <strong>{current.label}</strong>
          </span>
          <Link href="/profile">
            <Icon name="user" size={17} /> My profile
          </Link>
        </header>
        <div className={styles.content}>
          {preview && <div className={styles.previewNotice}>
            <span className={styles.outlineBadge}>DESIGN PREVIEW</span>
            <span>
              Explore the workspace. Administrative data and changes are not
              connected yet.
            </span>
          </div>
          }
          <div className={styles.titleRow}>
            <div>
              <span className={styles.eyebrow}>ROBONEST ADMIN</span>
              <h1 ref={heading} tabIndex={-1}>
                {current.label === "Overview"
                  ? "Your platform, at a glance."
                  : current.label}
              </h1>
              <p>{current.description}</p>
            </div>
            {preview && (section === "overview" || section === "sellers") && (
              <button
                className={styles.primary}
                onClick={() => dialog.current?.showModal()}
              >
                <span aria-hidden="true">＋</span> Preview seller setup
              </button>
            )}
          </div>

          {!preview ? <AdminLiveSection key={section} section={section} navigate={navigate} /> : <>
          {section === "overview" && (
            <>
              <div className={styles.metrics}>
                {[
                  ["Customers", "Registered customer accounts", "users"],
                  ["Sellers", "Accounts with seller access", "sellers"],
                  [
                    "Active shops",
                    "Shops available on the platform",
                    "sellers",
                  ],
                  [
                    "Suspended accounts",
                    "Accounts with restricted access",
                    "users",
                  ],
                ].map(([label, caption, target]) => (
                  <button
                    className={styles.metric}
                    key={label}
                    onClick={() => navigate(target as Section)}
                  >
                    <span>
                      {label}
                      <Icon name="arrow" size={17} />
                    </span>
                    <strong aria-label="Not available">—</strong>
                    <small>{caption}</small>
                    <span className={styles.metricStatus}>Not connected</span>
                  </button>
                ))}
              </div>
              <div className={styles.columns}>
                <section className={styles.panel}>
                  <div className={styles.panelHeading}>
                    <div>
                      <h2>Workspace essentials</h2>
                      <p>Start with the people behind your platform.</p>
                    </div>
                    <span className={styles.outlineBadge}>GET STARTED</span>
                  </div>
                  <button
                    className={styles.taskRow}
                    onClick={() => navigate("users")}
                  >
                    <span className={styles.taskIcon}>
                      <Icon name="user" />
                    </span>
                    <span>
                      <strong>Manage your users</strong>
                      <small>
                        Find customer and seller accounts, review access.
                      </small>
                    </span>
                    <Icon name="arrow" size={18} />
                  </button>
                  <button
                    className={styles.taskRow}
                    onClick={() => navigate("sellers")}
                  >
                    <span className={styles.taskIcon}>
                      <Icon name="bag" />
                    </span>
                    <span>
                      <strong>Build your seller network</strong>
                      <small>
                        Set up sellers and connect each one to a shop.
                      </small>
                    </span>
                    <Icon name="arrow" size={18} />
                  </button>
                  <button
                    className={styles.taskRow}
                    onClick={() => navigate("activity")}
                  >
                    <span className={styles.taskIcon}>
                      <Icon name="menu" />
                    </span>
                    <span>
                      <strong>Keep changes accountable</strong>
                      <small>Review who changed what, and when.</small>
                    </span>
                    <Icon name="arrow" size={18} />
                  </button>
                </section>
                <section className={styles.panel}>
                  <div className={styles.panelHeading}>
                    <div>
                      <h2>Service availability</h2>
                      <p>No health checks have run.</p>
                    </div>
                  </div>
                  {services.map((service) => (
                    <div className={styles.serviceRow} key={service}>
                      <span>
                        <i />
                        {service}
                      </span>
                      <span className={styles.badge}>Not checked</span>
                    </div>
                  ))}
                  <button
                    className={styles.textButton}
                    onClick={() => navigate("health")}
                  >
                    Open platform health <Icon name="arrow" size={16} />
                  </button>
                </section>
              </div>
              <section className={styles.panel}>
                <div className={styles.panelHeading}>
                  <div>
                    <h2>Recent activity</h2>
                    <p>
                      Administrative actions will appear here once connected.
                    </p>
                  </div>
                  <button
                    className={styles.textButton}
                    onClick={() => navigate("activity")}
                  >
                    View activity <Icon name="arrow" size={16} />
                  </button>
                </div>
                <Unavailable
                  icon="menu"
                  title="Activity history is not connected"
                  text="User access changes and seller setup will be recorded here when those operations are available."
                />
              </section>
            </>
          )}

          {(section === "users" || section === "sellers") && (
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <h2>
                    {section === "users" ? "All users" : "Seller directory"}
                  </h2>
                  <p>
                    {section === "users"
                      ? "Customers, sellers and administrators."
                      : "Seller accounts and their assigned shops."}
                  </p>
                </div>
                <span className={styles.badge}>Not connected</span>
              </div>
              <div className={styles.filters}>
                <label className={styles.search}>
                  <Icon name="search" size={18} />
                  <input
                    type="search"
                    aria-label={
                      section === "users" ? "Search users" : "Search sellers"
                    }
                    placeholder="Search by name or email"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                {section === "users" && (
                  <label>
                    Role
                    <select
                      aria-label="Role"
                      value={role}
                      onChange={(event) => setRole(event.target.value)}
                    >
                      <option value="all">All roles</option>
                      <option>Customer</option>
                      <option>Shopkeeper</option>
                      <option>Admin</option>
                    </select>
                  </label>
                )}
                <label>
                  Status
                  <select
                    aria-label="Status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    <option value="all">All statuses</option>
                    <option>Active</option>
                    <option>Suspended</option>
                  </select>
                </label>
                {(search || role !== "all" || status !== "all") && (
                  <button
                    className={styles.textButton}
                    onClick={() => {
                      setSearch("");
                      setRole("all");
                      setStatus("all");
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
              <p className={styles.filterHint}>
                Search and filters are a layout preview. No account records have
                been loaded.
              </p>
              <div className={styles.tableScroll}>
                <table>
                  <caption className="sr-only">
                    {section === "users"
                      ? "User directory"
                      : "Seller directory"}{" "}
                    — data unavailable
                  </caption>
                  <thead>
                    <tr>
                      <th>Name / email</th>
                      <th>{section === "users" ? "Role" : "Assigned shop"}</th>
                      <th>Status</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={4}>
                        <Unavailable
                          icon={section === "users" ? "user" : "bag"}
                          title={
                            section === "users"
                              ? "User directory is not connected"
                              : "Seller directory is not connected"
                          }
                          text="Accounts will appear here when the admin service is available. This is not an empty account list."
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {section === "health" && (
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <h2>Service status</h2>
                  <p>Last checked: never</p>
                </div>
                <button className={styles.secondary} disabled>
                  Run health checks
                </button>
              </div>
              <div className={styles.healthGrid}>
                {services.map((service) => (
                  <div className={styles.healthCard} key={service}>
                    <Icon name="box" />
                    <h3>{service}</h3>
                    <span className={styles.badge}>Unknown</span>
                    <p>No live health result is available.</p>
                  </div>
                ))}
              </div>
              <p className={styles.filterHint}>
                Health checks are not connected. Unknown does not mean healthy
                or offline.
              </p>
            </section>
          )}

          {section === "activity" && (
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <h2>Administrative activity</h2>
                  <p>Actor, action, affected account, timestamp and reason.</p>
                </div>
                <span className={styles.badge}>Not connected</span>
              </div>
              <Unavailable
                icon="menu"
                title="Audit history is not available yet"
                text="Once connected, access changes and seller provisioning will leave a persistent record here."
              />
            </section>
          )}
          </>}
          <footer className={styles.footer}>
            <span>RoboNest · Platform administration</span>
            <span>{preview ? "Workspace design · Brick A" : "Secure account operations"}</span>
          </footer>
        </div>
      </div>
      {preview && <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="seller-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className={styles.dialogHeading}>
          <div>
            <span className={styles.eyebrow}>SELLER ONBOARDING</span>
            <h2 id="seller-title">Set up a seller</h2>
          </div>
          <button
            className={styles.close}
            aria-label="Close seller setup"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        <p>Connect a seller account to the shop they manage.</p>
        <div className={styles.formNotice}>
          Form preview only. Nothing entered here will be saved or sent.
        </div>
        <form onSubmit={(event) => event.preventDefault()}>
          <fieldset>
            <legend>01 · Seller details</legend>
            <label>
              Full name
              <input autoComplete="off" placeholder="Seller’s full name" />
            </label>
            <label>
              Email address
              <input
                type="email"
                autoComplete="off"
                placeholder="seller@example.com"
              />
            </label>
          </fieldset>
          <fieldset>
            <legend>02 · Shop details</legend>
            <label>
              Shop name
              <input placeholder="Business or shop name" />
            </label>
            <label>
              Shop description
              <textarea
                rows={3}
                placeholder="What does this shop specialise in?"
              />
            </label>
          </fieldset>
          <p className={styles.filterHint}>
            Seller access and shop assignment will be created together after the
            service is connected.
          </p>
          <div className={styles.dialogActions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => dialog.current?.close()}
            >
              Close preview
            </button>
            <button className={styles.primary} type="button" disabled>
              Create seller & shop
            </button>
          </div>
        </form>
      </dialog>}
    </div>
  );
}

function Unavailable({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className={styles.unavailable}>
      <span className={styles.emptyIcon}>
        <Icon name={icon} size={24} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
