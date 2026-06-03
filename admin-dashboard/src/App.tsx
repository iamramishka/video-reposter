import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  Activity,
  Ban,
  BarChart3,
  CalendarPlus,
  Check,
  Copy,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogIn,
  LogOut,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Shield,
  UserRound,
  UsersRound
} from "lucide-react";

const apiUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const tokenStorageKey = "video-reposter.admin-token";

type Plan = "starter" | "pro" | "enterprise";
type Status = "pending" | "active" | "expired" | "revoked";
type Tab = "dashboard" | "licenses" | "users" | "analytics" | "account";

interface License {
  license_key: string;
  plan: Plan;
  status: Status;
  device_id: string | null;
  hostname: string | null;
  os: string | null;
  activated_at: string | null;
  expires_at: string;
  last_verified: string | null;
  user: { name: string; email: string; company: string | null } | null;
}

interface AuditLog {
  id: string;
  action: string;
  subject_type: string;
  subject_id: string | null;
  license_key: string | null;
  admin_user_email: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Customer {
  name: string;
  email: string;
  company: string | null;
  license_count: number;
  active_count: number;
  pending_count: number;
  expired_count: number;
  revoked_count: number;
  latest_activation: string | null;
}

interface Analytics {
  total: number;
  active: number;
  pending: number;
  expired: number;
  revoked: number;
  activations: number;
  expiring_soon: number;
  plans: Record<Plan, number>;
}

const planLabels: Record<Plan, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise"
};

