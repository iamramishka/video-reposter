import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  Activity,
  Ban,
  BarChart3,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  Copy,
  CreditCard,
  Download,
  Eye,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogIn,
  LogOut,
  MessageCircle,
  PackageCheck,
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
const activityPageSize = 6;

type Plan = "starter" | "pro" | "enterprise";
type Status = "pending" | "active" | "expired" | "revoked";
type Tab = "dashboard" | "licenses" | "users" | "analytics" | "packages" | "payments" | "logins" | "account";
type AdminRole = "super_admin" | "admin" | "read_only";
type ExpiryFilter = "all" | "1" | "7" | "14" | "30" | "expired";
type DeviceFilter = "all" | "bound" | "unbound";

interface License {
  license_key: string;
  plan: Plan;
  package_limits?: PackageLimits;
  status: Status;
  device_id: string | null;
  hostname: string | null;
  os: string | null;
  activated_at: string | null;
  expires_at: string;
  last_verified: string | null;
  user: { name: string; email: string; company: string | null } | null;
}

interface PackageLimits {
  video_limit: number;
  template_limit: number;
  worker_limit: number;
}

interface PackageDefinition extends PackageLimits {
  plan: Plan;
  updated_at: string;
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
  id: string;
  name: string;
  email: string;
  company: string | null;
  disabled_at: string | null;
  deleted_at: string | null;
  retention_until: string | null;
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
  daily_activations: { date: string; count: number }[];
}

interface ProcessingAnalytics {
  total: number;
  complete: number;
  failed: number;
  average_elapsed_ms: number;
  average_throughput_mb_per_min: number;
  presets: Record<string, number>;
  top_error_codes: { error_code: string; count: number }[];
  recent: Array<{
    id: string;
    job_id: string;
    status: "complete" | "failed";
    preset: string;
    elapsed_ms: number;
    throughput_mb_per_min: number | null;
    input_size_bytes: number | null;
    error_code: string | null;
    created_at: string;
  }>;
}

interface StripeInvoice {
  id: string;
  customer_email: string | null;
  amount_paid: number;
  currency: string;
  status: string;
  created: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  period_start: number;
  period_end: number;
}

interface PaymentSummary {
  configured: boolean;
  mrr?: number;
  arr?: number;
  activeSubscriptions?: number;
  churnRate?: number;
  churnedSubscriptions?: number;
  currency?: string;
}

interface SessionSettings {
  timeoutMinutes: number;
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
  plans: { starter: 0, pro: 0, enterprise: 0 },
  daily_activations: []
};

