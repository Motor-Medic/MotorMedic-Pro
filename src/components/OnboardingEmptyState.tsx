import React from "react";
import { Activity, FolderOpen, Plus, Upload } from "lucide-react";
import { clearAllData, getFlatEquipment, loadDemoData } from "../data/equipmentDb";
import { navigateToTab } from "../navigation";

export type EmptyStateVariant = "equipment" | "analysis" | "logs";

interface OnboardingEmptyStateProps {
  variant?: EmptyStateVariant;
  onDataChange?: () => void;
  /** When set (e.g. Equipment DB), primary CTA opens the add-asset flow instead of navigating. */
  onAddFirst?: () => void;
}

/**
 * Industrial empty / fresh-onboarding banner used when equipment & spectra are empty.
 */
export default function OnboardingEmptyState({
  variant = "equipment",
  onDataChange,
  onAddFirst
}: OnboardingEmptyStateProps) {
  const primaryLabel =
    variant === "analysis" ? "📷 Upload Spectrum Image" : "+ Add First Equipment";

  const handlePrimary = () => {
    if (onAddFirst) {
      onAddFirst();
      return;
    }
    if (variant === "analysis") {
      navigateToTab("diagnose");
      return;
    }
    navigateToTab("assets");
  };

  const handleLoadDemo = () => {
    loadDemoData();
    onDataChange?.();
  };

  const handleClear = () => {
    clearAllData();
    onDataChange?.();
  };

  const hasDemo = getFlatEquipment().length > 0;

  const Icon =
    variant === "analysis" ? Upload : variant === "logs" ? Activity : FolderOpen;

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0A0E1A] p-8 sm:p-12 text-center shadow-xl">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#FFC700]/30 bg-[#FFC700]/10">
        <Icon className="h-7 w-7 text-[#FFC700]" />
      </div>
      <h3 className="text-lg font-bold text-white">No Analysis Data Found</h3>
      <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
        Get started by adding your first machine asset or uploading a spectrum image.
      </p>
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2">
        <button
          type="button"
          onClick={handlePrimary}
          className="min-h-[44px] px-5 rounded-xl bg-[#FFC700] text-slate-950 text-sm font-bold cursor-pointer inline-flex items-center gap-1.5 hover:bg-[#e6b400] transition-colors"
        >
          {variant === "analysis" ? (
            <Upload className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={handleLoadDemo}
          className="min-h-[44px] px-5 rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-200 text-sm font-bold cursor-pointer hover:bg-cyan-400/20 transition-colors"
        >
          Load Demo Plant Data
        </button>
        {hasDemo && (
          <button
            type="button"
            onClick={handleClear}
            className="min-h-[44px] px-4 rounded-xl border border-slate-700 text-slate-400 text-xs font-bold cursor-pointer hover:border-slate-500 hover:text-slate-200 transition-colors"
          >
            Clear to Fresh Slate
          </button>
        )}
      </div>
    </div>
  );
}
