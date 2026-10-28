import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, Key, Loader2, ShieldCheck, User } from "lucide-react";
import type { UserSession } from "./Login";

interface InviteAcceptProps {
  token: string;
  onAccepted: (user: UserSession) => void;
}

export default function InviteAccept({ token, onAccepted }: InviteAcceptProps) {
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingInvite(true);
    fetch(`/api/invite/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "This invite is not valid.");
        if (!active) return;
        setTenantName(data.tenant_name ?? null);
        setInvitedEmail(data.email ?? null);
        const suggested = String(data.email || "").split("@")[0] || "";
        setUsername(suggested);
      })
      .catch((err: any) => {
        if (active) setError(err.message || "This invite is not valid.");
      })
      .finally(() => {
        if (active) setLoadingInvite(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Choose a username.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/invite/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim(),
            password
          })
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to accept the invite.");
      }
      onAccepted(data.user);
    } catch (err: any) {
      setError(err.message || "Failed to accept the invite.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#080c14] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-[#0b1220] border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl"
      >
        <div className="space-y-1">
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FFC700]">
            Spectra CM invite
          </p>
          <h1 className="text-lg font-bold text-white">Join your team</h1>
          {loadingInvite ? (
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Checking invite...
            </p>
          ) : error && !invitedEmail ? (
            <p className="text-xs text-red-400 flex items-start gap-2" id="invite-load-error">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </p>
          ) : (
            <p className="text-xs text-slate-400 leading-relaxed">
              You were invited to <span className="text-slate-200 font-semibold">{tenantName || "your team"}</span>.
              Set a password for <span className="font-mono text-slate-200">{invitedEmail}</span> to finish.
            </p>
          )}
        </div>

        {!loadingInvite && invitedEmail && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Username
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <User className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 focus:border-[#FFC700] focus:ring-1 focus:ring-[#FFC700]/30 text-white rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none"
                  id="invite-username-input"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <Key className="h-4 w-4" />
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 focus:border-[#FFC700] focus:ring-1 focus:ring-[#FFC700]/30 text-white rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none"
                  id="invite-password-input"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Confirm Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 focus:border-[#FFC700] focus:ring-1 focus:ring-[#FFC700]/30 text-white rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none"
                  id="invite-confirm-password-input"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400" id="invite-accept-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-[#FFC700] hover:bg-yellow-300 text-slate-950 text-sm font-bold disabled:opacity-50"
              id="invite-accept-submit"
            >
              {submitting ? "Setting password..." : "Accept Invite"}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
