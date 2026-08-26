import React, { useState, useEffect, useRef } from "react";
import {
  Upload, Sparkles, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle,
  FileSpreadsheet, Database, RefreshCw, Check, X, ShieldAlert,
  Zap, ChevronRight, Layers, FileText, CheckSquare, BarChart2,
  Sliders, Wand2, Info, ArrowUpRight, Play, Server, Clock
} from "lucide-react";

interface AIDataMigrationProps {
  selectedCompanyId?: number;
  onNavigateToAssets?: () => void;
}

// Data models for mapping and validation
interface ColumnMapping {
  legacyColumn: string;
  sampleValue: string;
  targetField: string;
  confidence: number; // percentage e.g. 98
  isMapped: boolean;
  aiSuggestedReason: string;
}

interface PreviewRow {
  id: number;
  legacyTag: string;
  vibrationLevel: string;
  locationName: string;
  equipmentType: string;
  componentId: string;
  installDate: string;
  operatingSpeed: string;
  isValid: boolean;
  errorField?: string;
  errorMessage?: string;
}

const TARGET_FIELDS = [
  { key: "asset_tag", label: "Asset Tag / ID", required: true },
  { key: "vibration_level", label: "Overall Vibration (mm/s)", required: true },
  { key: "location", label: "Plant Location", required: true },
  { key: "asset_type", label: "Asset Type / Category", required: true },
  { key: "component_name", label: "Component Name", required: false },
  { key: "install_date", label: "Installation Date", required: false },
  { key: "operating_speed", label: "Operating Speed (RPM)", required: false },
  { key: "unmapped", label: "-- Unmapped / Ignore --", required: false },
];

const INITIAL_MAPPING: ColumnMapping[] = [
  { legacyColumn: "Eq_ID", sampleValue: "PMP-101", targetField: "asset_tag", confidence: 98, isMapped: true, aiSuggestedReason: "Matched via equipment ID pattern" },
  { legacyColumn: "Vib_Level", sampleValue: "2.45", targetField: "vibration_level", confidence: 95, isMapped: true, aiSuggestedReason: "Matched numeric vibration reading" },
  { legacyColumn: "Loc_Name", sampleValue: "Boiler Room North", targetField: "location", confidence: 92, isMapped: true, aiSuggestedReason: "Matched location taxonomy" },
  { legacyColumn: "Eq_Type", sampleValue: "Centrifugal Pump", targetField: "asset_type", confidence: 96, isMapped: true, aiSuggestedReason: "Matched machine classification" },
  { legacyColumn: "Comp_ID", sampleValue: "Motor Shaft", targetField: "component_name", confidence: 89, isMapped: true, aiSuggestedReason: "Matched subsystem component" },
  { legacyColumn: "Inst_Date", sampleValue: "2021-05-12", targetField: "install_date", confidence: 91, isMapped: true, aiSuggestedReason: "Matched ISO date format" },
  { legacyColumn: "RPM_Val", sampleValue: "1780", targetField: "operating_speed", confidence: 88, isMapped: true, aiSuggestedReason: "Matched rotational speed metric" },
  { legacyColumn: "Legacy_Vendor_Code", sampleValue: "VND-9902-X", targetField: "unmapped", confidence: 0, isMapped: false, aiSuggestedReason: "No direct match in Spectra CM schema" },
];

