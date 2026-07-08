import React, { useState } from "react";
import { Check, XCircle, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { useToast } from "./Toast";

interface PricingPageProps {
  companyId: number;
  currentPlan?: string;
  onSuccess?: () => void;
}

export default function PricingPage({ companyId, currentPlan, onSuccess }: PricingPageProps) {
  const { showToast } = useToast();
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);

  // Fallback price IDs in case env variables aren't injected to the window
  const priceStarter = (window as any)._env_?.STRIPE_PRICE_STARTER || "price_starter_id";
  const priceProfessional = (window as any)._env_?.STRIPE_PRICE_PROFESSIONAL || "price_professional_id";
  const priceEnterprise = (window as any)._env_?.STRIPE_PRICE_ENTERPRISE || "price_enterprise_id";

  const tiers = [
    {
      id: "vibration_only",
      name: "Starter",
      price: "$299",
      priceId: priceStarter,
      desc: "Perfect for facilities focused purely on mechanical rotating equipment.",
      badge: "Vibration Core",
      color: "border-slate-800 bg-slate-900/30",
      features: [
        { name: "Vibration Analysis (ISO 10816)", enabled: true },
        { name: "Thermal Anomalies & Infrared", enabled: false },
        { name: "Ultrasound Leak Detection", enabled: false },
        { name: "Motor Circuit Analysis (MCA)", enabled: false },
        { name: "Standard SLA Support", enabled: true },
      ]
    },
    {
      id: "vibration_ir",
      name: "Professional",
      price: "$599",
      priceId: priceProfessional,
      desc: "Our most popular tier, combining mechanical and thermo diagnostics.",
      badge: "Vibration + Thermal",
      popular: true,
      color: "border-yellow-500/40 bg-slate-900/50 relative shadow-xl shadow-yellow-500/[0.01]",
      features: [
        { name: "Vibration Analysis (ISO 10816)", enabled: true },
        { name: "Thermal Anomalies & Infrared", enabled: true },
        { name: "Ultrasound Leak Detection", enabled: false },
        { name: "Motor Circuit Analysis (MCA)", enabled: false },
        { name: "Priority Email & Phone Support", enabled: true },
      ]
    },
    {
      id: "full_suite",
      name: "Enterprise",
      price: "$999",
      priceId: priceEnterprise,
      desc: "Complete industrial reliability intelligence and asset diagnostics command center.",
      badge: "Full Suite",
      color: "border-slate-800 bg-slate-900/30",
      features: [
        { name: "Vibration Analysis (ISO 10816)", enabled: true },
        { name: "Thermal Anomalies & Infrared", enabled: true },
        { name: "Ultrasound Leak Detection", enabled: true },
        { name: "Motor Circuit Analysis (MCA) & Tribology", enabled: true },
        { name: "24/7 Dedicated Support & Custom SLAs", enabled: true },
      ]
    }
  ];

  const handleSubscribe = async (priceId: string, planName: string) => {
    setLoadingPriceId(priceId);
    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ priceId, companyId }),
      });

      const data = await response.json();

      if (!response.ok || !data.url) {
        throw new Error(data.error || "Failed to create Stripe Checkout session");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error: any) {
      console.error("Stripe subscription redirect error:", error);
      showToast(error.message || "Failed to redirect to billing page. Check Stripe setup.", "error");
    } finally {
      setLoadingPriceId(null);
    }
  };

  return (
    <div className="space-y-6" id="pricing-page-container">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h3 className="text-xl font-extrabold text-white tracking-tight">Select Subscription Tier</h3>
        <p className="text-xs text-slate-400">
          Scale your machinery health analysis capabilities instantly. Subscriptions are billed monthly per organization.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        {tiers.map((tier) => {
          const isCurrent = currentPlan === tier.id;
          const isLoading = loadingPriceId === tier.priceId;

          return (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`border rounded-2xl p-6 flex flex-col justify-between gap-6 transition-all duration-200 hover:border-slate-700 ${tier.color}`}
              id={`pricing-card-${tier.id}`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-6 bg-yellow-400 text-slate-950 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Most Popular
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                    {tier.badge}
                  </span>
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-lg font-extrabold text-white">{tier.name}</h4>
                    {isCurrent && (
                      <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider">
                        Active Plan
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">{tier.desc}</p>
                </div>

                <div className="pt-2">
                  <span className="text-3xl font-extrabold text-yellow-400">{tier.price}</span>
                  <span className="text-xs text-slate-500 font-medium"> / month</span>
                </div>

                <div className="pt-4 border-t border-slate-900 space-y-2.5 text-[11px] text-slate-400 font-medium">
                  {tier.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {feature.enabled ? (
                        <Check className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                      )}
                      <span className={feature.enabled ? "text-slate-300" : "text-slate-600 line-through"}>
                        {feature.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => handleSubscribe(tier.priceId, tier.name)}
                  disabled={isLoading || isCurrent}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer min-h-[44px] ${
                    isCurrent
                      ? "bg-slate-950 border border-emerald-500/20 text-emerald-400 cursor-not-allowed"
                      : "bg-yellow-400 text-slate-950 hover:bg-yellow-500 hover:shadow-lg hover:shadow-yellow-400/5 disabled:opacity-50"
                  }`}
                  id={`subscribe-btn-${tier.id}`}
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Opening Secure Checkout...</span>
                    </>
                  ) : isCurrent ? (
                    <span>Your Current Plan</span>
                  ) : (
                    <span>Subscribe to {tier.name}</span>
                  )}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="bg-slate-900/10 border border-slate-900 rounded-2xl p-4 flex gap-3 text-[11px] text-slate-500 leading-normal">
        <AlertCircle className="w-4.5 h-4.5 text-yellow-400 shrink-0 mt-0.5" />
        <p>
          You are currently in **Stripe Test Mode**. All payments are simulated. Use any of Stripe's official credit cards (e.g. `4242 4242 4242 4242` with any expiry in the future and any CVV) to test the completed checkout process.
        </p>
      </div>
    </div>
  );
}
