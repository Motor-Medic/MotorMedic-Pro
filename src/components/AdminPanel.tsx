import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Settings, CreditCard, Building, CheckCircle2, XCircle, 
  Save, Info, Sliders, Activity, ShieldCheck, Check, Sparkles
} from "lucide-react";
import { useToast } from "./Toast";
import PricingPage from "./PricingPage";
import CustomerPortal from "./CustomerPortal";

interface Company {
  id: number;
  name: string;
  subscription_plan: string;
  created_at?: string;
}

interface AdminPanelProps {
  companies: Company[];
  onSubscriptionChange: () => void;
  selectedCompanyId: number;
}

export default function AdminPanel({ companies, onSubscriptionChange, selectedCompanyId }: AdminPanelProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"settings" | "billing">("settings");
  const [selectedCompId, setSelectedCompId] = useState<number>(selectedCompanyId);
  const [selectedPlan, setSelectedPlan] = useState<string>("vibration_only");
  const [isSaving, setIsSaving] = useState(false);

  const [companyBillingData, setCompanyBillingData] = useState<{
    id: number;
    name: string;
    subscription_plan: string;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    subscription_status?: string | null;
    next_billing_date?: string | null;
  } | null>(null);

  const fetchCompanyBilling = async () => {
    try {
      const res = await fetch(`/api/companies/${selectedCompId}`);
      if (res.ok) {
        const data = await res.json();
        setCompanyBillingData(data);
        if (data.subscription_plan) {
          setSelectedPlan(data.subscription_plan);
        }
      }
    } catch (error) {
      console.error("Failed to fetch billing data:", error);
    }
  };

  useEffect(() => {
    fetchCompanyBilling();
  }, [selectedCompId]);

  // Sync selected company when prop or companies change
  useEffect(() => {
    setSelectedCompId(selectedCompanyId);
  }, [selectedCompanyId]);

  useEffect(() => {
    const comp = companies.find(c => c.id === selectedCompId);
    if (comp) {
      setSelectedPlan(comp.subscription_plan || "vibration_only");
    }
  }, [selectedCompId, companies]);

  const handleSaveSubscription = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/companies/${selectedCompId}/subscription`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_plan: selectedPlan }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update subscription");
      }

      showToast(`Subscription plan updated to ${selectedPlan.replace("_", " ").toUpperCase()}`, "success");
      onSubscriptionChange();
      await fetchCompanyBilling();
    } catch (error: any) {
      console.error(error);
      showToast(error.message || "An error occurred while updating the subscription.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const planFeatures = {
    vibration_only: {
      vibration: true,
      infrared: false,
      ultrasound: false,
      mca: false,
      oil_analysis: false,
      title: "Vibration-Only Tier",
      desc: "Ideal for basic machinery health tracking using ISO 10816 standards."
    },
    ir_only: {
      vibration: false,
      infrared: true,
      ultrasound: false,
      mca: false,
      oil_analysis: false,
      title: "IR-Only Tier",
      desc: "Perfect for thermal imaging specialists monitoring hot-spots and insulation."
    },
    vibration_ir: {
      vibration: true,
      infrared: true,
      ultrasound: false,
      mca: false,
      oil_analysis: false,
      title: "Vibration + IR Dual Tier",
      desc: "Combines fundamental mechanical and thermal analysis profiles."
    },
    full_suite: {
      vibration: true,
      infrared: true,
      ultrasound: true,
      mca: true,
      oil_analysis: true,
      title: "Full Suite Enterprise",
      desc: "Unrestricted access to the absolute highest state of multi-technology analytics."
    },
    custom: {
      vibration: true,
      infrared: true,
      ultrasound: true,
      mca: true,
      oil_analysis: true,
      title: "Custom Integrated",
      desc: "Tailored engineering configurations for complex enterprise integrations."
    }
  };

  const currentPlanMeta = planFeatures[selectedPlan as keyof typeof planFeatures] || planFeatures.vibration_only;

  return (
    <div className="space-y-6" id="admin-panel-container">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-yellow-400" />
            Tenant Administration Center
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure tenant organizations, manage technology permissions, and view subscription pricing models.
          </p>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex gap-2 border-b border-slate-900 pb-px">
        <button
          onClick={() => setActiveTab("settings")}
          className={`px-4 py-2 text-xs font-bold transition-all relative ${
            activeTab === "settings"
              ? "text-yellow-400 border-b-2 border-yellow-400 font-extrabold"
              : "text-slate-400 hover:text-slate-200"
          }`}
          id="admin-tab-settings"
        >
          <span className="flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            Company Settings
          </span>
        </button>
        <button
          onClick={() => setActiveTab("billing")}
          className={`px-4 py-2 text-xs font-bold transition-all relative ${
            activeTab === "billing"
              ? "text-yellow-400 border-b-2 border-yellow-400 font-extrabold"
              : "text-slate-400 hover:text-slate-200"
          }`}
          id="admin-tab-billing"
        >
          <span className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Billing & Tiers
          </span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "settings" ? (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            id="admin-settings-section"
          >
            {/* Left Column: Form */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-5">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                  <Building className="w-4.5 h-4.5 text-yellow-400" />
                  Subscription Allocation
                </h3>

                {/* Select Company */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Select Target Company
                  </label>
                  <select
                    value={selectedCompId}
                    onChange={(e) => setSelectedCompId(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-100 text-xs font-semibold rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-yellow-400/30 cursor-pointer"
                    id="admin-company-select"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.id === selectedCompanyId ? "(Active Session)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Select Subscription Plan */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Assigned Subscription Tier
                  </label>
                  <select
                    value={selectedPlan}
                    onChange={(e) => setSelectedPlan(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-100 text-xs font-semibold rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-yellow-400/30 cursor-pointer"
                    id="admin-plan-select"
                  >
                    <option value="vibration_only">Vibration-Only Plan</option>
                    <option value="ir_only">IR-Only Plan</option>
                    <option value="vibration_ir">Vibration + IR Dual Plan</option>
                    <option value="full_suite">Full Suite Enterprise Plan</option>
                    <option value="custom">Custom Plan (All Features Enabled)</option>
                  </select>
                </div>

                {/* Plan Note */}
                <div className="p-3 bg-yellow-400/5 border border-yellow-400/10 rounded-xl flex items-start gap-2.5 text-yellow-100 text-xs">
                  <Info className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <span className="font-bold">{currentPlanMeta.title} active</span>
                    <p className="text-[11px] text-slate-400 leading-normal">{currentPlanMeta.desc}</p>
                  </div>
                </div>

                {/* Submit button */}
                <div className="pt-2">
                  <button
                    onClick={handleSaveSubscription}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-yellow-400 text-slate-950 text-xs font-bold hover:bg-yellow-300 transition-all duration-200 cursor-pointer shadow-lg shadow-yellow-400/5 disabled:opacity-50"
                    id="admin-save-btn"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? "Allocating licenses..." : "Update Subscription Plan"}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Permissions Visualizer */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6 space-y-5" id="admin-permissions-visualizer">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck className="w-4.5 h-4.5 text-emerald-400" />
                Live Features Grid
              </h3>
              <p className="text-[11px] text-slate-500 font-sans leading-relaxed">
                Changes applied will instantly lock or unlock corresponding tabs, widgets, and diagnostic capabilities for the selected organization.
              </p>

              <div className="space-y-3 pt-2">
                {[
                  { key: "vibration", label: "Vibration Analysis (ISO 10816)", enabled: currentPlanMeta.vibration },
                  { key: "infrared", label: "Infrared Thermography", enabled: currentPlanMeta.infrared },
                  { key: "ultrasound", label: "Ultrasonic / AE Testing", enabled: currentPlanMeta.ultrasound },
                  { key: "mca", label: "Motor Circuit Analysis (MCA)", enabled: currentPlanMeta.mca },
                  { key: "oil_analysis", label: "Oil Tribology & Fluid Analysis", enabled: currentPlanMeta.oil_analysis }
                ].map((tech) => (
                  <div 
                    key={tech.key} 
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      tech.enabled 
                        ? "bg-emerald-950/15 border-emerald-500/20 text-emerald-200" 
                        : "bg-slate-950/30 border-slate-900 text-slate-500"
                    }`}
                  >
                    <span className="text-xs font-semibold">{tech.label}</span>
                    {tech.enabled ? (
                      <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4.5 h-4.5 text-slate-700 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="billing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
            id="admin-billing-section"
          >
            {/* Subscription Status Display Card */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-6" id="stripe-billing-summary-widget">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900/60 pb-5">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Current Status</span>
                  <h3 className="text-sm font-bold text-slate-200">Organization Plan Details</h3>
                </div>
                {companyBillingData?.stripe_customer_id && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5" /> Stripe Managed
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {/* Plan Info */}
                <div className="space-y-1.5 bg-slate-950/40 p-4 rounded-xl border border-slate-900/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Plan Name</span>
                  <p className="text-xs font-extrabold text-white">
                    {companyBillingData?.subscription_plan === "vibration_only" && "Starter (Vibration Only)"}
                    {companyBillingData?.subscription_plan === "vibration_ir" && "Professional (Vibration + IR)"}
                    {companyBillingData?.subscription_plan === "full_suite" && "Enterprise (Full Suite)"}
                    {companyBillingData?.subscription_plan === "ir_only" && "IR Only"}
                    {companyBillingData?.subscription_plan === "custom" && "Custom Plan"}
                    {!companyBillingData?.subscription_plan && "Starter (Vibration Only)"}
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium">Mapped key: {companyBillingData?.subscription_plan || "vibration_only"}</p>
                </div>

                {/* Status Info */}
                <div className="space-y-1.5 bg-slate-950/40 p-4 rounded-xl border border-slate-900/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Payment Status</span>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                      companyBillingData?.subscription_status === "active" 
                        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                        : companyBillingData?.subscription_status === "past_due"
                        ? "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}>
                      {companyBillingData?.subscription_status ? companyBillingData.subscription_status.toUpperCase() : "FREE TIER"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">Billed through Stripe</p>
                </div>

                {/* Next Billing Date */}
                <div className="space-y-1.5 bg-slate-950/40 p-4 rounded-xl border border-slate-900/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Next Renewal Date</span>
                  <p className="text-xs font-extrabold text-slate-200">
                    {companyBillingData?.next_billing_date 
                      ? new Date(companyBillingData.next_billing_date).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric"
                        })
                      : "No renewal set (Free Tier)"
                    }
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium">Auto-renew active</p>
                </div>
              </div>

              {/* Customer Portal (Manage Subscription) component */}
              <CustomerPortal 
                companyId={selectedCompId} 
                stripeCustomerId={companyBillingData?.stripe_customer_id} 
              />
            </div>

            {/* Pricing Tiers Section */}
            <div className="border-t border-slate-900/60 pt-6">
              <PricingPage 
                companyId={selectedCompId} 
                currentPlan={companyBillingData?.subscription_plan} 
                onSuccess={fetchCompanyBilling} 
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
