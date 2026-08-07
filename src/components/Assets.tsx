import React from "react";
import { SavedReport } from "../types";
import EquipmentExplorer from "./EquipmentExplorer";

/* ========================================================================== */
/* Props (unchanged contract for App.tsx)                                     */
/* ========================================================================== */

interface AssetsProps {
  user?: any;
  reports: SavedReport[];
  onSelectReport?: (report: SavedReport) => void;
  onStartDiagnosis?: (
    plantId: number,
    routeId: number,
    assetId: number,
    componentId: number,
    technologyType: string,
    collectionPointId?: number | string | null
  ) => void;
  selectedCompanyId?: number;
  setSelectedCompanyId?: (id: number) => void;
  subscriptionPlan?: string;
  onNavigateToMigration?: () => void;
  onNavigateToTrends?: (assetId: string) => void;
}

/**
 * Equipment Database — single-tenant CBM Plant Explorer.
 * Licensed facility root is pinned; users add Units/Routes under it.
 */
export default function Assets({
  user,
  reports,
  onSelectReport,
  onStartDiagnosis,
  selectedCompanyId,
  setSelectedCompanyId,
  subscriptionPlan,
  onNavigateToMigration,
  onNavigateToTrends
}: AssetsProps) {
  void reports;
  void onSelectReport;
  void onStartDiagnosis;
  void selectedCompanyId;
  void setSelectedCompanyId;
  void subscriptionPlan;
  void onNavigateToMigration;
  void onNavigateToTrends;

  const userPlantName =
    user?.plant_name ||
    user?.company_name ||
    user?.facility_name ||
    user?.username ||
    "Main Facility";

  return (
    <div className="w-full min-h-full px-2 sm:px-4 py-4 md:px-6">
      <EquipmentExplorer userPlantName={String(userPlantName)} />
    </div>
  );
}
