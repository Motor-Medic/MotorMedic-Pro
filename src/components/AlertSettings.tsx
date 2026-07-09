import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Bell, Mail, ShieldAlert, CheckCircle, RefreshCw, Send, AlertTriangle } from "lucide-react";
import { useToast } from "./Toast";

interface AlertSettingsProps {
  userId: number;
}

export default function AlertSettings({ userId }: AlertSettingsProps) {
  const { showToast } = useToast();
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [alertThreshold, setAlertThreshold] = useState("High");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`/api/alerts/preferences?userId=${userId}`);
        if (res.ok) {
          const data = await res.json();
          setEmailEnabled(!!data.email_enabled);
          setAlertThreshold(data.alert_threshold || "High");
        }
      } catch (err) {
        console.error("Failed to load alert settings:", err);
      }
    };
    fetchSettings();
  }, [userId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/alerts/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          emailEnabled,
          alertThreshold,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      showToast("Alert preferences updated successfully.", "success");
    } catch (error: any) {
      showToast(error.message || "Failed to update alert preferences.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAlert = async () => {
    setIsTesting(true);
    try {
      const response = await fetch("/api/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetName: "Charge Pump P-101A (Manual Test)",
          faultName: "Simulation Alert Trigger",
          severity: alertThreshold,
          recipientEmail: "shanedufrene1989@gmail.com",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send test alert");
      }

      showToast("Test alert email triggered successfully via Resend API.", "success");
    } catch (error: any) {
      showToast(error.message || "Failed to trigger test email. Is Resend configured?", "error");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6" id="alert-settings-container">
      <div className="border-b border-slate-800 pb-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-yellow-400" />
          Automated Email Alerts Configuration
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Configure real-time automated condition monitoring alerts to email your plant operators and reliability engineers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left settings card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-6">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
              <Mail className="w-4.5 h-4.5 text-yellow-400" />
              Delivery Channels & Thresholds
            </h4>

            {/* Email toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-950/40 border border-slate-900/60 rounded-xl">
              <div className="space-y-1 pr-4">
                <span className="text-xs font-extrabold text-white">Enable Email Notifications</span>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Receive instant detailed summary reports with ISO-standard classification details when critical anomalies occur.
                </p>
              </div>
              <button
                onClick={() => setEmailEnabled(!emailEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  emailEnabled ? "bg-yellow-400" : "bg-slate-800"
                }`}
                id="email-toggle-switch"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                    emailEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Severity threshold selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Minimum Alert Severity Threshold
              </label>
              <select
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
                disabled={!emailEnabled}
                className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-100 text-xs font-semibold rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-yellow-400/30 cursor-pointer"
                id="alert-threshold-select"
              >
                <option value="Critical">Critical Only (SLA Level 1 - Urgent Shutdown)</option>
                <option value="High">High & Critical (Standard Predictive Operational Faults)</option>
                <option value="Warning">Warning, High & Critical (Comprehensive Engineering Logs)</option>
              </select>
              <p className="text-[10px] text-slate-500 font-sans">
                Selecting high or warning thresholds will email updates on early stage faults to minimize costly failure escalation.
              </p>
            </div>

            {/* Save Preferences Button */}
            <div className="pt-2 flex flex-wrap gap-4">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-yellow-400 text-slate-950 text-xs font-bold hover:bg-yellow-300 transition-all duration-200 cursor-pointer shadow-lg shadow-yellow-400/5 disabled:opacity-50"
                id="save-preferences-btn"
              >
                {isSaving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                <span>Save Alert Preferences</span>
              </button>

              <button
                onClick={handleTestAlert}
                disabled={isTesting || !emailEnabled}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                id="test-alert-btn"
              >
                {isTesting ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-yellow-400" />
                ) : (
                  <Send className="w-4 h-4 text-yellow-400" />
                )}
                <span>Send Test Alert Email</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Info Panel */}
        <div className="space-y-6">
          <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6 space-y-4" id="alert-info-sidebar">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert className="w-4.5 h-4.5 text-rose-400" />
              Automated Operations
            </h4>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              When an asset's vibrational signature exhibits critical deviance (e.g. Catastrophic faults or RMS acceleration thresholds crossed), the diagnostic system automatically:
            </p>
            <ul className="space-y-2.5 pt-2 text-[11px] text-slate-500 font-medium">
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                <span>Formats rich HTML templates referencing ISO regulations and equipment nameplates.</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                <span>Logs the alert event securely in PostgreSQL `alert_history` for compliance audits.</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                <span>Dispatches via **Resend API** to plant reliability leads within 1.2 seconds of analysis.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