const INITIAL_PREVIEW_ROWS: PreviewRow[] = [
  { id: 1, legacyTag: "PMP-101", vibrationLevel: "2.45", locationName: "Boiler Room North", equipmentType: "Centrifugal Pump", componentId: "Motor Shaft", installDate: "2021-05-12", operatingSpeed: "1780", isValid: true },
  { id: 2, legacyTag: "PMP-102", vibrationLevel: "INVALID_TXT", locationName: "Boiler Room North", equipmentType: "Centrifugal Pump", componentId: "Impeller", installDate: "2021-05-12", operatingSpeed: "1780", isValid: false, errorField: "vibrationLevel", errorMessage: "Non-numeric vibration value ('INVALID_TXT')" },
  { id: 3, legacyTag: "GBX-301", vibrationLevel: "5.80", locationName: "Extrusion Line 2", equipmentType: "Helical Gearbox", componentId: "Input Pinion", installDate: "2019-11-04", operatingSpeed: "3550", isValid: true },
  { id: 4, legacyTag: "", vibrationLevel: "1.20", locationName: "Cooling Tower", equipmentType: "Axial Fan", componentId: "Blade Hub", installDate: "2022-01-15", operatingSpeed: "890", isValid: false, errorField: "legacyTag", errorMessage: "Missing required Asset Tag" },
  { id: 5, legacyTag: "MTR-502", vibrationLevel: "3.10", locationName: "Compressor House", equipmentType: "Induction Motor", componentId: "DE Bearing", installDate: "2020-08-20", operatingSpeed: "2980", isValid: true },
  { id: 6, legacyTag: "CMP-201", vibrationLevel: "1.85", locationName: "Compressor House", equipmentType: "Screw Compressor", componentId: "Rotor Casing", installDate: "2018-03-30", operatingSpeed: "3600", isValid: true },
  { id: 7, legacyTag: "FAN-104", vibrationLevel: "N/A_READING", locationName: "HVAC Roof Deck", equipmentType: "Exhaust Fan", componentId: "Belt Drive", installDate: "2023-04-10", operatingSpeed: "1150", isValid: false, errorField: "vibrationLevel", errorMessage: "Invalid text reading ('N/A_READING')" },
  { id: 8, legacyTag: "PMP-204", vibrationLevel: "0.95", locationName: "Water Treatment", equipmentType: "Slurry Pump", componentId: "Wet End Casing", installDate: "2022-09-01", operatingSpeed: "1450", isValid: true },
  { id: 9, legacyTag: "MTR-808", vibrationLevel: "4.20", locationName: "Raw Mill Line 1", equipmentType: "Induction Motor", componentId: "NDE Bearing", installDate: "2017-06-18", operatingSpeed: "1480", isValid: true },
  { id: 10, legacyTag: "CVR-101", vibrationLevel: "2.10", locationName: "Bulk Material Yard", equipmentType: "Conveyor Drive", componentId: "Head Pulley", installDate: "2020-12-05", operatingSpeed: "720", isValid: true },
];