const emptyProcessingAnalytics: ProcessingAnalytics = {
  total: 0,
  complete: 0,
  failed: 0,
  average_elapsed_ms: 0,
  average_throughput_mb_per_min: 0,
  presets: {},
  top_error_codes: [],
  recent: []
};

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [token, setToken] = useState("");
  const [admin, setAdmin] = useState<{ email: string; role: AdminRole } | null>(null);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(480);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [users, setUsers] = useState<Customer[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>(emptyAnalytics);
  const [processingAnalytics, setProcessingAnalytics] = useState<ProcessingAnalytics>(emptyProcessingAnalytics);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loginAuditLogs, setLoginAuditLogs] = useState<AuditLog[]>([]);
  const [packages, setPackages] = useState<PackageDefinition[]>([]);
  const [query, setQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [packageQuery, setPackageQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState<Plan | "all">("all");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>("all");
  const [companyFilter, setCompanyFilter] = useState("");
  const [packageFilter, setPackageFilter] = useState<Plan | "all">("all");
  const [selectedLicenseKey, setSelectedLicenseKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    userEmail: "",
    company: "",
    plan: "pro" as Plan,
    expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)
  });
  const [bulkForm, setBulkForm] = useState({
    count: 10,
    plan: "pro" as Plan,
    expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)
  });
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    company: ""
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [invoices, setInvoices] = useState<StripeInvoice[]>([]);
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [checkoutPlan, setCheckoutPlan] = useState<Plan>("pro");
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");

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
      const body = await api<{
        token: string;
        expires_at: string | null;
        session: SessionSettings;
        admin: { email: string; role: AdminRole };
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setToken(body.token);
      setAdmin(body.admin);
      setSessionTimeoutMinutes(body.session.timeoutMinutes);
      setSessionExpiresAt(body.expires_at);
      window.localStorage.setItem(tokenStorageKey, body.token);
      setPassword("");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadDashboard() {
    setBusy(true);
    try {
      const [licenseBody, auditBody, loginAuditBody, userBody, analyticsBody, processingBody, sessionBody] = await Promise.all([
        api<{ licenses: License[] }>("/api/licenses"),
        api<{ audit_logs: AuditLog[] }>("/api/audit-logs?limit=100"),
        api<{ audit_logs: AuditLog[] }>("/api/audit-logs/logins?limit=100"),
        api<{ users: Customer[] }>("/api/users"),
        api<{ analytics: Analytics }>("/api/analytics"),
        api<{ processing: ProcessingAnalytics }>("/api/analytics/processing"),
        api<{ session: SessionSettings }>("/api/auth/session-settings")
      ]);
      const packageBody = await api<{ packages: PackageDefinition[] }>("/api/packages");
      setLicenses(licenseBody.licenses ?? []);
      setAuditLogs(auditBody.audit_logs ?? []);
      setLoginAuditLogs(loginAuditBody.audit_logs ?? []);
      setUsers(userBody.users ?? []);
      setAnalytics(analyticsBody.analytics ?? emptyAnalytics);
      setProcessingAnalytics(processingBody.processing ?? emptyProcessingAnalytics);
      setSessionTimeoutMinutes(sessionBody.session.timeoutMinutes);
      setPackages(packageBody.packages ?? []);
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

  async function createBulkLicenses() {
    setMessage("");
    setBusy(true);
    try {
      const body = await api<{ licenses: License[] }>("/api/licenses/bulk", {
        method: "POST",
        body: JSON.stringify({
          count: bulkForm.count,
          plan: bulkForm.plan,
          expiresAt: new Date(bulkForm.expiresAt).toISOString()
        })
      });
      setMessage(`Created ${body.licenses.length} ${planLabels[bulkForm.plan]} licenses.`);
      await loadDashboard();
      setActiveTab("licenses");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create bulk licenses");
    } finally {
      setBusy(false);
    }
  }

  async function createUser() {
    setMessage("");
    setBusy(true);
    try {
      const body = await api<{ user: Customer }>("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: userForm.name,
          email: userForm.email,
          company: userForm.company || undefined
        })
      });
      setMessage(`Created user ${body.user.email}.`);
      setUserForm({ name: "", email: "", company: "" });
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create user");
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(user: Customer, patch: Partial<{ name: string; email: string; company: string | null }>) {
    setMessage("");
    setBusy(true);
    try {
      const body = await api<{ user: Customer }>(`/api/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      setMessage(`Updated ${body.user.email}.`);
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update user");
    } finally {
      setBusy(false);
    }
  }

  async function setUserDisabled(user: Customer, disabled: boolean) {
    setMessage("");
    setBusy(true);
    try {
      await api(`/api/users/${user.id}/disabled`, {
        method: "PATCH",
        body: JSON.stringify({ disabled })
      });
      setMessage(`${disabled ? "Disabled" : "Enabled"} ${user.email}.`);
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update user status");
    } finally {
      setBusy(false);
    }
  }

  async function softDeleteUser(user: Customer) {
    if (!window.confirm(`Soft-delete ${user.email}? Their licenses will be revoked and retained for 30 days.`)) return;
    setMessage("");
    setBusy(true);
    try {
      await api(`/api/users/${user.id}`, {
        method: "DELETE",
        body: JSON.stringify({ retentionDays: 30 })
      });
      setMessage(`Soft-deleted ${user.email}.`);
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete user");
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

  async function updatePackage(definition: PackageDefinition, patch: PackageLimits) {
    setMessage("");
    setBusy(true);
    try {
      await api(`/api/packages/${definition.plan}`, {
        method: "PATCH",
        body: JSON.stringify({
          videoLimit: patch.video_limit,
          templateLimit: patch.template_limit,
          workerLimit: patch.worker_limit
        })
      });
      setMessage(`Updated ${planLabels[definition.plan]} limits.`);
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update package limits");
    } finally {
      setBusy(false);
    }
  }

  async function licenseAction(path: string, key: string, success: string, extra: Record<string, unknown> = {}, onDone?: () => void) {
    setMessage("");
    setBusy(true);
    try {
      await api(path, {
        method: "POST",
        body: JSON.stringify({ key, ...extra })
      });
      setMessage(success);
      await loadDashboard();
      onDone?.();
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

  async function updateSessionTimeout() {
    setMessage("");
    setBusy(true);
    try {
      const body = await api<{ token: string; expires_at: string | null; session: SessionSettings }>("/api/auth/session-settings", {
        method: "PATCH",
        body: JSON.stringify({ timeoutMinutes: sessionTimeoutMinutes })
      });
      setToken(body.token);
      setSessionTimeoutMinutes(body.session.timeoutMinutes);
      setSessionExpiresAt(body.expires_at);
      window.localStorage.setItem(tokenStorageKey, body.token);
      setMessage("Session timeout updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update session timeout");
    } finally {
      setBusy(false);
    }
  }

  function logout(nextMessage = "") {
    setToken("");
    setAdmin(null);
    setSessionExpiresAt(null);
    setLicenses([]);
    setUsers([]);
    setAuditLogs([]);
    setLoginAuditLogs([]);
    setAnalytics(emptyAnalytics);
    setProcessingAnalytics(emptyProcessingAnalytics);
    window.localStorage.removeItem(tokenStorageKey);
    setMessage(nextMessage);
  }

  async function loadPayments() {
    try {
      const summary = await api<PaymentSummary>("/api/payments/summary");
      setPaymentSummary(summary);
    } catch {
      setPaymentSummary({ configured: false });
    }
  }

  async function createCheckoutLink() {
    setBusy(true);
    setCheckoutUrl("");
    setMessage("");
    try {
      const origin = window.location.origin;
      const result = await api<{ url: string }>("/api/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ plan: checkoutPlan, email: checkoutEmail, successUrl: `${origin}/`, cancelUrl: `${origin}/` })
      });
      setCheckoutUrl(result.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create checkout link");
    } finally {
      setBusy(false);
    }
  }

  async function loadInvoices() {
    if (!invoiceEmail.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ invoices: StripeInvoice[] }>(`/api/payments/invoices?email=${encodeURIComponent(invoiceEmail)}`);
      setInvoices(result.invoices ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load invoices");
    } finally {
      setBusy(false);
    }
  }

  async function exportAnalyticsPdf() {
    try {
      const res = await fetch(`${apiUrl}/api/analytics/export/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage("PDF export failed. Try again.");
    }
  }

  useEffect(() => {
    const saved = window.localStorage.getItem(tokenStorageKey);
    if (saved) {
      const parsed = parseTokenSession(saved);
      setToken(saved);
      setAdmin(parsed?.admin ?? null);
      setSessionExpiresAt(parsed?.expiresAt ?? null);
    }
  }, []);

  useEffect(() => {
    if (token) void loadDashboard();
  }, [token]);

  useEffect(() => {
    if (!token || !sessionExpiresAt) return;
    const msUntilExpiry = new Date(sessionExpiresAt).getTime() - Date.now();
    if (msUntilExpiry <= 0) {
      logout("Session expired. Please sign in again.");
      return;
    }
    const timeout = window.setTimeout(() => logout("Session expired. Please sign in again."), Math.min(msUntilExpiry, 2_147_483_647));
    return () => window.clearTimeout(timeout);
  }, [token, sessionExpiresAt]);

  useEffect(() => {
    if (activeTab === "payments" && token && !paymentSummary) void loadPayments();
  }, [activeTab, token]);

  const filteredLicenses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return licenses.filter((license) => {
      const matchesStatus = statusFilter === "all" || license.status === statusFilter;
      const matchesPlan = planFilter === "all" || license.plan === planFilter;
      const matchesExpiry = matchesExpiryWindow(license, expiryFilter);
      const matchesDevice = deviceFilter === "all" || (deviceFilter === "bound" ? Boolean(license.device_id) : !license.device_id);
      const matchesCompany = !companyFilter.trim() || (license.user?.company ?? "").toLowerCase().includes(companyFilter.trim().toLowerCase());
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
      return matchesStatus && matchesPlan && matchesExpiry && matchesDevice && matchesCompany && (!needle || haystack.includes(needle));
    });
  }, [companyFilter, deviceFilter, expiryFilter, licenses, planFilter, query, statusFilter]);

  const filteredUsers = useMemo(() => {
    const needle = userQuery.trim().toLowerCase();
    return users.filter((user) => [user.name, user.email, user.company ?? ""].join(" ").toLowerCase().includes(needle));
  }, [userQuery, users]);

  const filteredPackageLicenses = useMemo(() => {
    const needle = packageQuery.trim().toLowerCase();
    return licenses.filter((license) => {
      const matchesPackage = packageFilter === "all" || license.plan === packageFilter;
      const haystack = [
        license.license_key,
        planLabels[license.plan],
        license.plan,
        license.status,
        license.device_id ?? "",
        license.hostname ?? "",
        license.user?.name ?? "",
        license.user?.email ?? "",
        license.user?.company ?? ""
      ].join(" ").toLowerCase();
      return matchesPackage && (!needle || haystack.includes(needle));
    });
  }, [licenses, packageFilter, packageQuery]);

  const packageSummaries = useMemo(() => getPackageSummaries(licenses), [licenses]);
  const expiringLicenses = useMemo(() => licenses
    .filter((license) => license.status !== "revoked" && daysUntilNumber(license.expires_at) <= 30)
    .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime()), [licenses]);
  const selectedLicense = useMemo(() => licenses.find((license) => license.license_key === selectedLicenseKey) ?? null, [licenses, selectedLicenseKey]);
  const selectedAuditLogs = useMemo(() => selectedLicense ? auditLogs.filter((entry) => entry.license_key === selectedLicense.license_key || entry.subject_id === selectedLicense.license_key) : [], [auditLogs, selectedLicense]);
  const canWrite = admin?.role !== "read_only";

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
        <NavButton tab="packages" activeTab={activeTab} onClick={setActiveTab} icon={<PackageCheck />} label="Packages" />
        <NavButton tab="analytics" activeTab={activeTab} onClick={setActiveTab} icon={<BarChart3 />} label="Analytics" />
        <NavButton tab="payments" activeTab={activeTab} onClick={setActiveTab} icon={<CreditCard />} label="Payments" />
        <NavButton tab="logins" activeTab={activeTab} onClick={setActiveTab} icon={<Activity />} label="Login Audit" />
        <NavButton tab="account" activeTab={activeTab} onClick={setActiveTab} icon={<LockKeyhole />} label="Account" />
      </aside>
      <section className="workspace">
        <header>
          <div>
            <h1>{pageTitle(activeTab)}</h1>
            <p>{pageSubtitle(activeTab)}</p>
          </div>
          <div className="header-actions">
            <span className="role-pill">{admin ? `${admin.email} · ${formatRole(admin.role)}` : "Admin"}</span>
            <button onClick={loadDashboard} disabled={busy}><RefreshCcw /> {busy ? "Working..." : "Refresh"}</button>
            <button onClick={() => logout()}><LogOut /> Logout</button>
          </div>
        </header>

        {message && <div className="notice-bar">{message}</div>}

        {activeTab === "dashboard" && (
          <>
            <Stats analytics={analytics} />
            <div className="service-grid">
              <CreateLicensePanel form={form} setForm={setForm} busy={busy || !canWrite} onCreate={createLicense} />
              <BulkLicensePanel form={bulkForm} setForm={setBulkForm} busy={busy || !canWrite} onCreate={createBulkLicenses} />
            </div>
            <ExpiringSoonPanel
              licenses={expiringLicenses}
              onRenew={(license, days) => licenseAction("/api/license/renew", license.license_key, `Extended ${license.license_key} by ${days} days.`, { days })}
              onContact={openWhatsAppRenewal}
              onExport={() => exportLicensesCsv("expiring-licenses", expiringLicenses)}
              canWrite={canWrite}
            />
            <ActivityPanel auditLogs={auditLogs} />
          </>
        )}

        {activeTab === "licenses" && (
          <>
          <LicenseManagement
            licenses={filteredLicenses}
            query={query}
            statusFilter={statusFilter}
            planFilter={planFilter}
            expiryFilter={expiryFilter}
            deviceFilter={deviceFilter}
            companyFilter={companyFilter}
            busy={busy}
            setQuery={setQuery}
            setStatusFilter={setStatusFilter}
            setPlanFilter={setPlanFilter}
            setExpiryFilter={setExpiryFilter}
            setDeviceFilter={setDeviceFilter}
            setCompanyFilter={setCompanyFilter}
            onUpdate={updateLicense}
            onExtend={(license, days) => licenseAction("/api/license/renew", license.license_key, `Extended ${license.license_key} by ${days} days.`, { days })}
            onReassign={(license) => {
              if (window.confirm(`Reassign ${license.license_key} to another PC? This removes the current device binding.`)) {
                const clearIfSelected = license.license_key === selectedLicenseKey ? () => setSelectedLicenseKey("") : undefined;
                void licenseAction("/api/license/reset-device", license.license_key, `Device binding removed for ${license.license_key}.`, {}, clearIfSelected);
              }
            }}
            onRevoke={(license) => {
              if (window.confirm(`Revoke ${license.license_key}? The customer will lose access.`)) {
                const clearIfSelected = license.license_key === selectedLicenseKey ? () => setSelectedLicenseKey("") : undefined;
                void licenseAction("/api/license/revoke", license.license_key, `Revoked ${license.license_key}.`, {}, clearIfSelected);
              }
            }}
            onSelect={(license) => setSelectedLicenseKey(license.license_key)}
            onCopied={(key) => setMessage(`Copied ${key}.`)}
            onExport={() => exportLicensesCsv("licenses", filteredLicenses)}
            canWrite={canWrite}
          />
          {selectedLicense && (
            <LicenseDetailPanel
              license={selectedLicense}
              auditLogs={selectedAuditLogs}
              canWrite={canWrite}
              onClose={() => setSelectedLicenseKey("")}
              onRenew={(days) => licenseAction("/api/license/renew", selectedLicense.license_key, `Extended ${selectedLicense.license_key} by ${days} days.`, { days })}
              onReset={() => licenseAction("/api/license/reset-device", selectedLicense.license_key, `Device binding removed for ${selectedLicense.license_key}.`, {}, () => setSelectedLicenseKey(""))}
              onRevoke={() => licenseAction("/api/license/revoke", selectedLicense.license_key, `Revoked ${selectedLicense.license_key}.`, {}, () => setSelectedLicenseKey(""))}
              onContact={() => openWhatsAppRenewal(selectedLicense)}
            />
          )}
          </>
        )}

        {activeTab === "users" && (
          <UsersPage
            users={filteredUsers}
            query={userQuery}
            setQuery={setUserQuery}
            form={userForm}
            setForm={setUserForm}
            busy={busy}
            canWrite={canWrite}
            onCreate={createUser}
            onUpdate={updateUser}
            onSetDisabled={setUserDisabled}
            onDelete={softDeleteUser}
            onExport={() => exportUsersCsv("customers", filteredUsers)}
          />
        )}

        {activeTab === "packages" && (
          <PackagesPage
            licenses={filteredPackageLicenses}
            packages={packages}
            summaries={packageSummaries}
            query={packageQuery}
            packageFilter={packageFilter}
            busy={busy}
            setQuery={setPackageQuery}
            setPackageFilter={setPackageFilter}
            onUpdatePackage={updatePackage}
            onUpdate={updateLicense}
            canWrite={canWrite}
          />
        )}

        {activeTab === "analytics" && (
          <>
            <Stats analytics={analytics} />
            <AnalyticsPage analytics={analytics} processing={processingAnalytics} onExportPdf={exportAnalyticsPdf} />
          </>
        )}

        {activeTab === "payments" && (
          <PaymentsPage
            summary={paymentSummary}
            invoices={invoices}
            checkoutEmail={checkoutEmail}
            checkoutPlan={checkoutPlan}
            checkoutUrl={checkoutUrl}
            invoiceEmail={invoiceEmail}
            busy={busy}
            canWrite={canWrite}
            setCheckoutEmail={setCheckoutEmail}
            setCheckoutPlan={setCheckoutPlan}
            setInvoiceEmail={setInvoiceEmail}
            onCreateCheckout={createCheckoutLink}
            onLoadInvoices={loadInvoices}
          />
        )}

        {activeTab === "logins" && (
          <LoginAuditPage auditLogs={loginAuditLogs} />
        )}

        {activeTab === "account" && (
          <AccountPage
            form={passwordForm}
            setForm={setPasswordForm}
            busy={busy}
            sessionTimeoutMinutes={sessionTimeoutMinutes}
            sessionExpiresAt={sessionExpiresAt}
            setSessionTimeoutMinutes={setSessionTimeoutMinutes}
            onChangePassword={changePassword}
            onUpdateSessionTimeout={updateSessionTimeout}
            canWrite={canWrite}
          />
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

function BulkLicensePanel({ form, setForm, busy, onCreate }: {
  form: { count: number; plan: Plan; expiresAt: string };
  setForm: Dispatch<SetStateAction<{ count: number; plan: Plan; expiresAt: string }>>;
  busy: boolean;
  onCreate: () => void;
}) {
  return (
    <section className="create-panel">
      <h2>Bulk License Generation</h2>
      <div className="create-grid bulk-grid">
        <select value={form.count} onChange={(event) => setForm({ ...form, count: Number(event.target.value) })}>
          <option value={10}>10 licenses</option>
          <option value={50}>50 licenses</option>
          <option value={100}>100 licenses</option>
        </select>
        <select value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value as Plan })}>
          {Object.entries(planLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} />
        <button className="primary" onClick={onCreate} disabled={busy || !form.expiresAt}><Plus /> Generate</button>
      </div>
    </section>
  );
}

