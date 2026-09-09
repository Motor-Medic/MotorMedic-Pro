import React from "react";
import { FileText } from "lucide-react";

export interface RepairActionsTabProps {
  /** Whether this tab is currently active (controls render). */
  isActive: boolean;
}

export default function RepairActionsTab({ isActive }: RepairActionsTabProps) {
  if (!isActive) return null;

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <FileText className="h-8 w-8 text-slate-600 mb-3" />
      <p className="text-sm font-semibold text-slate-300">No data available</p>
      <p className="text-sm text-slate-500 mt-1 max-w-md">
        Repair actions will appear when a saved analysis includes recommended parts and work.
      </p>
    </div>
  );
}
