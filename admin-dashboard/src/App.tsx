import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Ban,
  CalendarPlus,
  Copy,
  KeyRound,
  LayoutDashboard,
  LogOut,
  LogIn,
  Plus,
  RefreshCcw,
  Search,
  Shield,
  UserRound
} from "lucide-react";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const tokenStorageKey = "video-reposter.admin-token";

interface License {
  license_key: string;
  plan: "starter" | "pro" | "enterprise";
  status: "pending" | "active" | "expired" | "revoked";
  device_id: string | null;
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
  admin_user_id: string | null;
  admin_user_email: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export default function AdminDashboard() {
  const [token, setToken] = useState("");
  const [licenses, setLicenses] = useState<License[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activityQuery, setActivityQuery] = useState("");
  const [activityActionFilter, setActivityActionFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("admin@videoreposter.local");
  const [password, setPassword] = useState("admin12345");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    key: "",
    name: "John Doe",
    userEmail: "john.doe@example.com",
    company: "Demo Studio",
    plan: "pro",
    expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)
  });

  async function login() {
    setMessage("");
    setBusy(true);
    const response = await fetch(`${apiUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(body.message ?? "Login failed");
      return;
    }
    setToken(body.token);
    window.localStorage.setItem(tokenStorageKey, body.token);
  }

  async function loadDashboard() {
    setBusy(true);
    let licenseResponse: Response;
    let auditResponse: Response;
    try {
      [licenseResponse, auditResponse] = await Promise.all([
        fetch(`${apiUrl}/api/licenses`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/audit-logs?limit=8`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
    } catch {
      setBusy(false);
      setMessage("Could not reach the backend API. Check that it is running on port 4000.");
      return;
    }
    const licenseBody = await licenseResponse.json();
    const auditBody = await auditResponse.json();
    setBusy(false);

    if (licenseResponse.status === 401 || auditResponse.status === 401) {
      setMessage("Session expired. Please sign in again.");
      logout();
      return;
    }
    if (!licenseResponse.ok) {
      setMessage(licenseBody.message ?? "Could not load licenses");
      return;
    }
    if (!auditResponse.ok) {
      setMessage(auditBody.message ?? "Could not load activity");
      return;
    }
    setLicenses(licenseBody.licenses ?? []);
    setAuditLogs(auditBody.audit_logs ?? []);
  }

  async function createLicense() {
    setMessage("");
    setBusy(true);
    const response = await fetch(`${apiUrl}/api/licenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        key: form.key || undefined,
        plan: form.plan,
        expiresAt: new Date(form.expiresAt).toISOString(),
        user: {
          name: form.name,
          email: form.userEmail,
          company: form.company
        }
      })
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(body.message ?? "Could not create license");
      return;
    }
    setForm((current) => ({ ...current, key: "" }));
    await loadDashboard();
  }

  async function action(path: string, key: string, extra = {}) {
    setMessage("");
    setBusy(true);
    const response = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, ...extra })
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) setMessage(body.message ?? "Action failed");
    await loadDashboard();
  }

  function confirmAction(message: string, callback: () => void) {
    if (window.confirm(message)) callback();
  }

  function logout() {
    setToken("");
    setLicenses([]);
    setAuditLogs([]);
    window.localStorage.removeItem(tokenStorageKey);
  }

  useEffect(() => {
    const saved = window.localStorage.getItem(tokenStorageKey);
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (token) void loadDashboard();
  }, [token]);

  const stats = useMemo(() => {
    const total = licenses.length;
    const active = licenses.filter((license) => license.status === "active").length;
    const revoked = licenses.filter((license) => license.status === "revoked").length;
    const expiring = licenses.filter((license) => {
      const days = (new Date(license.expires_at).getTime() - Date.now()) / 86_400_000;
      return days >= 0 && days <= 30;
    }).length;
    return { total, active, revoked, expiring };
  }, [licenses]);

  const filteredLicenses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return licenses.filter((license) => {
      const matchesStatus = statusFilter === "all" || license.status === statusFilter;
      const haystack = [
        license.license_key,
        license.plan,
        license.status,
        license.device_id ?? "",
        license.user?.name ?? "",
        license.user?.email ?? "",
        license.user?.company ?? ""
      ].join(" ").toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [licenses, query, statusFilter]);

  const activityActions = useMemo(() => {
    return Array.from(new Set(auditLogs.map((entry) => entry.action))).sort();
  }, [auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    const needle = activityQuery.trim().toLowerCase();
    return auditLogs.filter((entry) => {
      const metadata = entry.metadata ?? {};
      const matchesAction = activityActionFilter === "all" || entry.action === activityActionFilter;
      const haystack = [
        formatActivityAction(entry.action),
        entry.action,
        entry.subject_type,
        entry.subject_id ?? "",
        entry.license_key ?? "",
        entry.admin_user_email ?? "",
        ...Object.values(metadata).map((value) => String(value ?? ""))
      ].join(" ").toLowerCase();
      return matchesAction && (!needle || haystack.includes(needle));
    });
  }, [activityActionFilter, activityQuery, auditLogs]);

  if (!token) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="admin-mark"><Shield /></div>
          <h1>Admin Dashboard</h1>
          <p>Sign in to manage licenses and activation devices.</p>
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
        <button className="active"><LayoutDashboard /> Dashboard</button>
        <button><KeyRound /> Licenses</button>
        <button><UserRound /> Users</button>
        <button><Activity /> Analytics</button>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <h1>Admin Dashboard</h1>
            <p>License activation, device binding, and renewal control.</p>
          </div>
          <div className="header-actions">
            <button onClick={loadDashboard} disabled={busy}><RefreshCcw /> {busy ? "Working..." : "Refresh"}</button>
            <button onClick={logout}><LogOut /> Logout</button>
          </div>
        </header>

        <div className="stats">
          <Stat label="Total Licenses" value={stats.total} />
          <Stat label="Active" value={stats.active} />
          <Stat label="Revoked" value={stats.revoked} />
          <Stat label="Expiring 30 Days" value={stats.expiring} />
        </div>

        <section className="activity-panel">
          <div className="panel-heading">
            <h2>Recent Activity</h2>
            <div className="activity-tools">
              <label className="search-box compact">
                <Search />
                <input placeholder="Search activity" value={activityQuery} onChange={(event) => setActivityQuery(event.target.value)} />
              </label>
              <select value={activityActionFilter} onChange={(event) => setActivityActionFilter(event.target.value)}>
                <option value="all">All Actions</option>
                {activityActions.map((action) => (
                  <option key={action} value={action}>{formatActivityAction(action)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="activity-list">
            {filteredAuditLogs.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </div>
          {auditLogs.length === 0 && <div className="empty-state">No activity recorded yet.</div>}
          {auditLogs.length > 0 && filteredAuditLogs.length === 0 && <div className="empty-state">No activity matches the current filters.</div>}
        </section>

        <section className="create-panel">
          <h2>Create License</h2>
          <div className="create-grid">
            <input placeholder="Optional key" value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value.toUpperCase() })} />
            <input placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <input placeholder="Email" value={form.userEmail} onChange={(event) => setForm({ ...form, userEmail: event.target.value })} />
            <input placeholder="Company" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
            <select value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })}>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
            <input type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} />
            <button className="primary" onClick={createLicense}><Plus /> Create</button>
          </div>
          {message && <div className="alert">{message}</div>}
        </section>

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
            <div className="table-head">User</div>
            <div className="table-head">Plan</div>
            <div className="table-head">Status</div>
            <div className="table-head">Device</div>
            <div className="table-head">Actions</div>
            {filteredLicenses.map((license) => (
              <LicenseRow
                key={license.license_key}
                license={license}
                onRevoke={() => confirmAction(`Revoke ${license.license_key}?`, () => action("/api/license/revoke", license.license_key))}
                onRenew={() => action("/api/license/renew", license.license_key, { days: 30 })}
                onReset={() => confirmAction(`Reset device binding for ${license.license_key}?`, () => action("/api/license/reset-device", license.license_key))}
              />
            ))}
          </div>
          {filteredLicenses.length === 0 && <div className="empty-state">No licenses match the current filters.</div>}
        </section>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function formatActivityAction(action: string) {
  return action.replace("license.", "").replace(/_/g, " ");
}

function ActivityRow({ entry }: { entry: AuditLog }) {
  const metadata = entry.metadata ?? {};
  const details = [
    entry.admin_user_email ? `By ${entry.admin_user_email}` : null,
    typeof metadata.plan === "string" ? metadata.plan : null,
    typeof metadata.deviceId === "string" ? `Device ${metadata.deviceId.toString().slice(0, 12)}...` : null,
    typeof metadata.days === "number" ? `${metadata.days} days` : null,
    typeof metadata.previousDeviceId === "string" ? "Device reset" : null
  ].filter(Boolean);

  return (
    <div className="activity-item">
      <div className="activity-dot" />
      <div>
        <strong>{formatActivityAction(entry.action)}</strong>
        <small>{entry.license_key ?? entry.subject_id ?? "License"}</small>
      </div>
      <div className="activity-meta">
        <span>{details.join(" / ") || entry.subject_type}</span>
        <time>{new Date(entry.created_at).toLocaleString()}</time>
      </div>
    </div>
  );
}

function LicenseRow({
  license,
  onRevoke,
  onRenew,
  onReset
}: {
  license: License;
  onRevoke: () => void;
  onRenew: () => void;
  onReset: () => void;
}) {
  return (
    <>
      <div className="mono">{license.license_key}</div>
      <div>
        <strong>{license.user?.name ?? "Unassigned"}</strong>
        <small>{license.user?.email ?? "No user"}</small>
      </div>
      <div>{license.plan}</div>
      <div><span className={`pill ${license.status}`}>{license.status}</span></div>
      <div className="mono">{license.device_id ? `${license.device_id.slice(0, 12)}...` : "Not bound"}</div>
      <div className="actions">
        <button title="Copy key" onClick={() => navigator.clipboard.writeText(license.license_key)}><Copy /></button>
        <button title={license.status === "revoked" ? "Revoked licenses cannot be renewed" : "Extend 30 days"} onClick={onRenew} disabled={license.status === "revoked"}><CalendarPlus /></button>
        <button title={license.status === "revoked" ? "Revoked licenses cannot be reset" : "Reset device"} onClick={onReset} disabled={license.status === "revoked"}><RefreshCcw /></button>
        <button title="Revoke" onClick={onRevoke} disabled={license.status === "revoked"}><Ban /></button>
      </div>
    </>
  );
}