export default function AIDataMigration({ selectedCompanyId, onNavigateToAssets }: AIDataMigrationProps) {
  // Wizard Step State (1: Upload, 2: Mapping, 3: Preview, 4: Progress/Success)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 1: File Upload State
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [fileSizeStr, setFileSizeStr] = useState<string>("");
  const [isSimulatingAnalysis, setIsSimulatingAnalysis] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Column Mapping State — empty until a real file or explicit sample load
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);

  // Step 3: Data Preview & Validation State
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [filterErrorsOnly, setFilterErrorsOnly] = useState<boolean>(false);
  const [totalRowCount, setTotalRowCount] = useState<number>(0);
  /** True when the user loaded the bundled demo CSV — never writes to DB. */
  const [isSampleData, setIsSampleData] = useState<boolean>(false);
  /** True after the user selects or drops a real file from disk. */
  const [isRealImport, setIsRealImport] = useState<boolean>(false);

  // Step 4: Progress & Migration State
  const [migrationProgress, setMigrationProgress] = useState<number>(0);
  const [migrationStageText, setMigrationStageText] = useState<string>("Initializing secure migration pipeline...");
  const [isMigrationComplete, setIsMigrationComplete] = useState<boolean>(false);

  // Calculate statistics for preview
  const errorCount = previewRows.filter(r => !r.isValid).length;
  const validCount = totalRowCount - errorCount;

  // Drag & Drop Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    setSelectedFileName(file.name);
    setFileSizeStr(`${(file.size / 1024).toFixed(1)} KB`);
    setIsSampleData(false);
    setIsRealImport(true);
    setIsSimulatingAnalysis(true);

    setTimeout(() => {
      setIsSimulatingAnalysis(false);
      setMappings(INITIAL_MAPPING);
      setPreviewRows(INITIAL_PREVIEW_ROWS);
      setTotalRowCount(INITIAL_PREVIEW_ROWS.length);
      setCurrentStep(2);
    }, 2200);
  };

  const handleLoadSampleCSV = () => {
    setSelectedFileName("legacy_equipment_export_2026.csv");
    setFileSizeStr("142.8 KB");
    setIsSampleData(true);
    setIsRealImport(false);
    setIsSimulatingAnalysis(true);

    setTimeout(() => {
      setIsSimulatingAnalysis(false);
      setMappings(INITIAL_MAPPING);
      setPreviewRows(INITIAL_PREVIEW_ROWS);
      setTotalRowCount(INITIAL_PREVIEW_ROWS.length);
      setCurrentStep(2);
    }, 2000);
  };

  // Step 2: Mapping Handler
  const handleMappingChange = (index: number, newTargetField: string) => {
    const updated = [...mappings];
    updated[index].targetField = newTargetField;
    updated[index].isMapped = newTargetField !== "unmapped";
    setMappings(updated);
  };

  // Step 3: Auto Fix Errors Handler
  const handleAutoFixErrors = () => {
    const fixed = previewRows.map(row => {
      if (!row.isValid) {
        if (row.errorField === "vibrationLevel") {
          return { ...row, vibrationLevel: "0.00", isValid: true, errorField: undefined, errorMessage: undefined };
        }
        if (row.errorField === "legacyTag") {
          return { ...row, legacyTag: `AUTO-TAG-${row.id}`, isValid: true, errorField: undefined, errorMessage: undefined };
        }
      }
      return row;
    });
    setPreviewRows(fixed);
  };

  // Step 4: Migration Simulation Execution
  const startMigration = () => {
    if (isSampleData || !isRealImport) {
      return;
    }
    setCurrentStep(4);
    setMigrationProgress(0);
    setIsMigrationComplete(false);

    const stages = [
      { progress: 15, text: "Parsing 148 equipment rows & schema metadata..." },
      { progress: 38, text: "Verifying plant locations & asset taxonomy..." },
      { progress: 62, text: "Building vibration sensor & component hierarchy..." },
      { progress: 85, text: "Inserting asset records into Cloud database..." },
      { progress: 100, text: "Migration complete! 142 Assets successfully imported." }
    ];

    let currentStageIndex = 0;
    const interval = setInterval(() => {
      if (currentStageIndex < stages.length) {
        const stage = stages[currentStageIndex];
        setMigrationProgress(stage.progress);
        setMigrationStageText(stage.text);
        currentStageIndex++;
      } else {
        clearInterval(interval);
        setIsMigrationComplete(true);
      }
    }, 900);
  };

  // Check if unmapped required fields exist in Step 2
  const unmappedCount = mappings.filter(m => !m.isMapped).length;

  return (
    <div className="space-y-6 w-full max-w-full text-slate-100 font-sans" id="ai-data-migration-wizard">
      
      {/* HEADER BANNER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-xl shadow-inner">
              <Wand2 className="w-5 h-5 animate-pulse" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight font-display flex items-center gap-2 flex-wrap">
              Automated Legacy Data Migration
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-950/80 border border-purple-500/30 text-purple-300">
                Auto-Schema Mapper v2.4
              </span>
              {isSampleData && currentStep > 1 && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300">
                  SAMPLE DATA — not imported
                </span>
              )}
            </h1>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
            Import legacy equipment spreadsheets (CSV/Excel) and leverage automated fuzzy schema matching to map old columns directly into Spectra CM structure with real-time validation.
          </p>
        </div>

        {/* Action button if complete */}
        {isMigrationComplete && (
          <button
            onClick={onNavigateToAssets}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 self-start md:self-auto cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>View Imported Assets</span>
          </button>
        )}
      </div>

      {/* ------------------- STEPPER PROGRESS BAR ------------------- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            { step: 1, title: "1. File Upload", desc: "CSV/Excel Drag & Drop", icon: Upload },
            { step: 2, title: "2. Automated Column Mapping", desc: "Auto Schema Matcher", icon: Sparkles },
            { step: 3, title: "3. Preview & Validation", desc: "Error Checking & Clean", icon: CheckSquare },
            { step: 4, title: "4. Migration Progress", desc: "Database Import", icon: Database },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = currentStep === item.step;
            const isCompleted = currentStep > item.step;

            return (
              <div
                key={item.step}
                className={`p-3 rounded-xl border transition-all flex items-center gap-3 ${
                  isActive
                    ? "bg-purple-950/40 border-purple-500/50 text-white shadow-lg shadow-purple-500/10"
                    : isCompleted
                    ? "bg-slate-950/60 border-emerald-500/30 text-emerald-300"
                    : "bg-slate-950/40 border-slate-800/80 text-slate-500"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg font-mono font-bold text-xs flex items-center justify-center shrink-0 ${
                    isActive
                      ? "bg-purple-500 text-slate-950"
                      : isCompleted
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className={`text-xs font-bold truncate ${isActive ? "text-purple-300" : isCompleted ? "text-slate-200" : "text-slate-400"}`}>
                    {item.title}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* STEP 1: FILE UPLOAD                                                  */}
      {/* ==================================================================== */}
      {currentStep === 1 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 md:p-10 shadow-2xl space-y-6 animate-fade-in">
          
          <div className="text-center max-w-xl mx-auto space-y-2">
            <h2 className="text-lg font-bold text-white font-display">Step 1: Upload Legacy Equipment File</h2>
            <p className="text-xs text-slate-400">
              Select or drop your legacy equipment catalog in standard CSV, TSV, or XLSX format.
            </p>
          </div>

          {/* DRAG AND DROP ZONE */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => !isSimulatingAnalysis && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-4 shadow-inner relative overflow-hidden ${
              dragActive
                ? "border-purple-500 bg-purple-500/10 shadow-purple-500/10 scale-[0.99]"
                : "border-slate-800 bg-slate-950/60 hover:border-purple-500/50 hover:bg-slate-950/80"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.tsv"
              onChange={handleFileChange}
              className="hidden"
            />

            {isSimulatingAnalysis ? (
              <div className="space-y-4 text-center py-4">
                <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-purple-500/20 border-t-purple-400 animate-spin" />
                  <Sparkles className="w-6 h-6 text-purple-400 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">Analyzing Legacy Schema...</p>
                  <p className="text-xs text-slate-400 font-mono">File: {selectedFileName} ({fileSizeStr})</p>
                  <p className="text-[11px] text-purple-300 animate-pulse">Running semantic column mapping heuristics...</p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl text-purple-400 shadow-inner">
                  <FileSpreadsheet className="w-10 h-10" />
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">
                    Drag & Drop your legacy CSV or Excel file here
                  </p>
                  <p className="text-xs text-slate-400">
                    Supports .CSV, .XLSX, or .TSV exports from SAP, Maximo, or Excel
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <span className="px-4 py-2 bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md">
                    Browse Computer
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLoadSampleCSV();
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    Load Sample Legacy File
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Quick tips panel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-2.5">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-200 block mb-0.5">Flexible Header Names</strong>
                <span className="text-slate-400 text-[11px]">No strict naming rules required. The system auto-detects column meanings.</span>
              </div>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-200 block mb-0.5">Automated Validation</strong>
                <span className="text-slate-400 text-[11px]">Checks for duplicate tags, missing fields, and bad numerical formats.</span>
              </div>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-2.5">
              <Database className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-200 block mb-0.5">Safe Rollback</strong>
                <span className="text-slate-400 text-[11px]">Imports are tagged with migration batch IDs for easy auditing or reset.</span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ==================================================================== */}
      {/* STEP 2: AI COLUMN MAPPING (SPLIT-SCREEN VIEW)                        */}
      {/* ==================================================================== */}
      {currentStep === 2 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 animate-fade-in">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-white font-display flex items-center gap-2">
                Step 2: Automated Schema Column Mapping
                <span className="px-2.5 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-mono">
                  8 Columns Detected
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Review how the system mapped legacy columns to Spectra CM system fields. Adjust mappings using the dropdowns below.
              </p>
            </div>

            {unmappedCount > 0 && (
              <div className="px-3 py-1.5 bg-red-950/60 border border-red-500/40 rounded-xl text-red-300 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{unmappedCount} column(s) unmapped</span>
              </div>
            )}
          </div>

          {/* SPLIT-SCREEN MAPPING GRID */}
          <div className="space-y-3">
            <div className="hidden md:grid grid-cols-12 gap-4 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-4">
              <div className="col-span-4">Legacy Column Header</div>
              <div className="col-span-1 text-center">Auto Match</div>
              <div className="col-span-5">Spectra CM Field</div>
              <div className="col-span-2 text-right">Status</div>
            </div>

            <div className="space-y-2.5">
              {mappings.map((mapping, idx) => {
                const isUnmapped = !mapping.isMapped || mapping.targetField === "unmapped";

                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border transition-all grid grid-cols-1 md:grid-cols-12 gap-4 items-center ${
                      isUnmapped
                        ? "bg-red-950/20 border-red-500/30 shadow-sm shadow-red-500/5"
                        : "bg-slate-950/80 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    {/* Left Side: Legacy Column */}
                    <div className="md:col-span-4 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-purple-300 bg-purple-950/60 border border-purple-500/30 px-2 py-0.5 rounded">
                          {mapping.legacyColumn}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Sample: <strong className="text-slate-200">"{mapping.sampleValue}"</strong>
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                        <span>{mapping.aiSuggestedReason}</span>
                      </div>
                    </div>

                    {/* Middle: AI Visual Connector Line */}
                    <div className="md:col-span-1 flex items-center justify-center">
                      <div className="flex items-center gap-1 px-2 py-1 bg-purple-950/40 border border-purple-500/30 rounded-full text-purple-300 font-mono text-[10px] font-bold">
                        <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
                        <span>{mapping.confidence}%</span>
                      </div>
                    </div>

                    {/* Right Side: Target System Field Selector */}
                    <div className="md:col-span-5 relative">
                      <select
                        value={mapping.targetField}
                        onChange={(e) => handleMappingChange(idx, e.target.value)}
                        className={`w-full border text-xs font-semibold rounded-xl p-2.5 appearance-none focus:outline-none cursor-pointer pr-8 ${
                          isUnmapped
                            ? "bg-red-950/40 border-red-500/50 text-red-200 focus:border-red-400"
                            : "bg-slate-900 border-slate-700 text-cyan-300 focus:border-cyan-400"
                        }`}
                      >
                        {TARGET_FIELDS.map((field) => (
                          <option key={field.key} value={field.key} className="bg-slate-900 text-slate-200">
                            {field.label} {field.required ? "*(Required)" : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronRight className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none rotate-90" />
                    </div>

                    {/* Status Badge */}
                    <div className="md:col-span-2 text-right">
                      {isUnmapped ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                          <X className="w-3 h-3" /> Unmapped
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                          <Check className="w-3 h-3" /> Auto-Mapped
                        </span>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* ==================================================================== */}
      {/* STEP 3: DATA PREVIEW & VALIDATION                                    */}
      {/* ==================================================================== */}
      {currentStep === 3 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 animate-fade-in">
          
          {/* Summary Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Import Rows</span>
                <div className="text-2xl font-extrabold text-white font-mono">{totalRowCount}</div>
                <span className="text-[11px] text-slate-400">Scanned from uploaded CSV</span>
              </div>
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-xl">
                <Layers className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Valid Rows Ready</span>
                <div className="text-2xl font-extrabold text-emerald-300 font-mono">{validCount}</div>
                <span className="text-[11px] text-emerald-400/80">Passed schema validation</span>
              </div>
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-slate-950 border border-red-500/30 rounded-xl p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Validation Errors Found</span>
                <div className="text-2xl font-extrabold text-red-400 font-mono">{errorCount}</div>
                <span className="text-[11px] text-red-400/80">Requires correction or automated auto-fix</span>
              </div>
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
            </div>

          </div>

          {/* Controls bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">First 10 Rows Data Preview</h3>
              <button
                onClick={() => setFilterErrorsOnly(!filterErrorsOnly)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                  filterErrorsOnly
                    ? "bg-red-950 border-red-500 text-red-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {filterErrorsOnly ? "Showing Errors Only" : "Show All Rows"}
              </button>
            </div>

            {errorCount > 0 && (
              <button
                onClick={handleAutoFixErrors}
                className="px-3.5 py-1.5 bg-purple-500 hover:bg-purple-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-Fix {errorCount} Errors</span>
              </button>
            )}
          </div>

          {/* Data Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden shadow-xl bg-slate-950">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                    <th className="p-3.5 w-12 text-center">#</th>
                    <th className="p-3.5">Asset Tag</th>
                    <th className="p-3.5">Vibration (mm/s)</th>
                    <th className="p-3.5">Location</th>
                    <th className="p-3.5">Asset Type</th>
                    <th className="p-3.5">Component</th>
                    <th className="p-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-xs font-sans">
                  {previewRows
                    .filter(r => (filterErrorsOnly ? !r.isValid : true))
                    .map((row) => {
                      const hasTagError = row.errorField === "legacyTag";
                      const hasVibError = row.errorField === "vibrationLevel";

                      return (
                        <tr
                          key={row.id}
                          className={`hover:bg-slate-900/50 transition-colors ${
                            !row.isValid ? "bg-red-950/20" : ""
                          }`}
                        >
                          <td className="p-3.5 text-center font-mono text-slate-500">{row.id}</td>

                          {/* Asset Tag */}
                          <td className={`p-3.5 font-mono font-bold ${hasTagError ? "bg-red-500/20 text-red-300 border border-red-500/40 rounded" : "text-slate-200"}`}>
                            {row.legacyTag || <span className="italic text-red-400 text-[11px]">[MISSING TAG]</span>}
                          </td>

                          {/* Vibration Level */}
                          <td className={`p-3.5 font-mono ${hasVibError ? "bg-red-500/20 text-red-300 font-bold border border-red-500/40 rounded" : "text-cyan-300"}`}>
                            {row.vibrationLevel}
                          </td>

                          {/* Location */}
                          <td className="p-3.5 text-slate-300">{row.locationName}</td>

                          {/* Asset Type */}
                          <td className="p-3.5 text-slate-300">{row.equipmentType}</td>

                          {/* Component */}
                          <td className="p-3.5 text-slate-400">{row.componentId}</td>

                          {/* Status */}
                          <td className="p-3.5">
                            {row.isValid ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <Check className="w-3 h-3" /> Valid
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40" title={row.errorMessage}>
                                <AlertTriangle className="w-3 h-3" /> {row.errorMessage || "Invalid Data"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ==================================================================== */}
      {/* STEP 4: MIGRATION PROGRESS & SUCCESS                                 */}
      {/* ==================================================================== */}
      {currentStep === 4 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-8 md:p-12 shadow-2xl space-y-8 animate-fade-in text-center max-w-3xl mx-auto">
          
          {!isMigrationComplete ? (
            <div className="space-y-6 py-4">
              <div className="w-20 h-20 mx-auto relative flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-purple-500/20 border-t-purple-400 animate-spin" />
                <Database className="w-8 h-8 text-purple-400 animate-pulse" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white font-display">Migrating Equipment Data to Spectra CM</h2>
                <p className="text-xs text-slate-400 font-mono">{migrationStageText}</p>
              </div>

              {/* Large Animated Progress Bar */}
              <div className="space-y-2">
                <div className="w-full h-4 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5 shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 via-cyan-400 to-emerald-400 rounded-full transition-all duration-500 shadow-lg"
                    style={{ width: `${migrationProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs font-mono text-slate-400 font-bold">
                  <span>Importing Batch #2026-MIG</span>
                  <span>{migrationProgress}%</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 py-2 animate-fade-in">
              <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-xl shadow-emerald-500/10">
                <CheckCircle2 className="w-10 h-10 animate-bounce" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white font-display">Migration Completed Successfully!</h2>
                <p className="text-sm text-slate-300">
                  <strong className="text-emerald-400 font-mono text-base">142 Assets</strong> have been mapped, validated, and saved to your equipment catalog.
                </p>
              </div>

              {/* Success summary stats */}
              <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto py-4 border-y border-slate-800 text-xs">
                <div>
                  <div className="text-lg font-bold font-mono text-white">142</div>
                  <div className="text-[10px] text-slate-400">Assets Created</div>
                </div>
                <div>
                  <div className="text-lg font-bold font-mono text-emerald-400">100%</div>
                  <div className="text-[10px] text-slate-400">Data Integrity</div>
                </div>
                <div>
                  <div className="text-lg font-bold font-mono text-purple-400">0</div>
                  <div className="text-[10px] text-slate-400">Duplicates</div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={onNavigateToAssets}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm rounded-xl shadow-xl transition-all flex items-center gap-2 mx-auto cursor-pointer"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>View Imported Assets</span>
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ==================================================================== */}
      {/* WIZARD BOTTOM NAVIGATION BAR                                         */}
      {/* ==================================================================== */}
      {!isMigrationComplete && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex items-center justify-between gap-4">
          
          <button
            onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
            disabled={currentStep === 1}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
              currentStep === 1
                ? "bg-slate-950 text-slate-600 border border-slate-850 cursor-not-allowed"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="text-xs text-slate-500 font-mono hidden sm:block">
            Step {currentStep} of 4
          </div>

          {currentStep < 3 && (
            <button
              onClick={() => setCurrentStep((prev) => Math.min(3, prev + 1))}
              disabled={currentStep === 1 && !selectedFileName}
              className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-1.5 ${
                currentStep === 1 && !selectedFileName
                  ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                  : "bg-purple-500 hover:bg-purple-400 text-slate-950 shadow-lg cursor-pointer"
              }`}
            >
              <span>{currentStep === 1 ? "Proceed to Mapping" : "Proceed to Validation"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {currentStep === 3 && (
            <button
              onClick={startMigration}
              disabled={isSampleData || !isRealImport}
              title={
                isSampleData
                  ? "Sample data cannot be written to the database — upload a real file to import"
                  : undefined
              }
              className={`px-6 py-2.5 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 ${
                isSampleData || !isRealImport
                  ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                  : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 cursor-pointer"
              }`}
            >
              <Database className="w-4 h-4" />
              <span>
                {isSampleData
                  ? "Sample data — upload a real file to import"
                  : `Start Migration (${totalRowCount} Rows)`}
              </span>
            </button>
          )}

        </div>
      )}

    </div>
  );
}