function ExpiringSoonPanel({ licenses, onRenew, onContact, onExport, canWrite }: {
  licenses: License[];
  onRenew: (license: License, days: number) => void;
  onContact: (license: License) => void;
  onExport: () => void;
  canWrite: boolean;
}) {
  return (
    <section className="table-panel">
      <div className="table-title">
        <h2>Expiring Soon</h2>
        <button onClick={onExport}><Download /> Export CSV</button>
      </div>
      <div className="expiry-grid">
        {(["1", "7", "14", "30"] as const).map((window) => (
          <div key={window}>
            <strong>{licenses.filter((license) => daysUntilNumber(license.expires_at) <= Number(window)).length}</strong>
            <span>{window} days</span>
          </div>
        ))}
      </div>
      <div className="compact-list">
        {licenses.slice(0, 8).map((license) => (
          <div className="compact-row" key={license.license_key}>
            <span>
              <strong>{license.user?.name ?? "Unassigned"}</strong>
              <small>{license.license_key} · {daysUntil(license.expires_at)}</small>
            </span>
            <button onClick={() => onContact(license)}><MessageCircle /> Contact</button>
            <button onClick={() => onRenew(license, 30)} disabled={!canWrite || license.status === "revoked"}><CalendarPlus /> 30d</button>
          </div>
        ))}
      </div>
      {licenses.length === 0 && <div className="empty-state">No licenses are expiring in the next 30 days.</div>}
    </section>
  );
}