const emptyAnalytics: Analytics = {
  total: 0,
  active: 0,
  pending: 0,
  expired: 0,
  revoked: 0,
  activations: 0,
  expiring_soon: 0,
  plans: { starter: 0, pro: 0, enterprise: 0 }
};

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [token, setToken] = useState("");
  const [licenses, setLicenses] = useState<License[]>([]);
  const [users, setUsers] = useState<Customer[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>(emptyAnalytics);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [query, setQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("iamramishka@gmail.com");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    userEmail: "",
    company: "",
    plan: "pro" as Plan,
    expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  async function api<T>(path: string, options: RequestInit = {}) {
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && token) logout("Session expired. Please sign in again.");
    if (!response.ok) throw new Error(body.message ?? "Request failed");
    return body as T;
  }

  async function login() {
    setMessage("");
    setBusy(true);
    try {
      const body = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setToken(body.token);
      window.localStorage.setItem(tokenStorageKey, body.token);
      setPassword("");
      setMessage("Signed in.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadDashboard() {
    setBusy(true);
    try {
      const [licenseBody, auditBody, userBody, analyticsBody] = await Promise.all([
        api<{ licenses: License[] }>("/api/licenses"),
        api<{ audit_logs: AuditLog[] }>("/api/audit-logs?limit=12"),
        api<{ users: Customer[] }>("/api/users"),
        api<{ analytics: Analytics }>("/api/analytics")
      ]);
      setLicenses(licenseBody.licenses ?? []);
      setAuditLogs(auditBody.audit_logs ?? []);
      setUsers(userBody.users ?? []);
      setAnalytics(analyticsBody.analytics ?? emptyAnalytics);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load dashboard data");
    } finally {
      setBusy(false);
    }
  }

  async function createLicense() {
    setMessage("");
    setBusy(true);
    try {
      const body = await api<{ license: License }>("/api/licenses", {
        method: "POST",
        body: JSON.stringify({
          plan: form.plan,
          expiresAt: new Date(form.expiresAt).toISOString(),
          user: {
            name: form.name,
            email: form.userEmail,
            company: form.company
          }
        })
      });
      setMessage(`Created ${body.license.license_key}.`);
      setForm((current) => ({ ...current, name: "", userEmail: "", company: "" }));
      await loadDashboard();
      setActiveTab("licenses");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create license");
    } finally {
      setBusy(false);
    }
  }

  async function updateLicense(license: License, patch: Partial<{ plan: Plan; expiresAt: string }>) {
    setMessage("");
    setBusy(true);
    try {
      await api("/api/license", {
        method: "PATCH",
        body: JSON.stringify({
          key: license.license_key,
          plan: patch.plan ?? license.plan,
          expiresAt: patch.expiresAt ? new Date(patch.expiresAt).toISOString() : license.expires_at,
          user: license.user
            ? { name: license.user.name, email: license.user.email, company: license.user.company ?? undefined }
            : undefined
        })
      });
      setMessage(`Updated ${license.license_key}.`);
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update license");
    } finally {
      setBusy(false);
    }
  }

  async function licenseAction(path: string, key: string, success: string, extra = {}) {
    setMessage("");
    setBusy(true);
    try {
      await api(path, {
        method: "POST",
        body: JSON.stringify({ key, ...extra })
      });
      setMessage(success);
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setMessage("");
    setBusy(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(passwordForm)
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setMessage("Password changed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  }

  function logout(nextMessage = "") {
    setToken("");
    setLicenses([]);
    setUsers([]);
    setAuditLogs([]);
    setAnalytics(emptyAnalytics);
    window.localStorage.removeItem(tokenStorageKey);
    setMessage(nextMessage);
  }

  useEffect(() => {
    const saved = window.localStorage.getItem(tokenStorageKey);
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (token) void loadDashboard();
  }, [token]);

  const filteredLicenses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return licenses.filter((license) => {
      const matchesStatus = statusFilter === "all" || license.status === statusFilter;
      const haystack = [
        license.license_key,
        license.plan,
        license.status,
        license.device_id ?? "",
        license.hostname ?? "",
        license.user?.name ?? "",
        license.user?.email ?? "",
        license.user?.company ?? ""
      ].join(" ").toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [licenses, query, statusFilter]);

  const filteredUsers = useMemo(() => {
    const needle = userQuery.trim().toLowerCase();
    return users.filter((user) => [user.name, user.email, user.company ?? ""].join(" ").toLowerCase().includes(needle));
  }, [userQuery, users]);

  if (!token) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="admin-mark"><Shield /></div>
          <h1>Admin Dashboard</h1>
          <p>Sign in to manage licenses and customers.</p>
          <label>Email</label>
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
          <label>Password</label>
          <input value={password} type="password" onChange={(event) => setPassword(event.target.value)} />
          {message && <div className="alert">{message}</div>}
          <button className="primary" onClick={login} disabled={busy}><LogIn /> {busy ? "Signing In..." : "Sign In"}</button>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside>
        <div className="brand"><Shield /> Video Reposter</div>
        <NavButton tab="dashboard" activeTab={activeTab} onClick={setActiveTab} icon={<LayoutDashboard />} label="Dashboard" />
        <NavButton tab="licenses" activeTab={activeTab} onClick={setActiveTab} icon={<KeyRound />} label="Licenses" />
        <NavButton tab="users" activeTab={activeTab} onClick={setActiveTab} icon={<UsersRound />} label="Users" />
        <NavButton tab="analytics" activeTab={activeTab} onClick={setActiveTab} icon={<BarChart3 />} label="Analytics" />
        <NavButton tab="account" activeTab={activeTab} onClick={setActiveTab} icon={<LockKeyhole />} label="Account" />
      </aside>
      <section className="workspace">
        <header>
          <div>
            <h1>{pageTitle(activeTab)}</h1>
            <p>{pageSubtitle(activeTab)}</p>
          </div>
          <div className="header-actions">
            <button onClick={loadDashboard} disabled={busy}><RefreshCcw /> {busy ? "Working..." : "Refresh"}</button>
            <button onClick={() => logout()}><LogOut /> Logout</button>
          </div>
        </header>

        {message && <div className="notice-bar">{message}</div>}

        {activeTab === "dashboard" && (
          <>
            <Stats analytics={analytics} />
            <CreateLicensePanel form={form} setForm={setForm} busy={busy} onCreate={createLicense} />
            <ActivityPanel auditLogs={auditLogs} />
          </>
        )}

        {activeTab === "licenses" && (
          <LicenseManagement
            licenses={filteredLicenses}
            query={query}
            statusFilter={statusFilter}
            busy={busy}
            setQuery={setQuery}
            setStatusFilter={setStatusFilter}
            onUpdate={updateLicense}
            onExtend={(license) => licenseAction("/api/license/renew", license.license_key, `Extended ${license.license_key} by 30 days.`, { days: 30 })}
            onReassign={(license) => {
              if (window.confirm(`Reassign ${license.license_key} to another PC? This removes the current device binding.`)) {
                void licenseAction("/api/license/reset-device", license.license_key, `Device binding removed for ${license.license_key}.`);
              }
            }}
            onRevoke={(license) => {
              if (window.confirm(`Revoke ${license.license_key}? The customer will lose access.`)) {
                void licenseAction("/api/license/revoke", license.license_key, `Revoked ${license.license_key}.`);
              }
            }}
            onCopied={(key) => setMessage(`Copied ${key}.`)}
          />
        )}

        {activeTab === "users" && (
          <UsersPage users={filteredUsers} query={userQuery} setQuery={setUserQuery} />
        )}

        {activeTab === "analytics" && (
          <>
            <Stats analytics={analytics} />
            <AnalyticsPage analytics={analytics} />
          </>
        )}

        {activeTab === "account" && (
          <AccountPage form={passwordForm} setForm={setPasswordForm} busy={busy} onChangePassword={changePassword} />
        )}
      </section>
    </main>
  );
}

function NavButton({ tab, activeTab, icon, label, onClick }: { tab: Tab; activeTab: Tab; icon: ReactNode; label: string; onClick: (tab: Tab) => void }) {
  return <button className={activeTab === tab ? "active" : ""} onClick={() => onClick(tab)}>{icon}{label}</button>;
}

function Stats({ analytics }: { analytics: Analytics }) {
  return (
    <div className="stats">
      <Stat label="Total Licenses" value={analytics.total} />
      <Stat label="Active" value={analytics.active} />
      <Stat label="Pending" value={analytics.pending} />
      <Stat label="Expiring 30 Days" value={analytics.expiring_soon} />
    </div>
  );
}

function CreateLicensePanel({ form, setForm, busy, onCreate }: {
  form: { name: string; userEmail: string; company: string; plan: Plan; expiresAt: string };
  setForm: Dispatch<SetStateAction<{ name: string; userEmail: string; company: string; plan: Plan; expiresAt: string }>>;
  busy: boolean;
  onCreate: () => void;
}) {
  const disabled = busy || !form.name.trim() || !form.userEmail.trim() || !form.expiresAt;
  return (
    <section className="create-panel">
      <h2>Create License</h2>
      <div className="create-grid">
        <input placeholder="Customer name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input placeholder="Customer email" value={form.userEmail} onChange={(event) => setForm({ ...form, userEmail: event.target.value })} />
        <input placeholder="Company" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
        <select value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value as Plan })}>
          {Object.entries(planLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} />
        <button className="primary" onClick={onCreate} disabled={disabled}><Plus /> Create</button>
      </div>
    </section>
  );
}

function LicenseManagement({
  licenses,
  query,
  statusFilter,
  busy,
  setQuery,
  setStatusFilter,
  onUpdate,
  onExtend,
  onReassign,
  onRevoke,
  onCopied
}: {
  licenses: License[];
  query: string;
  statusFilter: string;
  busy: boolean;
  setQuery: (value: string) => void;
  setStatusFilter: (value: string) => void;
  onUpdate: (license: License, patch: Partial<{ plan: Plan; expiresAt: string }>) => void;
  onExtend: (license: License) => void;
  onReassign: (license: License) => void;
  onRevoke: (license: License) => void;
  onCopied: (key: string) => void;
}) {
  return (
    <section className="table-panel">
      <div className="table-title">
        <h2>License Management</h2>
        <div className="table-tools">
          <label className="search-box">
            <Search />
            <input placeholder="Search licenses" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>
      </div>
      <div className="license-table">
        <div className="table-head">Key</div>
        <div className="table-head">Customer</div>
        <div className="table-head">Plan</div>
        <div className="table-head">Expiry</div>
        <div className="table-head">Device</div>
        <div className="table-head">Actions</div>
        {licenses.map((license) => (
          <LicenseRow
            key={license.license_key}
            license={license}
            busy={busy}
            onUpdate={onUpdate}
            onExtend={onExtend}
            onReassign={onReassign}
            onRevoke={onRevoke}
            onCopied={onCopied}
          />
        ))}
      </div>
      {licenses.length === 0 && <div className="empty-state">No licenses match the current filters.</div>}
    </section>
  );
}

function LicenseRow({ license, busy, onUpdate, onExtend, onReassign, onRevoke, onCopied }: {
  license: License;
  busy: boolean;
  onUpdate: (license: License, patch: Partial<{ plan: Plan; expiresAt: string }>) => void;
  onExtend: (license: License) => void;
  onReassign: (license: License) => void;
  onRevoke: (license: License) => void;
  onCopied: (key: string) => void;
}) {
  const [plan, setPlan] = useState<Plan>(license.plan);
  const [expiresAt, setExpiresAt] = useState(dateInputValue(license.expires_at));
  const changed = plan !== license.plan || expiresAt !== dateInputValue(license.expires_at);
  const disabled = busy || license.status === "revoked";

  useEffect(() => {
    setPlan(license.plan);
    setExpiresAt(dateInputValue(license.expires_at));
  }, [license.license_key, license.plan, license.expires_at]);

  return (
    <>
      <div className="mono">{license.license_key}</div>
      <div>
        <strong>{license.user?.name ?? "Unassigned"}</strong>
        <small>{license.user?.email ?? "No customer email"}</small>
        {license.user?.company && <small>{license.user.company}</small>}
      </div>
      <div>
        <select value={plan} onChange={(event) => setPlan(event.target.value as Plan)} disabled={disabled}>
          {Object.entries(planLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <span className={`pill ${license.status}`}>{license.status}</span>
      </div>
      <div>
        <input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} disabled={disabled} />
        <small>{daysUntil(license.expires_at)}</small>
      </div>
      <div className="mono">
        {license.device_id ? `${license.device_id.slice(0, 12)}...` : "Not bound"}
        {license.hostname && <small>{license.hostname}</small>}
      </div>
      <div className="actions">
        <button title="Copy license key" onClick={() => navigator.clipboard.writeText(license.license_key).then(() => onCopied(license.license_key))}><Copy /></button>
        <button title="Save plan or expiry changes" onClick={() => onUpdate(license, { plan, expiresAt })} disabled={!changed || disabled}><Save /></button>
        <button title="Extend expiry by 30 days" onClick={() => onExtend(license)} disabled={disabled}><CalendarPlus /></button>
        <button title="Reassign device to another PC" onClick={() => onReassign(license)} disabled={disabled}><RotateCcw /></button>
        <button title="Revoke customer access" onClick={() => onRevoke(license)} disabled={license.status === "revoked"}><Ban /></button>
      </div>
    </>
  );
}

function UsersPage({ users, query, setQuery }: { users: Customer[]; query: string; setQuery: (value: string) => void }) {
  return (
    <section className="table-panel">
      <div className="table-title">
        <h2>Customers</h2>
        <label className="search-box"><Search /><input placeholder="Search customers" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      <div className="user-table">
        <div className="table-head">Customer</div>
        <div className="table-head">Company</div>
        <div className="table-head">Licenses</div>
        <div className="table-head">Status Mix</div>
        <div className="table-head">Latest Activation</div>
        {users.map((user) => (
          <CustomerRow key={user.email} user={user} />
        ))}
      </div>
      {users.length === 0 && <div className="empty-state">No customers found.</div>}
    </section>
  );
}

function CustomerRow({ user }: { user: Customer }) {
  return (
    <>
      <div><strong>{user.name}</strong><small>{user.email}</small></div>
      <div>{user.company ?? "No company"}</div>
      <div><strong>{user.license_count}</strong></div>
      <div className="status-mix">
        <span>Active {user.active_count}</span>
        <span>Pending {user.pending_count}</span>
        <span>Expired {user.expired_count}</span>
        <span>Revoked {user.revoked_count}</span>
      </div>
      <div>{user.latest_activation ? new Date(user.latest_activation).toLocaleString() : "No activation"}</div>
    </>
  );
}

function AnalyticsPage({ analytics }: { analytics: Analytics }) {
  const maxPlan = Math.max(...Object.values(analytics.plans), 1);
  return (
    <section className="analytics-panel">
      <div className="metric-grid">
        <Metric label="Activations" value={analytics.activations} icon={<Activity />} />
        <Metric label="Revoked" value={analytics.revoked} icon={<Ban />} />
        <Metric label="Expired" value={analytics.expired} icon={<RefreshCcw />} />
      </div>
      <div className="plan-bars">
        <h2>Plan Split</h2>
        {(Object.keys(planLabels) as Plan[]).map((plan) => (
          <div className="plan-row" key={plan}>
            <span>{planLabels[plan]}</span>
            <div><i style={{ width: `${(analytics.plans[plan] / maxPlan) * 100}%` }} /></div>
            <strong>{analytics.plans[plan]}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function AccountPage({ form, setForm, busy, onChangePassword }: {
  form: { currentPassword: string; newPassword: string; confirmPassword: string };
  setForm: Dispatch<SetStateAction<{ currentPassword: string; newPassword: string; confirmPassword: string }>>;
  busy: boolean;
  onChangePassword: () => void;
}) {
  const disabled = busy || !form.currentPassword || form.newPassword.length < 10 || form.newPassword !== form.confirmPassword;
  return (
    <section className="account-panel">
      <h2>Change Password</h2>
      <div className="password-grid">
        <input type="password" placeholder="Current password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} />
        <input type="password" placeholder="New password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} />
        <input type="password" placeholder="Confirm new password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} />
        <button className="primary" onClick={onChangePassword} disabled={disabled}><Check /> Change Password</button>
      </div>
    </section>
  );
}

function ActivityPanel({ auditLogs }: { auditLogs: AuditLog[] }) {
  return (
    <section className="activity-panel">
      <div className="panel-heading"><h2>Recent Activity</h2></div>
      <div className="activity-list">
        {auditLogs.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
      </div>
      {auditLogs.length === 0 && <div className="empty-state">No activity recorded yet.</div>}
    </section>
  );
}

function ActivityRow({ entry }: { entry: AuditLog }) {
  return (
    <div className="activity-item">
      <div className="activity-dot" />
      <div>
        <strong>{formatActivityAction(entry.action)}</strong>
        <small>{entry.license_key ?? entry.subject_id ?? "License"}</small>
      </div>
      <div className="activity-meta">
        <span>{entry.admin_user_email ? `By ${entry.admin_user_email}` : entry.subject_type}</span>
        <time>{new Date(entry.created_at).toLocaleString()}</time>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat-card"><strong>{value}</strong><span>{label}</span></div>;
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <div className="metric-card">{icon}<strong>{value}</strong><span>{label}</span></div>;
}

function pageTitle(tab: Tab) {
  return ({ dashboard: "Admin Dashboard", licenses: "Licenses", users: "Users", analytics: "Analytics", account: "Account" } satisfies Record<Tab, string>)[tab];
}

function pageSubtitle(tab: Tab) {
  return ({
    dashboard: "Create licenses and review recent activity.",
    licenses: "Manage plans, expiry, device bindings, and revocations.",
    users: "Customer accounts grouped from license records.",
    analytics: "License, activation, and plan performance.",
    account: "Update admin sign-in security."
  } satisfies Record<Tab, string>)[tab];
}

function formatActivityAction(action: string) {
  return action.replace("license.", "").replace(/_/g, " ");
}

function dateInputValue(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function daysUntil(value: string) {
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Expires today";
  return `${days} days left`;
}
