import React from "react";
import { ShieldCheck, Eye, ArrowLeft, Mail, Phone, Lock } from "lucide-react";

interface PrivacyProps {
  onBack?: () => void;
}

export default function Privacy({ onBack }: PrivacyProps) {
  return (
    <div className="bg-[#080c14] min-h-screen text-slate-300 font-sans antialiased py-12 px-4 md:px-8">
      <div className="max-w-4xl mx-auto bg-[#0d1527] rounded-2xl border border-slate-800 p-6 md:p-10 shadow-2xl">
        
        {/* Navigation / Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-6 mb-8 gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-[#10b981]" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Privacy Policy</h1>
              <p className="text-xs text-slate-500 mt-0.5">MotorMedic Pro™ — Secure B2B Condition Monitoring Platform</p>
            </div>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all cursor-pointer self-start md:self-auto"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to App
            </button>
          )}
        </div>

        {/* Content */}
        <div className="space-y-8 text-slate-300 leading-relaxed text-sm md:text-base">
          <div className="bg-[#0b101d] rounded-xl p-4 border border-slate-800/50 mb-6">
            <p className="text-xs text-slate-400">
              <strong>Effective Date:</strong> July 10, 2026. We are committed to maintaining maximum security, isolation, and transparency for your sensitive industrial asset telemetry.
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-[#10b981]">1.</span> Data Collection
            </h2>
            <p className="text-slate-400 mb-2">
              To perform accurate multi-agent debate machinery diagnostics, we collect relevant mechanical metadata and physical telemetry, including:
            </p>
            <ul className="list-disc pl-5 text-slate-400 text-sm space-y-1.5">
              <li><strong>Asset Profiles:</strong> Machine category, bearing part models, shaft operating speeds (RPM), and historical plant maintenance records.</li>
              <li><strong>Physical Vibration Telemetry:</strong> Uploaded spectrum waveforms and vibration files (CSV, XLS, TXT) and infrared thermal profile imagery.</li>
              <li><strong>Account Credentials:</strong> Authorized employee names, corporate emails, contact phone numbers, and encrypted credentials.</li>
              <li><strong>Billing Information:</strong> Purchase logs, subscription plans, and Stripe payment metadata. We never store raw debit/credit card details on our local databases.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-[#10b981]">2.</span> How We Use Data
            </h2>
            <p className="text-slate-400">
              We process your industrial data strictly to run predictive diagnostics and maintain reliability reporting workflows:
            </p>
            <ul className="list-disc pl-5 text-slate-400 text-sm space-y-1.5">
              <li>Computing AI-driven Multi-Agent machinery consensus diagnostics.</li>
              <li>Rendering high-fidelity vibration trend charts and plant health dashboards.</li>
              <li>Dispatching critical SMS and email alerts for high-severity bearing failures or LOTO notifications.</li>
              <li>Analyzing technician feedback inputs to optimize the localized diagnostics learning loop.</li>
            </ul>
            <p className="text-slate-300 font-medium bg-[#10b981]/5 px-3 py-2 rounded-lg border border-[#10b981]/10 text-xs mt-2">
              🔒 <strong>We strictly DO NOT sell, trade, or monetize your raw machine metrics or telemetry profiles to third-party brokers.</strong>
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-[#10b981]">3.</span> Data Security & Multi-Tenant Isolation
            </h2>
            <p className="text-slate-400">
              Our B2B database schemas (Neon/PostgreSQL) are built on **logical tenant isolation** at the database query level. Your uploaded telemetry, asset routes, and diagnostic histories are tied strictly to your organization's designated Company ID and are completely invisible and inaccessible to any other corporate user on the platform.
            </p>
            <p className="text-slate-400">
              All network data in transit is protected via Transport Layer Security (TLS 1.3), and stored data fields are encrypted at rest using Advanced Encryption Standard (AES-256). Backups, server containers, and access keys are kept in secure Google Cloud Platform (GCP) environments with restricted access control lists.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-[#10b981]">4.</span> Third-Party Subprocessors & Services
            </h2>
            <p className="text-slate-400">
              To process payments, host databases, and run AI models safely, we integrate with secure third-party services. We ensure your information is strictly proxied and kept confidential.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-300 mt-2">
              <div className="bg-[#0b101d] p-4 rounded-xl border border-slate-800/50">
                <p className="font-semibold text-white">Secure Payments</p>
                <p className="text-xs text-slate-400 mt-1">Stripe, Inc. processes recurring subscriptions, credit card verification, and enterprise billing securely under PCI-DSS standards.</p>
              </div>
              <div className="bg-[#0b101d] p-4 rounded-xl border border-slate-800/50">
                <p className="font-semibold text-white">AI Inference Processing</p>
                <p className="text-xs text-slate-400 mt-1">Google Gemini API, Groq Cloud, OpenRouter, and DeepSeek process raw machine data proxies. API keys are managed server-side and never exposed to the client.</p>
              </div>
              <div className="bg-[#0b101d] p-4 rounded-xl border border-slate-800/50">
                <p className="font-semibold text-white">Cloud Hosting & Database</p>
                <p className="text-xs text-slate-400 mt-1">Google Cloud Platform (Cloud Run containers) and Neon PostgreSQL databases host the platform, utilizing secure firewall rules and encryption keys.</p>
              </div>
              <div className="bg-[#0b101d] p-4 rounded-xl border border-slate-800/50">
                <p className="font-semibold text-white">Alert Dispatch Notifications</p>
                <p className="text-xs text-slate-400 mt-1">Resend API processes email notifications, severe vibration thresholds alerts, and plant summaries securely.</p>
              </div>
            </div>
          </section>

          <section className="border-t border-slate-800 pt-6 space-y-3">
            <h2 className="text-lg font-semibold text-white">5. Compliance & Record Deletion Rights</h2>
            <p className="text-slate-400 text-sm">
              You maintain the absolute right to request complete extraction or deletion of your telemetry profiles and employee logs. Deletion requests made by authorized corporate managers will be fully executed on our live databases and backup systems within 30 days.
            </p>
            <div className="bg-[#0b101d] p-4 rounded-xl space-y-2 text-slate-400 text-xs md:text-sm border border-slate-800/50">
              <p className="font-semibold text-white">MotorMedic Pro Security & Compliance</p>
              <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-500" /> support@motormedicpro.com</p>
              <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-500" /> 225-210-6586</p>
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
