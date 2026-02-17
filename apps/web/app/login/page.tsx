"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "bootstrap";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");

  const submitLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Login failed");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submitBootstrap = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenantName,
          tenant_slug: tenantSlug,
          timezone,
          owner_name: ownerName,
          owner_email: ownerEmail,
          password: ownerPassword
        })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Bootstrap failed");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f3f5f8", padding: 20 }}>
      <section style={{ width: "min(520px, 100%)", background: "#fff", border: "1px solid #d9dee8", borderRadius: 12, padding: 24 }}>
        <h1 style={{ margin: 0 }}>Booking Agent</h1>
        <p style={{ marginTop: 8, color: "#475467" }}>Sign in to your business workspace.</p>

        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => setMode("login")}
            style={{
              border: "1px solid #d0d5dd",
              background: mode === "login" ? "#111827" : "#fff",
              color: mode === "login" ? "#fff" : "#111827",
              borderRadius: 8,
              padding: "8px 12px"
            }}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("bootstrap")}
            style={{
              border: "1px solid #d0d5dd",
              background: mode === "bootstrap" ? "#111827" : "#fff",
              color: mode === "bootstrap" ? "#fff" : "#111827",
              borderRadius: 8,
              padding: "8px 12px"
            }}
          >
            First-time Setup
          </button>
        </div>

        {mode === "login" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitLogin();
            }}
            style={{ display: "grid", gap: 12 }}
          >
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" style={inputStyle} />
            </label>
            <label>
              Password
              <input value={password} onChange={(e) => setPassword(e.target.value)} required type="password" minLength={8} style={inputStyle} />
            </label>
            <button type="submit" disabled={loading} style={submitStyle}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitBootstrap();
            }}
            style={{ display: "grid", gap: 12 }}
          >
            <label>
              Business Name
              <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} required style={inputStyle} />
            </label>
            <label>
              Workspace Slug
              <input value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} required placeholder="acme-salon" style={inputStyle} />
            </label>
            <label>
              Timezone
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} required placeholder="America/New_York" style={inputStyle} />
            </label>
            <label>
              Owner Name
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required style={inputStyle} />
            </label>
            <label>
              Owner Email
              <input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required type="email" style={inputStyle} />
            </label>
            <label>
              Owner Password
              <input value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} required type="password" minLength={8} style={inputStyle} />
            </label>
            <button type="submit" disabled={loading} style={submitStyle}>
              {loading ? "Setting up..." : "Create Workspace"}
            </button>
          </form>
        )}

        {error ? <p style={{ color: "#b42318", marginTop: 12 }}>{error}</p> : null}
      </section>
    </main>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: 6,
  border: "1px solid #d0d5dd",
  borderRadius: 8,
  padding: "10px 12px"
};

const submitStyle = {
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  borderRadius: 8,
  padding: "10px 12px"
};
