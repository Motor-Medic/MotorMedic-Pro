import React from "react";
import { Shield, FileText, ArrowLeft, Mail, Phone, Scale } from "lucide-react";

interface TermsProps {
  onBack?: () => void;
}

export default function Terms({ onBack }: TermsProps) {
  return (
    <div className="bg-[#080c14] min-h-screen text-slate-300 font-sans antialiased py-12 px-4 md:px-8">
      <div className="max-w-4xl mx-auto bg-[#0d1527] rounded-2xl border border-slate-800 p-6 md:p-10 shadow-2xl">
        
        {/* Navigation / Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-6 mb-8 gap-4">
          <div className="flex items-center gap-3">
            <Scale className="w-8 h-8 text-amber-500" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Terms of Service</h1>
              <p className="text-xs text-slate-500 mt-0.5">MotorMedic Pro™ — Industrial Condition Monitoring SaaS</p>
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
              <strong>Effective Date:</strong> July 10, 2026. Please read these Terms of Service carefully before accessing or using our industrial condition monitoring platform.
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-amber-500">1.</span> Acceptance of Terms
            </h2>
            <p className="text-slate-400">
              By accessing, registering for, subscribing to, or using the MotorMedic Pro platform (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to all terms and conditions, you are strictly prohibited from utilizing the Service. If you are accepting these Terms on behalf of a company, corporate enterprise, or other legal entity, you warrant that you have the full legal authority to bind such entity to these provisions.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-amber-500">2.</span> Use of Service
            </h2>
            <p className="text-slate-400 mb-2">
              MotorMedic Pro provides a multi-tenant, cloud-based predictive maintenance and machinery diagnostics tool. Users are granted a limited, revocable, non-exclusive, non-transferable right to access and use the platform solely for internal industrial diagnostics and equipment reliability monitoring.
            </p>
            <p className="text-slate-400">
              You agree not to misuse the Service. Misuse includes, but is not limited to: reverse engineering any prompt blocks, debate engines, or neural diagnostic algorithms; attempting unauthorized access to other corporate tenants; transmitting corrupted data files; or using scraping technologies to extract system metadata.
            </p>
          </section>

          <section className="space-y-3 bg-[#0a0f1d] border-l-4 border-amber-500 p-5 rounded-r-xl">
            <h2 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-amber-500">3.</span> Data Ownership & Intellectual Property (IP)
            </h2>
            <p className="text-slate-300 font-medium">
              We respect your industrial data assets. Our B2B policy is built on complete transparency:
            </p>
            <ul className="list-disc pl-5 text-slate-400 text-sm space-y-2 mt-2">
              <li>
                <strong>Customer Data Ownership:</strong> You retain absolute and exclusive ownership of all raw measurements, equipment telemetry, vibration spectral files (CSV, XLS, TXT), thermal infrared files, historical logs, component specs, and generated reports. MotorMedic Pro claims zero intellectual property rights over your data.
              </li>
              <li>
                <strong>SaaS Platform Intellectual Property:</strong> All software, interface design, CSS stylesheets, proprietary multi-agent debate schemas, database structures, prompt templates, and source code are the sole and exclusive property of MotorMedic Pro LLC.
              </li>
              <li>
                <strong>Anonymized Telemetry:</strong> You grant us a restricted, non-exclusive, royalty-free license to use completely anonymized and aggregated machine data solely to improve our underlying AI predictive models.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-amber-500">4.</span> Limitation of Liability
            </h2>
            <p className="text-slate-400">
              The AI models, multi-agent debates, and ISO 10816 baseline helpers integrated into MotorMedic Pro provide advisory health assessments. They do not replace hands-on certified Category II/III ISO vibration specialists or certified technicians.
            </p>
            <p className="text-slate-400">
              To the maximum extent permitted by applicable law, in no event shall MotorMedic Pro LLC, its developers, or its licensors be liable for any catastrophic machinery failure, production downtime, plant outages, business interruptions, replacement costs, physical injuries, or consequential damages resulting from the use or inability to use the platform, even if advised of the possibility of such damages.
            </p>
          </section>

          <section className="border-t border-slate-800 pt-6 space-y-3">
            <h2 className="text-lg font-semibold text-white">5. Governing Law & Contact</h2>
            <p className="text-slate-400 text-sm">
              These Terms of Service are governed by the laws of the State of Louisiana, United States, without regard to conflict of law principles. Any legal actions must be brought within state or federal courts located in Louisiana.
            </p>
            <div className="bg-[#0b101d] p-4 rounded-xl space-y-2 text-slate-400 text-xs md:text-sm border border-slate-800/50">
              <p className="font-semibold text-white">MotorMedic Pro LLC</p>
              <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-500" /> support@motormedicpro.com</p>
              <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-500" /> 225-210-6586</p>
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