function LicenseManagement({
  licenses,
  query,
  statusFilter,
  planFilter,
  expiryFilter,
  deviceFilter,
  companyFilter,
  busy,
  setQuery,
  setStatusFilter,
  setPlanFilter,
  setExpiryFilter,
  setDeviceFilter,
  setCompanyFilter,
  onUpdate,
  onExtend,
  onReassign,
  onRevoke,
  onSelect,
  onCopied,
  onExport,
  canWrite
}: {
  licenses: License[];
  query: string;
  statusFilter: string;
  planFilter: Plan | "all";
  expiryFilter: ExpiryFilter;
  deviceFilter: DeviceFilter;
  companyFilter: string;
  busy: boolean;
  setQuery: (value: string) => void;
  setStatusFilter: (value: string) => void;
  setPlanFilter: (value: Plan | "all") => void;
  setExpiryFilter: (value: ExpiryFilter) => void;
  setDeviceFilter: (value: DeviceFilter) => void;
  setCompanyFilter: (value: string) => void;
  onUpdate: (license: License, patch: Partial<{ plan: Plan; expiresAt: string }>) => void;
  onExtend: (license: License, days: number) => void;
  onReassign: (license: License) => void;
  onRevoke: (license: License) => void;
  onSelect: (license: License) => void;
  onCopied: (key: string) => void;
  onExport: () => void;
  canWrite: boolean;
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
          <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value as Plan | "all")}>
            <option value="all">All Plans</option>
            {Object.entries(planLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={expiryFilter} onChange={(event) => setExpiryFilter(event.target.value as ExpiryFilter)}>
            <option value="all">Any Expiry</option>
            <option value="1">1 Day</option>
            <option value="7">7 Days</option>
            <option value="14">14 Days</option>
            <option value="30">30 Days</option>
            <option value="expired">Expired</option>
          </select>
          <select value={deviceFilter} onChange={(event) => setDeviceFilter(event.target.value as DeviceFilter)}>
            <option value="all">Any Device</option>
            <option value="bound">Device Bound</option>
            <option value="unbound">Unbound</option>
          </select>
          <input className="company-filter" placeholder="Company" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} />
          <button onClick={onExport}><Download /> Export</button>
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
            onSelect={onSelect}
            onCopied={onCopied}
            canWrite={canWrite}
          />
        ))}
      </div>
      {licenses.length === 0 && <div className="empty-state">No licenses match the current filters.</div>}
    </section>
  );
}

function LicenseRow({ license, busy, onUpdate, onExtend, onReassign, onRevoke, onSelect, onCopied, canWrite }: {
  license: License;
  busy: boolean;
  onUpdate: (license: License, patch: Partial<{ plan: Plan; expiresAt: string }>) => void;
  onExtend: (license: License, days: number) => void;
  onReassign: (license: License) => void;
  onRevoke: (license: License) => void;
  onSelect: (license: License) => void;
  onCopied: (key: string) => void;
  canWrite: boolean;
}) {
  const [plan, setPlan] = useState<Plan>(license.plan);
  const [expiresAt, setExpiresAt] = useState(dateInputValue(license.expires_at));
  const changed = plan !== license.plan || expiresAt !== dateInputValue(license.expires_at);
  const disabled = busy || !canWrite || license.status === "revoked";

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
        <button title="Open license detail" onClick={() => onSelect(license)}><Eye /></button>
        <button title="Save plan or expiry changes" onClick={() => onUpdate(license, { plan, expiresAt })} disabled={!changed || disabled}><Save /></button>
        <button title="Extend expiry by 30 days" onClick={() => onExtend(license, 30)} disabled={disabled}><CalendarPlus /></button>
        <button title="Reassign device to another PC" onClick={() => onReassign(license)} disabled={disabled}><RotateCcw /></button>
        <button title="Revoke customer access" onClick={() => onRevoke(license)} disabled={license.status === "revoked"}><Ban /></button>
      </div>
    </>
  );
}

function UsersPage({
  users,
  query,
  setQuery,
  form,
  setForm,
  busy,
  canWrite,
  onCreate,
  onUpdate,
  onSetDisabled,
  onDelete,
  onExport
}: {
  users: Customer[];
  query: string;
  setQuery: (value: string) => void;
  form: { name: string; email: string; company: string };
  setForm: Dispatch<SetStateAction<{ name: string; email: string; company: string }>>;
  busy: boolean;
  canWrite: boolean;
  onCreate: () => void;
  onUpdate: (user: Customer, patch: Partial<{ name: string; email: string; company: string | null }>) => void;
  onSetDisabled: (user: Customer, disabled: boolean) => void;
  onDelete: (user: Customer) => void;
  onExport: () => void;
}) {
  const createDisabled = busy || !canWrite || !form.name.trim() || !form.email.trim();
  return (
    <>
      <section className="create-panel">
        <h2>Create User</h2>
        <div className="create-grid user-create-grid">
          <input placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input placeholder="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <input placeholder="Company" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
          <button className="primary" onClick={onCreate} disabled={createDisabled}><UserRound /> Create User</button>
        </div>
      </section>

      <section className="table-panel">
        <div className="table-title">
          <h2>Customers</h2>
          <div className="table-tools">
            <label className="search-box"><Search /><input placeholder="Search customers" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <button onClick={onExport}><Download /> Export</button>
          </div>
        </div>
        <div className="user-table">
          <div className="table-head">Customer</div>
          <div className="table-head">Company</div>
          <div className="table-head">Licenses</div>
          <div className="table-head">Status Mix</div>
          <div className="table-head">Latest Activation</div>
          <div className="table-head">Actions</div>
          {users.map((user) => (
            <CustomerRow
              key={user.id}
              user={user}
              busy={busy}
              canWrite={canWrite}
              onUpdate={onUpdate}
              onSetDisabled={onSetDisabled}
              onDelete={onDelete}
            />
          ))}
        </div>
        {users.length === 0 && <div className="empty-state">No customers found.</div>}
      </section>
    </>
  );
}

