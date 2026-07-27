import React from "react";
import { SavedReport } from "../types";
import DiagnosisLogs from "./DiagnosisLogs";

interface HistoryProps {
  reports: SavedReport[];
  onSelectReport: (report: SavedReport) => void;
  onDeleteReport: (id: string) => void;
  onClearHistory: () => void;
  onStartDiagnosis?: () => void;
}

export default function History({ reports, onSelectReport, onDeleteReport, onClearHistory, onStartDiagnosis }: HistoryProps) {
  return (
    <DiagnosisLogs
      reports={reports}
      onSelectReport={onSelectReport}
      onDeleteReport={onDeleteReport}
      onStartDiagnosis={onStartDiagnosis}
    />
  );
}

