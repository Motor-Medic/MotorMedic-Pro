import React from "react";

export interface Suggestion {
  value: number;
  source: string;
  date: string;
  fileName: string;
}

const SIM_LABEL = "simulated estimate - demo mode, no live vision or web lookup";
const UNCONFIRMED = "unconfirmed - not used in any figure";
const UNAVAILABLE = "vision prefill unavailable - manual entry remains the only source";

function simulateReplacementCost(fileName: string, fileSize: number): number {
  let h = 0;
  for (let i = 0; i < fileName.length; i++) {
    h = (h * 31 + fileName.charCodeAt(i)) >>> 0;
  }
  h = (h ^ fileSize) >>> 0;
  const base = 4000 + (h % 46);
  return base * 500;
}

export function estimateFromImageFile(file: File): Promise<Suggestion | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      resolve({
        value: simulateReplacementCost(file.name, file.size),
        source: SIM_LABEL,
        date: new Date().toISOString(),
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
  });
}

export const UNAVAILABLE_CONFESS = UNAVAILABLE;

interface CostSuggestionCardProps {
  suggestion: Suggestion;
  onAdopt: (value: number) => void;
  onDismiss: () => void;
}

export default function CostSuggestionCard({
  suggestion,
  onAdopt,
  onDismiss,
}: CostSuggestionCardProps) {
  return (
    <div className="border border-amber-600/50 bg-amber-950/30 rounded-lg p-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
        {UNCONFIRMED}
      </p>
      <p className="text-lg font-semibold text-white">${suggestion.value.toLocaleString()}</p>
      <p className="text-[11px] text-slate-400">{suggestion.source}</p>
      <p className="text-[11px] text-slate-500">
        {suggestion.fileName} · {new Date(suggestion.date).toLocaleString()}
      </p>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onAdopt(suggestion.value)}
          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-yellow-400 text-slate-950 hover:bg-yellow-300 transition-colors"
        >
          Adopt as manual entry
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
