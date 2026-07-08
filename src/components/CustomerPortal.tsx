import React, { useState } from "react";
import { CreditCard, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { useToast } from "./Toast";

interface CustomerPortalProps {
  companyId: number;
  stripeCustomerId?: string | null;
  className?: string;
}

export default function CustomerPortal({ companyId, stripeCustomerId, className = "" }: CustomerPortalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleOpenPortal = async () => {
    if (!stripeCustomerId) {
      showToast("No active subscription/Stripe profile found. Please subscribe to a tier first.", "error");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/create-portal-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ companyId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create customer portal session");
      }

      if (data.url) {
        // Redirect to Stripe Customer Portal
        window.location.href = data.url;
      } else {
        throw new Error("No redirect URL returned from customer portal session");
      }
    } catch (error: any) {
      console.error("Stripe portal session redirect error:", error);
      showToast(error.message || "Failed to launch subscription management portal.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`p-5 bg-slate-900/40 border border-slate-900 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 ${className}`} id="stripe-customer-portal-widget">
      <div className="space-y-1.5 text-center sm:text-left">
        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center justify-center sm:justify-start gap-2">
          <ShieldCheck className="w-4 h-4 text-yellow-400" />
          Secure Subscription Settings
        </h4>
        <p className="text-[11px] text-slate-400 leading-normal max-w-md">
          Access your self-service Stripe Customer Portal. There you can update billing details, change cards, download historical receipts, or cancel your renewal plan.
        </p>
      </div>

      <button
        onClick={handleOpenPortal}
        disabled={loading || !stripeCustomerId}
        className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 min-h-[44px] shrink-0 cursor-pointer ${
          !stripeCustomerId
            ? "bg-slate-950 border border-slate-800 text-slate-500 cursor-not-allowed"
            : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 active:scale-98"
        }`}
        id="stripe-portal-trigger-btn"
      >
        {loading ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin text-yellow-400" />
            <span>Redirecting to Stripe...</span>
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4 text-yellow-400" />
            <span>Manage Subscription</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </>
        )}
      </button>
    </div>
  );
}
