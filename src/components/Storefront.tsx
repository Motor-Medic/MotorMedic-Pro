/**
 * E6 — public storefront.
 *
 * A visitor selects catalog modules, creates the account credentials that
 * will own the new tenant, accepts the existing Terms/Privacy documents, and
 * pays. There is no login wall before payment. The success return shows the
 * honest "setting up your plant" state while the Square webhook provisions,
 * then signs the new admin in (using the credentials captured below) and
 * lands on their own empty Equipment DB.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Check,
  Loader2,
  Lock,
  Shield,
  Sparkles
} from "lucide-react";
import type { UserSession } from "./Login";
import { navigateApp } from "../navigation";

interface StorefrontProps {
  onLoginSuccess: (user: UserSession) => void;
  onShowLegal?: (tab: "terms" | "privacy") => void;
}

interface CatalogModule {
  key: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  square_variation_id: string | null;
  configured: boolean;
}

interface CheckoutCredentials {
  username: string;
  password: string;
}

const CHECKOUT_CREDENTIALS_KEY = "motormedic_checkout_credentials";

function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0
    }).format(cents / 100);
  } catch {
    return `$${Math.round(cents / 100)}`;
  }
}

function readCheckoutCredentials(): CheckoutCredentials | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.username === "string" &&
      typeof parsed.password === "string"
    ) {
      return { username: parsed.username, password: parsed.password };
    }
    return null;
  } catch {
    return null;
  }
}

export default function Storefront({
  onLoginSuccess,
  onShowLegal
}: StorefrontProps) {
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const returningFromCheckout = search.get("checkout") === "success";
  const canceled = search.get("checkout") === "cancel";

  const [catalog, setCatalog] = useState<CatalogModule[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(returningFromCheckout);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog", { credentials: "same-origin" })
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || "Catalog unavailable.");
        return payload;
      })
      .then((payload) => {
        if (!cancelled) {
          setCatalog(Array.isArray(payload.modules) ? payload.modules : []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCatalogError(
            err instanceof Error ? err.message : "Catalog unavailable."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!returningFromCheckout) return;
    let cancelled = false;

    const credentials = readCheckoutCredentials();
    if (!credentials) {
      setProvisioning(false);
      setError(
        "Payment received, but this browser no longer has the sign-in details. Use the username and password you created at checkout."
      );
      return;
    }

    const poll = async () => {
      for (let attempt = 0; attempt < 30 && !cancelled; attempt += 1) {
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(credentials)
          });
          if (res.ok) {
            const user = await res.json();
            sessionStorage.removeItem(CHECKOUT_CREDENTIALS_KEY);
            if (!cancelled) onLoginSuccess(user as UserSession);
            return;
          }
        } catch {
          // Webhook may still be provisioning; keep polling.
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!cancelled) {
        setProvisioning(false);
        setError(
          "Your plant is still setting up. Refresh this page in a moment or sign in with the credentials you created."
        );
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [returningFromCheckout, onLoginSuccess]);

  const totalCents = useMemo(
    () =>
      catalog
        .filter((module) => selected.includes(module.key))
        .reduce((sum, module) => sum + module.price_cents, 0),
    [catalog, selected]
  );

  const toggleModule = (key: string) => {
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (selected.length === 0) {
      setError("Select at least one module.");
      return;
    }
    if (!companyName.trim() || !username.trim() || !password.trim()) {
      setError("Company name, username and password are required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!termsAccepted) {
      setError(
        "Please agree to the Terms of Service and Privacy Policy to continue."
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          moduleKeys: selected,
          companyName: companyName.trim(),
          username: username.trim(),
          password,
          email: email.trim() || null,
          termsAccepted: true
        })
      });
      const payload = await res.json();
      if (!res.ok || !payload.url) {
        throw new Error(payload?.error || "Could not start secure checkout.");
      }
      sessionStorage.setItem(
        CHECKOUT_CREDENTIALS_KEY,
        JSON.stringify({ username: username.trim(), password })
      );
      window.location.href = payload.url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start secure checkout."
      );
      setSubmitting(false);
    }
  };

  if (provisioning) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center bg-slate-950 px-4"
        id="storefront-provisioning"
      >
        <div className="w-full max-w-md text-center space-y-5">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-white">Setting up your plant</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Payment received. We are creating your company, admin account and
            empty Equipment DB. This usually takes a few seconds.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.08),rgba(0,0,0,0))] px-4 py-10"
      id="storefront-page"
    >
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xl font-bold tracking-tight text-white">
                  Spectra <span className="text-emerald-400">CM</span>
                </p>
                <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                  Industrial Asset Reliability Command
                </p>
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Build your plant. Pay only for the modules you need.
            </h1>
            <p className="max-w-2xl text-sm text-slate-400 leading-relaxed">
              Select technologies, create your admin account, and pay. Your
              tenant, plant and empty Equipment DB are provisioned automatically
              after the card is accepted.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigateApp("/")}
            className="self-start px-4 py-2 rounded-xl border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
          >
            Existing customer sign in
          </button>
        </header>

        {canceled && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
            Checkout was canceled. Nothing was charged and no tenant was created.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {catalogError && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {catalogError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {catalog.map((module) => {
              const isSelected = selected.includes(module.key);
              return (
                <button
                  key={module.key}
                  type="button"
                  onClick={() => toggleModule(module.key)}
                  className={`text-left rounded-2xl border p-5 transition-all min-h-[168px] flex flex-col justify-between gap-4 ${
                    isSelected
                      ? "border-emerald-500/50 bg-emerald-950/20 shadow-lg shadow-emerald-500/5"
                      : "border-slate-800 bg-slate-900/30 hover:border-slate-700"
                  }`}
                  aria-pressed={isSelected}
                  id={`storefront-module-${module.key}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono">
                          {module.key}
                        </p>
                        <h2 className="text-base font-bold text-white">
                          {module.name}
                        </h2>
                      </div>
                      <span
                        className={`h-6 w-6 shrink-0 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? "bg-emerald-500 border-emerald-400 text-slate-950"
                            : "border-slate-700 text-transparent"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {module.description}
                    </p>
                  </div>
                  <p className="text-lg font-extrabold text-yellow-400">
                    {formatPrice(module.price_cents, module.currency)}
                    <span className="text-[11px] font-medium text-slate-500">
                      {" "}
                      / month
                    </span>
                  </p>
                </button>
              );
            })}
            {catalog.length === 0 && !catalogError && (
              <div className="sm:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center text-sm text-slate-500">
                Loading the module catalog...
              </div>
            )}
          </section>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4"
            id="storefront-checkout-form"
          >
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sparkles className="h-4 w-4 text-yellow-400" />
              <h2 className="text-sm font-bold text-white">Create my plant &amp; pay</h2>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Company / Plant name
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="e.g., Texas Refinery Alpha"
                className="w-full bg-slate-950/60 border border-slate-800 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 text-white rounded-lg px-3 py-2.5 text-sm outline-none placeholder:text-slate-600"
                id="storefront-company-input"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Admin username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="e.g., reliability_lead"
                className="w-full bg-slate-950/60 border border-slate-800 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 text-white rounded-lg px-3 py-2.5 text-sm outline-none placeholder:text-slate-600"
                id="storefront-username-input"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Email (optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="e.g., lead@refinery.com"
                className="w-full bg-slate-950/60 border border-slate-800 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 text-white rounded-lg px-3 py-2.5 text-sm outline-none placeholder:text-slate-600"
                id="storefront-email-input"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Admin password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-slate-950/60 border border-slate-800 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 text-white rounded-lg px-3 py-2.5 text-sm outline-none placeholder:text-slate-600"
                id="storefront-password-input"
              />
            </div>

            <div className="flex items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                required
                checked={termsAccepted}
                onChange={(event) => setTermsAccepted(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-700 bg-slate-950/60 text-emerald-500 focus:ring-emerald-500/40 cursor-pointer"
                id="storefront-terms-checkbox"
              />
              <label
                htmlFor="storefront-terms-checkbox"
                className="text-[11px] text-slate-400 leading-relaxed cursor-pointer"
              >
                I agree to the{" "}
                <button
                  type="button"
                  onClick={() => onShowLegal?.("terms")}
                  className="text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer bg-transparent border-none p-0"
                >
                  Terms of Service
                </button>{" "}
                and{" "}
                <button
                  type="button"
                  onClick={() => onShowLegal?.("privacy")}
                  className="text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer bg-transparent border-none p-0"
                >
                  Privacy Policy
                </button>
                .
              </label>
            </div>

            <div className="border-t border-slate-800 pt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {selected.length} module{selected.length === 1 ? "" : "s"} selected
                </span>
                <span className="text-lg font-extrabold text-yellow-400">
                  {formatPrice(totalCents, "usd")}
                  <span className="text-[10px] font-medium text-slate-500"> / month</span>
                </span>
              </div>
              <button
                type="submit"
                disabled={submitting || selected.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-yellow-400 text-slate-950 text-xs font-extrabold hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[44px]"
                id="storefront-pay-button"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Opening secure checkout...</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Create my plant &amp; pay</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
              <p className="flex items-center gap-1.5 text-[10px] text-slate-500 leading-normal">
                <Shield className="h-3 w-3 shrink-0" />
                Payment is handled on Square&apos;s hosted checkout. No company is
                created until the payment succeeds.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