function LicenseDetailPanel({ license, auditLogs, canWrite, onClose, onRenew, onReset, onRevoke, onContact }: {
  license: License;
  auditLogs: AuditLog[];
  canWrite: boolean;
  onClose: () => void;
  onRenew: (days: number) => void;
  onReset: () => void;
  onRevoke: () => void;
  onContact: () => void;
}) {
  const [customDays, setCustomDays] = useState(30);
  return (
    <section className="detail-panel">
      <div className="table-title">
        <h2>License Detail</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="detail-grid">
        <InfoBlock label="Key" value={license.license_key} />
        <InfoBlock label="Customer" value={`${license.user?.name ?? "Unassigned"} · ${license.user?.email ?? "No email"}`} />
        <InfoBlock label="Company" value={license.user?.company ?? "No company"} />
        <InfoBlock label="Plan" value={planLabels[license.plan]} />
        <InfoBlock label="Status" value={license.status} />
        <InfoBlock label="Expiry" value={`${new Date(license.expires_at).toLocaleDateString()} · ${daysUntil(license.expires_at)}`} />
        <InfoBlock label="Device" value={license.device_id ? `${license.device_id} · ${license.hostname ?? "No hostname"}` : "Not bound"} />
        <InfoBlock label="Last Verified" value={license.last_verified ? new Date(license.last_verified).toLocaleString() : "Never"} />
      </div>
      <div className="detail-actions">
        <button onClick={onContact}><MessageCircle /> Contact</button>
        {[30, 90, 365].map((days) => <button key={days} onClick={() => onRenew(days)} disabled={!canWrite || license.status === "revoked"}><CalendarPlus /> {days}d</button>)}
        <input type="number" min={1} max={3660} value={customDays} onChange={(event) => setCustomDays(Number(event.target.value))} />
        <button onClick={() => onRenew(customDays)} disabled={!canWrite || customDays < 1 || license.status === "revoked"}><CalendarPlus /> Custom</button>
        <button onClick={onReset} disabled={!canWrite || license.status === "revoked"}><RotateCcw /> Reset Device</button>
        <button onClick={onRevoke} disabled={!canWrite || license.status === "revoked"}><Ban /> Revoke</button>
      </div>
      <div className="activity-list">
        {auditLogs.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
      </div>
      {auditLogs.length === 0 && <div className="empty-state">No activity found for this license.</div>}
    </section>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return <div className="info-block"><span>{label}</span><strong>{value}</strong></div>;
}

function CustomerRow({ user, busy, canWrite, onUpdate, onSetDisabled, onDelete }: {
  user: Customer;
  busy: boolean;
  canWrite: boolean;
  onUpdate: (user: Customer, patch: Partial<{ name: string; email: string; company: string | null }>) => void;
  onSetDisabled: (user: Customer, disabled: boolean) => void;
  onDelete: (user: Customer) => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [company, setCompany] = useState(user.company ?? "");
  const changed = name !== user.name || email !== user.email || company !== (user.company ?? "");
  const disabled = busy || !canWrite || !name.trim() || !email.trim();

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
    setCompany(user.company ?? "");
  }, [user.id, user.name, user.email, user.company]);

  return (
    <>
      <div className="user-edit-cell">
        <input value={name} onChange={(event) => setName(event.target.value)} disabled={!canWrite} />
        <input value={email} type="email" onChange={(event) => setEmail(event.target.value)} disabled={!canWrite} />
        {user.disabled_at && <small>Disabled {new Date(user.disabled_at).toLocaleDateString()}</small>}
      </div>
      <div><input value={company} placeholder="No company" onChange={(event) => setCompany(event.target.value)} disabled={!canWrite} /></div>
      <div><strong>{user.license_count}</strong></div>
      <div className="status-mix">
        <span>Active {user.active_count}</span>
        <span>Pending {user.pending_count}</span>
        <span>Expired {user.expired_count}</span>
        <span>Revoked {user.revoked_count}</span>
      </div>
      <div>{user.latest_activation ? new Date(user.latest_activation).toLocaleString() : "No activation"}</div>
      <div className="actions">
        <button title="Save user" onClick={() => onUpdate(user, { name, email, company: company || null })} disabled={!changed || disabled}><Save /></button>
        <button title={user.disabled_at ? "Enable user" : "Disable user"} onClick={() => onSetDisabled(user, !user.disabled_at)} disabled={busy || !canWrite}>{user.disabled_at ? <Check /> : <Ban />}</button>
        <button title="Soft-delete user" onClick={() => onDelete(user)} disabled={busy || !canWrite}><Ban /></button>
      </div>
    </>
  );
}

const PLAN_COLORS: Record<Plan, string> = {
  starter: "#2563eb",
  pro: "#7c3aed",
  enterprise: "#0891b2"
};
const PLAN_LIST: Plan[] = ["starter", "pro", "enterprise"];

function LineChart({ data }: { data: Analytics["daily_activations"] }) {
  if (!data.length) return <p className="chart-empty">No activation data yet.</p>;
  const W = 440, H = 140, pL = 28, pR = 8, pT = 10, pB = 26;
  const plotW = W - pL - pR, plotH = H - pT - pB;
  const n = data.length;
  const maxVal = Math.max(...data.map(d => d.count), 1);
  const x = (i: number) => pL + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => pT + plotH - (v / maxVal) * plotH;
  const pts = data.map((d, i) => [x(i), y(d.count)] as [number, number]);
  const line = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const firstX = pts[0]?.[0] ?? pL;
  const lastX = pts[pts.length - 1]?.[0] ?? pL;
  const area = `${line} L${lastX.toFixed(1)},${(pT + plotH).toFixed(1)} L${firstX.toFixed(1)},${(pT + plotH).toFixed(1)} Z`;
  const labelIdxs = data.reduce<number[]>((acc, _, i) => (i % 7 === 0 || i === n - 1 ? [...acc, i] : acc), []);
  const yTicks = [0, Math.round(maxVal / 2), maxVal].filter((v, i, arr) => arr.indexOf(v) === i && v >= 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="line-chart" aria-label="Daily activations over the last 30 days">
      <defs>
        <linearGradient id="act-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map(v => (
        <g key={v}>
          <line x1={pL} y1={y(v)} x2={W - pR} y2={y(v)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={pL - 4} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#94a3b8">{v}</text>
        </g>
      ))}
      <path d={area} fill="url(#act-fill)" />
      <path d={line} fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {labelIdxs.map(i => (
        <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">{data[i]?.date.slice(5)}</text>
      ))}
    </svg>
  );
}

