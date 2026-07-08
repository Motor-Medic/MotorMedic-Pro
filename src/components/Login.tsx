import React, { useState } from "react";
import { motion } from "motion/react";
import { Shield, Key, User, ArrowRight, Activity, AlertCircle, Loader2 } from "lucide-react";

export interface UserSession {
  id: number;
  username: string;
  company_id: number;
  role: string;
  is_temp_password: boolean;
}

interface LoginProps {
  onLoginSuccess: (user: UserSession) => void;
  onShowLegal?: (tab: "terms" | "privacy") => void;
}

export default function Login({ onLoginSuccess, onShowLegal }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      onLoginSuccess(data);
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setDemoLoading(true);

    try {
      const response = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to enter Demo Mode.");
      }

      onLoginSuccess(data);
    } catch (err: any) {
      setError(err.message || "An error occurred starting Demo Mode.");
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.08),rgba(0,0,0,0))]" id="login-screen">
      <div className="w-full max-w-md p-2">
        
        {/* Upper Brand Badge */}
        <div className="flex flex-col items-center mb-8 text-center" id="login-brand">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="h-16 w-16 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
          >
            <Activity className="h-8 w-8 animate-pulse" />
          </motion.div>
          
          <motion.h1 
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="text-3xl font-sans font-bold tracking-tight text-white"
          >
            MotorMedic <span className="text-emerald-400">Pro</span>
          </motion.h1>
          <motion.p 
            initial={{ y: -5, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-slate-400 text-sm mt-1.5 font-mono tracking-wider uppercase"
          >
            Industrial Asset Reliability Command
          </motion.p>
        </div>

        {/* Credentials Card */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl shadow-2xl p-8"
          id="login-card"
        >
          <div className="flex items-center gap-3 border-b border-slate-800 pb-5 mb-6">
            <Shield className="h-5 w-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-medium text-slate-200">Secure Engineering Sign In</h2>
              <p className="text-xs text-slate-500">Authorized personnel only</p>
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="mb-5 p-3.5 bg-red-950/50 border border-red-500/30 rounded-lg flex items-start gap-2.5 text-red-200 text-sm"
              id="login-error"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 text-red-400 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Username Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Username / ID</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <User className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  required
                  disabled={loading || demoLoading}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g., reliability_eng_01"
                  className="w-full bg-slate-950/60 border border-slate-800 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 text-white rounded-lg pl-10 pr-4 py-2.5 text-sm transition-all placeholder:text-slate-600 outline-none"
                  id="login-username-input"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Access Key</label>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <Key className="h-4 w-4" />
                </span>
                <input
                  type="password"
                  required
                  disabled={loading || demoLoading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950/60 border border-slate-800 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 text-white rounded-lg pl-10 pr-4 py-2.5 text-sm transition-all placeholder:text-slate-600 outline-none"
                  id="login-password-input"
                />
              </div>
            </div>

            {/* Standard Login Submit Button */}
            <button
              type="submit"
              disabled={loading || demoLoading}
              className="w-full mt-2 bg-slate-100 hover:bg-white text-slate-950 font-medium py-2.5 px-4 rounded-lg text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              id="login-submit-btn"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                  <span>Verifying credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6" id="login-divider">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-900 px-3 text-slate-500 font-mono tracking-wide">Or use Sandbox</span>
            </div>
          </div>

          {/* Special Demo Mode Trigger Button */}
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading || demoLoading}
            className="w-full bg-gradient-to-r from-emerald-950/40 to-teal-950/40 border border-emerald-500/30 hover:border-emerald-400 text-emerald-400 hover:text-emerald-300 font-medium py-3 px-4 rounded-lg text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group shadow-[0_0_15px_rgba(16,185,129,0.05)]"
            id="demo-login-btn"
          >
            {demoLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                <span>Launching Demo Company...</span>
              </>
            ) : (
              <>
                <span>🚀 Enter Demo Mode</span>
              </>
            )}
          </button>

          <p className="text-center text-[11px] text-slate-500 mt-6 font-sans leading-relaxed">
            Demo Mode logs in instantly to a custom company pre-seeded with real-time assets, routes, and diagnostic telemetry for immediate evaluation.
          </p>
        </motion.div>

        {/* Footer info block */}
        <div className="text-center mt-6 flex flex-col items-center gap-2" id="login-footer">
          <p className="text-xs text-slate-600 font-mono">
            MotorMedic Pro v2.4.0 • Local System Encryption Active
          </p>
          <div className="flex items-center gap-3 text-xs text-slate-500 font-sans">
            <button
              onClick={() => onShowLegal?.("terms")}
              className="hover:text-emerald-400 hover:underline transition-colors cursor-pointer bg-transparent border-none p-0 outline-none"
            >
              Terms of Service
            </button>
            <span className="text-slate-700">•</span>
            <button
              onClick={() => onShowLegal?.("privacy")}
              className="hover:text-emerald-400 hover:underline transition-colors cursor-pointer bg-transparent border-none p-0 outline-none"
            >
              Privacy Policy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
