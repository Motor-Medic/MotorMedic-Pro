import React, { useState } from "react";
import { Shield, BookOpen, AlertCircle, FileText, CheckCircle, Mail, Phone, ExternalLink } from "lucide-react";

interface LegalDocumentsProps {
  onClose?: () => void;
  initialTab?: "terms" | "privacy";
}

export default function LegalDocuments({ onClose, initialTab = "terms" }: LegalDocumentsProps) {
  const [activeDoc, setActiveDoc] = useState<"terms" | "privacy">(initialTab);

  return (
    <div className="bg-slate-50 min-h-screen text-slate-800 font-sans antialiased">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        
        {/* Header Navigation */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-6 mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-sans font-semibold tracking-tight text-slate-900 flex items-center gap-3">
              <Shield className="w-8 h-8 text-indigo-600" />
              Legal & Compliance Center
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              MotorMedic Pro™ — Industrial Condition Monitoring SaaS Platform
            </p>
          </div>
          
          <div className="flex bg-slate-200/80 p-1 rounded-xl self-start md:self-auto">
            <button
              onClick={() => setActiveDoc("terms")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeDoc === "terms"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              <FileText className="w-4 h-4" />
              Terms of Service
            </button>
            <button
              onClick={() => setActiveDoc("privacy")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeDoc === "privacy"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Privacy Policy
            </button>
          </div>
        </div>

        {/* Document Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-10">
          
          {activeDoc === "terms" ? (
            /* ========================================================
               TERMS OF SERVICE
               ======================================================== */
            <article className="prose prose-slate max-w-none">
              <div className="mb-8 border-b border-slate-100 pb-6">
                <span className="bg-indigo-50 text-indigo-700 text-xs font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full">
                  Effective Date: July 8, 2026
                </span>
                <h2 className="text-2xl font-semibold text-slate-900 mt-4 mb-2">Terms of Service</h2>
                <p className="text-slate-500 text-sm">
                  Please read these Terms of Service carefully before accessing or using the MotorMedic Pro platform.
                </p>
              </div>

              <div className="space-y-8">
                <section>
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <CheckCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                    1. Acceptance of Terms
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm">
                    By accessing, registering, subscribing, or using the MotorMedic Pro platform (the "Service"), 
                    offered by MotorMedic Pro LLC ("Company", "we", "us", or "our"), you ("User", "Subscriber", 
                    "Customer", "Company Registered Representative") agree to be bound by these Terms of Service 
                    ("Terms"). If you do not agree to all of the terms and conditions outlined herein, you are 
                    strictly prohibited from accessing or utilizing the Service. If you are entering into these 
                    Terms on behalf of a company or other legal entity, you represent that you have the authority 
                    to bind such entity to these conditions.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                    2. Description of Service
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm">
                    MotorMedic Pro is an advanced, multi-tenant, cloud-based industrial condition monitoring and 
                    predictive maintenance software-as-a-service (SaaS) platform. The Service integrates 
                    AI-assisted machinery diagnostic tools, vibration signal analysis engines, infrared thermal 
                    profile mapping, motor current signature analysis (MCA), and historical trending algorithms. 
                    The Service is designed to assist reliability engineers, maintenance teams, and mechanical 
                    technicians in flagging machine anomalies, identifying failures early, and optimizing maintenance 
                    schedules.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <Shield className="w-5 h-5 text-indigo-600 shrink-0" />
                    3. User Accounts, Security & Tenancy Isolation
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm mb-3">
                    To access the platform's diagnostic capabilities, you must register a corporate user account. 
                    You are solely responsible for keeping your credentials confidential and secure. Every user 
                    account is strictly linked to a specific designated organization ("Company ID"). 
                  </p>
                  <p className="text-slate-600 leading-relaxed text-sm">
                    Our database architecture utilizes strict logical multi-tenant isolation protocols. Data uploaded 
                    by your organization—including vibration signatures, telemetry readings, plant structures, and reports—is 
                    isolated at the database level and cannot be accessed, shared, or modified by other corporate entities 
                    using the platform.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                    4. Subscriptions, Payments & Billing Tiers
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm mb-3">
                    Access to MotorMedic Pro is structured on a recurring tier-based subscription basis. 
                    Subscriptions are billed monthly in advance and processed securely via our payment gateway 
                    partner (Stripe). Current standard subscription tiers include:
                  </p>
                  <ul className="list-disc pl-5 text-slate-600 text-sm space-y-1">
                    <li><strong>Starter Plan ($399/mo):</strong> Core vibration diagnostic analysis capabilities.</li>
                    <li><strong>Professional Plan ($699/mo):</strong> Advanced multi-sensor vibration and thermal infrared (IR) analysis.</li>
                    <li><strong>Enterprise Plan ($1,299/mo):</strong> Full-suite condition monitoring (Vibration, IR, Ultrasound, MCA, and Oil Analysis).</li>
                  </ul>
                  <p className="text-slate-600 leading-relaxed text-sm mt-3">
                    Failure to settle subscription fees when due will result in automated grace period notices and 
                    eventual suspension of the organization's account. All subscription tiers auto-renew monthly 
                    unless canceled in writing or via the self-service Stripe Customer Portal.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                    5. Strict Acceptable Use & Non-Reverse Engineering
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm mb-3">
                    You agree to use the platform exclusively for legitimate industrial machinery monitoring. 
                    You are **STRICTLY PROHIBITED** from:
                  </p>
                  <ul className="list-disc pl-5 text-slate-600 text-sm space-y-1">
                    <li>Reverse-engineering, decompiling, or disassembling the proprietary AI debate loop or diagnostics algorithms.</li>
                    <li>Using automated bots, web scrapers, or scripts to flood the API endpoints.</li>
                    <li>Uploading corrupted files, malicious software, or execution vectors intended to disrupt system containers.</li>
                    <li>Using diagnostic data to construct a competing machine learning platform.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <BookOpen className="w-5 h-5 text-indigo-600 shrink-0" />
                    6. Data Ownership & Intellectual Property (IP)
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm mb-3">
                    <strong>User Content Ownership:</strong> Customers retain absolute and full ownership of their raw equipment data, 
                    uploaded vibration files, infrared photos, operational descriptions, notes, and generated diagnostic reports. 
                    MotorMedic Pro claims no ownership rights over your proprietary asset profiles or operational metrics.
                  </p>
                  <p className="text-slate-600 leading-relaxed text-sm">
                    <strong>Service IP:</strong> MotorMedic Pro retains exclusive ownership over the software, user interface design, 
                    CSS styling, proprietary API architectures, prompt engineering blocks, multi-agent debate moderators, and 
                    proprietary diagnostic models.
                  </p>
                </section>

                <section className="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-xl">
                  <h4 className="text-amber-800 font-semibold flex items-center gap-2 mb-2 text-sm">
                    <AlertCircle className="w-5 h-5" />
                    CRITICAL PLATFORM DISCLAIMERS (PLEASE READ)
                  </h4>
                  <div className="space-y-3 text-amber-900 text-xs leading-relaxed">
                    <p>
                      <strong>AI Diagnostic Disclaimer:</strong> The artificial intelligence models and multi-agent debate loops 
                      integrated within MotorMedic Pro provide engineering suggestions, baseline trends, and probable fault hypotheses. 
                      These suggestions **DO NOT** guarantee mechanical or operational accuracy. The Customer and its certified reliability 
                      personnel bear absolute responsibility for validating any diagnostic findings and supervising physical engineering decisions.
                    </p>
                    <p>
                      <strong>Industrial Equipment Safety Disclaimer:</strong> We are strictly not liable for industrial machinery 
                      failures, catastrophic damage, operational downtime, loss of production, plant shutdowns, or physical injuries/accidents 
                      occurring in connection with the use, misuse, or failure of the platform.
                    </p>
                    <p>
                      <strong>No Replacement for Professional Certified Expertise:</strong> This software is a monitoring tool and is 
                      **NOT** a replacement for on-site certified Category II/III ISO 18436 vibration specialists or professional reliability 
                      engineering consulting.
                    </p>
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                    7. Limitation of Liability
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm">
                    To the maximum extent permitted by applicable law, in no event shall MotorMedic Pro LLC or its developers 
                    be liable for any indirect, incidental, special, exemplary, punitive, or consequential damages whatsoever, 
                    including but not limited to loss of profits, data corruption, plant downtime, business interruption, 
                    or equipment replacement costs, arising out of or in connection with the platform or these Terms, regardless of the 
                    legal theory asserted.
                  </p>
                </section>

                <section className="border-t border-slate-100 pt-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">
                    8. Governing Law & Contact Information
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm mb-4">
                    These Terms of Service are governed by and construed in accordance with the laws of the State of Louisiana, 
                    United States, without regard to conflict of law principles. Any legal actions must be filed in courts located in Louisiana.
                  </p>
                  <div className="bg-slate-50 p-4 rounded-xl space-y-2 text-slate-600 text-sm">
                    <p className="font-semibold text-slate-800">MotorMedic Pro LLC</p>
                    <p className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" />
                      support@motormedicpro.com
                    </p>
                    <p className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400" />
                      225-210-6586
                    </p>
                  </div>
                </section>
              </div>
            </article>
          ) : (
            /* ========================================================
               PRIVACY POLICY
               ======================================================== */
            <article className="prose prose-slate max-w-none">
              <div className="mb-8 border-b border-slate-100 pb-6">
                <span className="bg-indigo-50 text-indigo-700 text-xs font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full">
                  Effective Date: July 8, 2026
                </span>
                <h2 className="text-2xl font-semibold text-slate-900 mt-4 mb-2">Privacy Policy</h2>
                <p className="text-slate-500 text-sm">
                  We are deeply committed to protecting your sensitive industrial telemetry and organizational data.
                </p>
              </div>

              <div className="space-y-8">
                <section>
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <CheckCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                    1. Information We Collect
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm mb-3">
                    We collect organizational data to deliver high-fidelity diagnostic reports. Specifically:
                  </p>
                  <ul className="list-disc pl-5 text-slate-600 text-sm space-y-1">
                    <li><strong>Asset Metadata:</strong> Equipment category, manufacturer specifications, bearing part numbers, operating speeds, and past maintenance history.</li>
                    <li><strong>Condition Monitoring Files:</strong> Uploaded vibration spectral files (CSV, XLS, TXT), waveforms, and thermal infrared (IR) imagery files.</li>
                    <li><strong>Account Credentials:</strong> Full name, corporate email address, contact phone number, and cryptographic passwords.</li>
                    <li><strong>Billing Details:</strong> Payment history, billing addresses, and Stripe transaction references. We do NOT store raw credit card numbers on our servers.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                    2. How We Use Your Information
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm mb-2">
                    We process and analyze this telemetry strictly for:
                  </p>
                  <ul className="list-disc pl-5 text-slate-600 text-sm space-y-1">
                    <li>Generating real-time multi-agent machinery health assessments.</li>
                    <li>Constructing asset health trending plots and vibration trend line charts.</li>
                    <li>Dispatching urgent SMS/Email alerts for flagged bearing thermal runaways or severe vibration thresholds.</li>
                    <li>Validating user verification overrides to optimize subsequent neural diagnostics accuracy.</li>
                  </ul>
                  <p className="text-slate-600 leading-relaxed text-sm mt-3 font-semibold text-indigo-600">
                    We strictly **DO NOT** sell, rent, or lease your corporate metrics or telemetry files to third-party advertisers.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <Shield className="w-5 h-5 text-indigo-600 shrink-0" />
                    3. Storage, Database Security & Tenancy Isolation
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm mb-3">
                    Your machinery measurements and operational descriptions are stored in high-performance cloud databases 
                    (PostgreSQL / Neon). Our infrastructure enforces strict logical isolation protocols.
                  </p>
                  <p className="text-slate-600 leading-relaxed text-sm">
                    All data in transit is protected using Transport Layer Security (TLS 1.3), and all stored 
                    vibration files, credentials, and logs are encrypted at rest using industry-standard Advanced 
                    Encryption Standard (AES-256). Periodic security compliance audits and intrusion tests are conducted 
                    regularly.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <ExternalLink className="w-5 h-5 text-indigo-600 shrink-0" />
                    4. Third-Party Subprocessors & Integrations
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm mb-3">
                    To deliver advanced multi-agent predictive analysis and reliable workflows, we integrate with the 
                    following subprocessors:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="font-semibold text-slate-800">Billing & Subscription Management</p>
                      <p className="text-xs mt-1">Stripe, Inc. handles card processing, PCI compliance, and self-service portal actions securely.</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="font-semibold text-slate-800">SaaS Cloud Hosting</p>
                      <p className="text-xs mt-1">Google Cloud Platform (Cloud Run containers) and Neon DB store application files, logs, and datasets.</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="font-semibold text-slate-800">AI Inference Processing</p>
                      <p className="text-xs mt-1">Google Gemini API, Groq Cloud, DeepSeek, and OpenRouter are utilized as secure subprocessors to compute machine diagnostics.</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="font-semibold text-slate-800">Email & Alert Dispatch</p>
                      <p className="text-xs mt-1">Resend API processes critical alerts, LOTO warnings, and monthly compliance reports securely.</p>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <CheckCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                    5. Cookies & Tracking Technologies
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm">
                    We use cookies and secure client local storage (`localStorage`) strictly to maintain user sessions, 
                    remember preferred UI filters, store active layout modes, and retain encrypted authentication tokens. 
                    We do NOT utilize advertising cookies or cross-site tracking scripts.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <BookOpen className="w-5 h-5 text-indigo-600 shrink-0" />
                    6. User Data Rights, Deletion & Retention
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm">
                    <strong>Right to Export & Deletion:</strong> You have the absolute right to export your machinery telemetry profiles, 
                    vibration files, and diagnostic logs at any time in structured JSON/CSV format. Upon written request from an authorized 
                    corporate administrator, we will execute complete, irreversible deletion of all records belonging to your company 
                    from our live servers and backups within 30 days.
                  </p>
                </section>

                <section className="border-t border-slate-100 pt-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">
                    7. Contact Information
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm mb-4">
                    For any questions regarding our data privacy standards, tenancy isolation, or to request record deletion, 
                    please contact us directly:
                  </p>
                  <div className="bg-slate-50 p-4 rounded-xl space-y-2 text-slate-600 text-sm">
                    <p className="font-semibold text-slate-800">MotorMedic Pro Data Compliance Officer</p>
                    <p className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" />
                      support@motormedicpro.com
                    </p>
                    <p className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400" />
                      225-210-6586
                    </p>
                  </div>
                </section>
              </div>
            </article>
          )}

        </div>
        
        {/* Simple Footer inside Modal */}
        {onClose && (
          <div className="mt-8 flex justify-end">
            <button
              onClick={onClose}
              id="btn-close-legal"
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-sm transition-all shadow-sm"
            >
              Close Legal Center
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