function DonutChart({ plans, total }: { plans: Record<Plan, number>; total: number }) {
  const r = 58, cx = 80, cy = 80, sw = 22;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const segments = PLAN_LIST.map((plan) => {
    const len = total > 0 ? (plans[plan] / total) * circ : 0;
    const seg = { plan, len, offset };
    offset += len;
    return seg;
  });
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 160 160" className="donut-chart" aria-label="License distribution by plan">
        <g transform="rotate(-90 80 80)">
          {total === 0
            ? <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={sw} />
            : segments.map(({ plan, len, offset: off }) => len > 0 && (
              <circle key={plan} cx={cx} cy={cy} r={r} fill="none"
                stroke={PLAN_COLORS[plan]} strokeWidth={sw}
                strokeDasharray={`${len.toFixed(2)} ${(circ - len).toFixed(2)}`}
                strokeDashoffset={(circ - off).toFixed(2)}
              />
            ))
          }
        </g>
        <text x={cx} y={cy - 7} textAnchor="middle" fontSize="20" fontWeight="700" fill="#0f172a">{total}</text>
        <text x={cx} y={cy + 11} textAnchor="middle" fontSize="10" fill="#64748b">Total</text>
      </svg>
      <div className="donut-legend">
        {PLAN_LIST.map((plan) => (
          <div key={plan} className="legend-row">
            <i style={{ background: PLAN_COLORS[plan] }} />
            <span>{planLabels[plan]}</span>
            <strong>{total > 0 ? `${Math.round((plans[plan] / total) * 100)}%` : "—"}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsPage({ analytics, processing, onExportPdf }: { analytics: Analytics; processing: ProcessingAnalytics; onExportPdf: () => void }) {
  return (
    <section className="analytics-panel">
      <div className="analytics-panel-header">
        <h2>Analytics</h2>
        <button onClick={onExportPdf}><Download size={15} /> Export PDF</button>
      </div>
      <div className="metric-grid">
        <Metric label="Activations" value={analytics.activations} icon={<Activity />} />
        <Metric label="Revoked" value={analytics.revoked} icon={<Ban />} />
        <Metric label="Expired" value={analytics.expired} icon={<RefreshCcw />} />
      </div>
      <div className="metric-grid processing-metrics">
        <Metric label="Processed Jobs" value={processing.total} icon={<Activity />} />
        <Metric label="Completed" value={processing.complete} icon={<Check />} />
        <Metric label="Failed" value={processing.failed} icon={<Ban />} />
      </div>
      <div className="analytics-charts">
        <div className="chart-section">
          <h2>Activations Over Time</h2>
          <LineChart data={analytics.daily_activations} />
        </div>
        <div className="chart-section">
          <h2>License Distribution</h2>
          <DonutChart plans={analytics.plans} total={analytics.total} />
        </div>
      </div>
      <div className="processing-grid">
        <div className="chart-section">
          <h2>Processing Performance</h2>
          <div className="processing-summary">
            <InfoBlock label="Avg elapsed" value={formatDuration(processing.average_elapsed_ms)} />
            <InfoBlock label="Avg throughput" value={`${processing.average_throughput_mb_per_min} MB/min`} />
          </div>
        </div>
        <div className="chart-section">
          <h2>Top Error Codes</h2>
          {processing.top_error_codes.length > 0 ? (
            <div className="error-code-list">
              {processing.top_error_codes.map((entry) => (
                <div key={entry.error_code}>
                  <span>{entry.error_code}</span>
                  <strong>{entry.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No processing errors recorded.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function PackagesPage({
  licenses,
  packages,
  summaries,
  query,
  packageFilter,
  busy,
  setQuery,
  setPackageFilter,
  onUpdatePackage,
  onUpdate,
  canWrite
}: {
  licenses: License[];
  packages: PackageDefinition[];
  summaries: Record<Plan, PackageSummary>;
  query: string;
  packageFilter: Plan | "all";
  busy: boolean;
  setQuery: (value: string) => void;
  setPackageFilter: (value: Plan | "all") => void;
  onUpdatePackage: (definition: PackageDefinition, patch: PackageLimits) => void;
  onUpdate: (license: License, patch: Partial<{ plan: Plan; expiresAt: string }>) => void;
  canWrite: boolean;
}) {
  return (
    <>
      <div className="package-stats">
        {(Object.keys(planLabels) as Plan[]).map((plan) => (
          <PackageCard key={plan} plan={plan} summary={summaries[plan]} />
        ))}
      </div>
      <section className="table-panel">
        <div className="table-title">
          <h2>Package Limits</h2>
        </div>
        <div className="package-limit-grid">
          {packages.map((definition) => (
            <PackageLimitCard key={definition.plan} definition={definition} busy={busy || !canWrite} onSave={onUpdatePackage} />
          ))}
        </div>
        {packages.length === 0 && <div className="empty-state">Package limits could not be loaded.</div>}
      </section>
      <section className="table-panel">
        <div className="table-title">
          <h2>Package Allocation</h2>
          <div className="table-tools">
            <label className="search-box">
              <Search />
              <input placeholder="Search packages" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <select value={packageFilter} onChange={(event) => setPackageFilter(event.target.value as Plan | "all")}>
              <option value="all">All Packages</option>
              {Object.entries(planLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>
        <div className="package-table">
          <div className="table-head">License</div>
          <div className="table-head">Customer</div>
          <div className="table-head">Current Package</div>
          <div className="table-head">Allocate Package</div>
          <div className="table-head">Status</div>
          <div className="table-head">Expiry</div>
          <div className="table-head">Device</div>
          {licenses.map((license) => (
            <PackageAllocationRow key={license.license_key} license={license} busy={busy || !canWrite} onUpdate={onUpdate} />
          ))}
        </div>
        {licenses.length === 0 && <div className="empty-state">No licenses match the package filters.</div>}
      </section>
    </>
  );
}

function PackageLimitCard({ definition, busy, onSave }: {
  definition: PackageDefinition;
  busy: boolean;
  onSave: (definition: PackageDefinition, patch: PackageLimits) => void;
}) {
  const [limits, setLimits] = useState<PackageLimits>({
    video_limit: definition.video_limit,
    template_limit: definition.template_limit,
    worker_limit: definition.worker_limit
  });
  const changed =
    limits.video_limit !== definition.video_limit ||
    limits.template_limit !== definition.template_limit ||
    limits.worker_limit !== definition.worker_limit;
  const invalid = limits.video_limit < 1 || limits.template_limit < 1 || limits.worker_limit < 1;

  useEffect(() => {
    setLimits({
      video_limit: definition.video_limit,
      template_limit: definition.template_limit,
      worker_limit: definition.worker_limit
    });
  }, [definition.plan, definition.video_limit, definition.template_limit, definition.worker_limit]);

  return (
    <div className="package-limit-card">
      <div className="package-limit-title">
        <h3>{planLabels[definition.plan]}</h3>
        <small>Updated {new Date(definition.updated_at).toLocaleDateString()}</small>
      </div>
      <label>
        <span>Video limit</span>
        <input type="number" min={1} value={limits.video_limit} onChange={(event) => setLimits({ ...limits, video_limit: Number(event.target.value) })} />
      </label>
      <label>
        <span>Template limit</span>
        <input type="number" min={1} value={limits.template_limit} onChange={(event) => setLimits({ ...limits, template_limit: Number(event.target.value) })} />
      </label>
      <label>
        <span>Worker limit</span>
        <input type="number" min={1} value={limits.worker_limit} onChange={(event) => setLimits({ ...limits, worker_limit: Number(event.target.value) })} />
      </label>
      <button className="primary" onClick={() => onSave(definition, limits)} disabled={busy || !changed || invalid}><Save /> Save Limits</button>
    </div>
  );
}

function PackageCard({ plan, summary }: { plan: Plan; summary: PackageSummary }) {
  return (
    <div className="package-card">
      <div>
        <span>{planLabels[plan]}</span>
        <strong>{summary.total}</strong>
      </div>
      <div className="package-mix">
        <span>Active {summary.active}</span>
        <span>Pending {summary.pending}</span>
        <span>Expired {summary.expired}</span>
        <span>Revoked {summary.revoked}</span>
      </div>
    </div>
  );
}

function PackageAllocationRow({ license, busy, onUpdate }: {
  license: License;
  busy: boolean;
  onUpdate: (license: License, patch: Partial<{ plan: Plan; expiresAt: string }>) => void;
}) {
  const [plan, setPlan] = useState<Plan>(license.plan);
  const changed = plan !== license.plan;
  const disabled = busy || license.status === "revoked";

  useEffect(() => {
    setPlan(license.plan);
  }, [license.license_key, license.plan]);

  return (
    <>
      <div className="mono">{license.license_key}</div>
      <div>
        <strong>{license.user?.name ?? "Unassigned"}</strong>
        <small>{license.user?.email ?? "No customer email"}</small>
        {license.user?.company && <small>{license.user.company}</small>}
      </div>
      <div><strong>{planLabels[license.plan]}</strong></div>
      <div className="package-editor">
        <select value={plan} onChange={(event) => setPlan(event.target.value as Plan)} disabled={disabled}>
          {Object.entries(planLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button title="Save package allocation" onClick={() => onUpdate(license, { plan })} disabled={!changed || disabled}><Save /></button>
      </div>
      <div><span className={`pill ${license.status}`}>{license.status}</span></div>
      <div>
        <strong>{new Date(license.expires_at).toLocaleDateString()}</strong>
        <small>{daysUntil(license.expires_at)}</small>
      </div>
      <div className="mono">
        {license.device_id ? `${license.device_id.slice(0, 12)}...` : "Not bound"}
        {license.hostname && <small>{license.hostname}</small>}
      </div>
    </>
  );
}

function LoginAuditPage({ auditLogs }: { auditLogs: AuditLog[] }) {
  return (
    <section className="table-panel">
      <div className="table-title">
        <h2>Admin Login Audit</h2>
        <span className="role-pill">{auditLogs.length} events</span>
      </div>
      {auditLogs.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Email</th>
              <th>Status</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.created_at).toLocaleString()}</td>
                <td>{loginAuditEmail(entry)}</td>
                <td><span className={`status-pill ${entry.action === "admin.login" ? "active" : "revoked"}`}>{entry.action === "admin.login" ? "Success" : "Failed"}</span></td>
                <td>{loginAuditRole(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty-state">No login audit events recorded yet.</p>
      )}
    </section>
  );
}

function AccountPage({ form, setForm, busy, sessionTimeoutMinutes, sessionExpiresAt, setSessionTimeoutMinutes, onChangePassword, onUpdateSessionTimeout, canWrite }: {
  form: { currentPassword: string; newPassword: string; confirmPassword: string };
  setForm: Dispatch<SetStateAction<{ currentPassword: string; newPassword: string; confirmPassword: string }>>;
  busy: boolean;
  sessionTimeoutMinutes: number;
  sessionExpiresAt: string | null;
  setSessionTimeoutMinutes: Dispatch<SetStateAction<number>>;
  onChangePassword: () => void;
  onUpdateSessionTimeout: () => void;
  canWrite: boolean;
}) {
  const disabled = busy || !form.currentPassword || form.newPassword.length < 10 || form.newPassword !== form.confirmPassword;
  const timeoutValid = [15, 30, 60, 120, 240, 480, 720, 1440].includes(sessionTimeoutMinutes);
  return (
    <div className="account-grid">
      <section className="account-panel">
        <h2>Change Password</h2>
        <div className="password-grid">
          <input type="password" placeholder="Current password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} />
          <input type="password" placeholder="New password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} />
          <input type="password" placeholder="Confirm new password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} />
          <button className="primary" onClick={onChangePassword} disabled={disabled}><Check /> Change Password</button>
        </div>
      </section>

      <section className="account-panel">
        <h2>Session Timeout</h2>
        <div className="session-summary">
          <Clock />
          <span>Current session expires {formatSessionExpiry(sessionExpiresAt)}</span>
        </div>
        <div className="password-grid session-grid">
          <select value={sessionTimeoutMinutes} onChange={(event) => setSessionTimeoutMinutes(Number(event.target.value))} disabled={!canWrite}>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
            <option value={120}>2 hours</option>
            <option value={240}>4 hours</option>
            <option value={480}>8 hours</option>
            <option value={720}>12 hours</option>
            <option value={1440}>24 hours</option>
          </select>
          <button className="primary" onClick={onUpdateSessionTimeout} disabled={busy || !canWrite || !timeoutValid}><Save /> Save Timeout</button>
        </div>
      </section>
    </div>
  );
}

function ActivityPanel({ auditLogs }: { auditLogs: AuditLog[] }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(auditLogs.length / activityPageSize));
  const visibleAuditLogs = auditLogs.slice((page - 1) * activityPageSize, page * activityPageSize);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  return (
    <section className="activity-panel">
      <div className="panel-heading"><h2>Recent Activity</h2></div>
      {visibleAuditLogs.length > 0 && (
        <div className="activity-list">
          {visibleAuditLogs.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
        </div>
      )}
      {auditLogs.length === 0 && <div className="empty-state">No activity recorded yet.</div>}
      {auditLogs.length > activityPageSize && (
        <div className="activity-pagination">
          <span>Page {page} of {pageCount}</span>
          <div>
            <button
              type="button"
              aria-label="Previous activity page"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              aria-label="Next activity page"
              disabled={page === pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              <ChevronRight />
            </button>
          </div>
        </div>
      )}
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

interface PackageSummary {
  total: number;
  active: number;
  pending: number;
  expired: number;
  revoked: number;
}

function getPackageSummaries(licenses: License[]) {
  const summaries: Record<Plan, PackageSummary> = {
    starter: { total: 0, active: 0, pending: 0, expired: 0, revoked: 0 },
    pro: { total: 0, active: 0, pending: 0, expired: 0, revoked: 0 },
    enterprise: { total: 0, active: 0, pending: 0, expired: 0, revoked: 0 }
  };
  for (const license of licenses) {
    summaries[license.plan].total += 1;
    summaries[license.plan][license.status] += 1;
  }
  return summaries;
}

function PaymentsPage({ summary, invoices, checkoutEmail, checkoutPlan, checkoutUrl, invoiceEmail, busy, canWrite, setCheckoutEmail, setCheckoutPlan, setInvoiceEmail, onCreateCheckout, onLoadInvoices }: {
  summary: PaymentSummary | null;
  invoices: StripeInvoice[];
  checkoutEmail: string;
  checkoutPlan: Plan;
  checkoutUrl: string;
  invoiceEmail: string;
  busy: boolean;
  canWrite: boolean;
  setCheckoutEmail: (v: string) => void;
  setCheckoutPlan: (v: Plan) => void;
  setInvoiceEmail: (v: string) => void;
  onCreateCheckout: () => void;
  onLoadInvoices: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copyUrl() {
    void navigator.clipboard.writeText(checkoutUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (summary && !summary.configured) {
    return (
      <section className="table-panel">
        <div className="payments-unconfigured">
          <CreditCard size={40} />
          <h2>Stripe Not Configured</h2>
          <p>Set <code>STRIPE_SECRET_KEY</code> and price IDs in your backend environment to enable payments.</p>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="stats">
        <div className="stat"><span className="stat-value">{summary?.activeSubscriptions ?? "—"}</span><span className="stat-label">Active Subscribers</span></div>
        <div className="stat"><span className="stat-value">{summary?.mrr !== undefined ? `$${summary.mrr.toFixed(2)}` : "—"}</span><span className="stat-label">MRR</span></div>
        <div className="stat"><span className="stat-value">{summary?.arr !== undefined ? `$${summary.arr.toFixed(2)}` : "—"}</span><span className="stat-label">ARR</span></div>
        <div className="stat"><span className="stat-value">{summary?.churnRate !== undefined ? `${summary.churnRate.toFixed(2)}%` : "—"}</span><span className="stat-label">30-Day Churn</span></div>
      </div>

      <section className="create-panel">
        <h2>Create Checkout Link</h2>
        <p className="panel-hint">Generate a Stripe Checkout URL to send to a customer for a specific plan.</p>
        <div className="checkout-form">
          <input
            placeholder="Customer email"
            type="email"
            value={checkoutEmail}
            onChange={(e) => setCheckoutEmail(e.target.value)}
          />
          <select value={checkoutPlan} onChange={(e) => setCheckoutPlan(e.target.value as Plan)}>
            {(["starter", "pro", "enterprise"] as Plan[]).map((plan) => (
              <option key={plan} value={plan}>{planLabels[plan]}</option>
            ))}
          </select>
          <button className="primary" onClick={onCreateCheckout} disabled={busy || !canWrite || !checkoutEmail.trim()}>
            <CreditCard /> Generate Link
          </button>
        </div>
        {checkoutUrl && (
          <div className="checkout-url-row">
            <input readOnly value={checkoutUrl} className="checkout-url-input" />
            <button onClick={copyUrl}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}</button>
          </div>
        )}
      </section>

      <section className="table-panel">
        <div className="table-title">
          <h2>Invoice History</h2>
          <div className="invoice-search">
            <input
              placeholder="Customer email"
              type="email"
              value={invoiceEmail}
              onChange={(e) => setInvoiceEmail(e.target.value)}
            />
            <button onClick={onLoadInvoices} disabled={busy || !invoiceEmail.trim()}><Search /> Look Up</button>
          </div>
        </div>
        {invoices.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Invoice</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{new Date(inv.created * 1000).toLocaleDateString()}</td>
                  <td>{inv.customer_email ?? "—"}</td>
                  <td>{(inv.amount_paid / 100).toFixed(2)} {inv.currency.toUpperCase()}</td>
                  <td><span className={`status-pill ${inv.status === "paid" ? "active" : "pending"}`}>{inv.status}</span></td>
                  <td className="invoice-links">
                    {inv.hosted_invoice_url && <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer"><Eye size={14} /> View</a>}
                    {inv.invoice_pdf && <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer"><Download size={14} /> PDF</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : invoiceEmail ? (
          <p className="empty-state">No invoices found for {invoiceEmail}.</p>
        ) : (
          <p className="empty-state">Enter a customer email above to load their invoice history.</p>
        )}
      </section>
    </>
  );
}

function pageTitle(tab: Tab) {
  return ({ dashboard: "Admin Dashboard", licenses: "Licenses", users: "Users", analytics: "Analytics", packages: "Packages", payments: "Payments", logins: "Login Audit", account: "Account" } satisfies Record<Tab, string>)[tab];
}

function pageSubtitle(tab: Tab) {
  return ({
    dashboard: "Create licenses and review recent activity.",
    licenses: "Manage plans, expiry, device bindings, and revocations.",
    users: "Customer accounts grouped from license records.",
    packages: "Manually allocate Starter, Pro, or Enterprise to licenses.",
    analytics: "License, activation, and plan performance.",
    payments: "Stripe revenue summary, checkout links, and invoice history.",
    logins: "Admin sign-in attempts and session events.",
    account: "Update admin sign-in security."
  } satisfies Record<Tab, string>)[tab];
}

function formatActivityAction(action: string) {
  return action.replace("license.", "").replace(/_/g, " ");
}

function formatRole(role: AdminRole) {
  return role.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function loginAuditEmail(entry: AuditLog) {
  const metadataEmail = entry.metadata?.email;
  return typeof metadataEmail === "string" ? metadataEmail : entry.admin_user_email ?? "Unknown";
}

function loginAuditRole(entry: AuditLog) {
  const role = entry.metadata?.role;
  return typeof role === "string" ? formatRole(role as AdminRole) : "—";
}

function parseTokenSession(token: string): { admin: { email: string; role: AdminRole }; expiresAt: string | null } | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as { email?: string; role?: AdminRole; exp?: number };
    if (!payload.email || !payload.role) return null;
    return {
      admin: { email: payload.email, role: payload.role },
      expiresAt: typeof payload.exp === "number" ? new Date(payload.exp * 1000).toISOString() : null
    };
  } catch {
    return null;
  }
}

function formatSessionExpiry(value: string | null) {
  if (!value) return "when the token expires";
  return new Date(value).toLocaleString();
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function matchesExpiryWindow(license: License, filter: ExpiryFilter) {
  if (filter === "all") return true;
  const days = daysUntilNumber(license.expires_at);
  if (filter === "expired") return days < 0;
  return days >= 0 && days <= Number(filter);
}

function daysUntilNumber(value: string) {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

function openWhatsAppRenewal(license: License) {
  const customer = license.user?.name ?? "customer";
  const text = encodeURIComponent(`Hi ${customer}, your Video Reposter license ${license.license_key} ${daysUntil(license.expires_at)}. Please contact us to renew.`);
  window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
}

function exportLicensesCsv(name: string, rows: License[]) {
  downloadCsv(name, [
    ["license_key", "customer_name", "customer_email", "company", "plan", "status", "expires_at", "device_id", "hostname", "os", "activated_at", "last_verified"],
    ...rows.map((license) => [
      license.license_key,
      license.user?.name ?? "",
      license.user?.email ?? "",
      license.user?.company ?? "",
      planLabels[license.plan],
      license.status,
      license.expires_at,
      license.device_id ?? "",
      license.hostname ?? "",
      license.os ?? "",
      license.activated_at ?? "",
      license.last_verified ?? ""
    ])
  ]);
}

function exportUsersCsv(name: string, rows: Customer[]) {
  downloadCsv(name, [
    ["id", "name", "email", "company", "disabled_at", "deleted_at", "retention_until", "license_count", "active_count", "pending_count", "expired_count", "revoked_count", "latest_activation"],
    ...rows.map((user) => [
      user.id,
      user.name,
      user.email,
      user.company ?? "",
      user.disabled_at ?? "",
      user.deleted_at ?? "",
      user.retention_until ?? "",
      user.license_count,
      user.active_count,
      user.pending_count,
      user.expired_count,
      user.revoked_count,
      user.latest_activation ?? ""
    ])
  ]);
}

function downloadCsv(name: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
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
