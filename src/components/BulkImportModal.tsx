import React, { useState, useRef, useMemo } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { 
  X, Upload, FileText, CheckCircle2, AlertCircle, ArrowRight, 
  Download, Loader2, Check, ChevronRight, AlertTriangle
} from "lucide-react";

// --- React Error Boundary Class Component ---
class BulkImportErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  props: { children: React.ReactNode };
  state: { hasError: boolean; error: Error | null };

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.props = props;
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("BulkImportErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Import Error</h3>
            <p className="text-xs text-slate-400">
              An unexpected crash occurred inside the Bulk Import module: {this.state.error?.message || "Unknown rendering error"}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => (this as any).setState({ hasError: false, error: null })}
                className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-slate-950 rounded-xl text-xs font-bold transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCompanyId: number;
  onImportComplete: () => void;
}

interface Mapping {
  plantName: string;
  routeName: string;
  assetTag: string;
  assetName: string;
  assetType: string;
  componentName: string;
}

function BulkImportModalInner({
  isOpen,
  onClose,
  selectedCompanyId,
  onImportComplete
}: BulkImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Column Mappings (Source Header -> DB Target Field)
  const [mappings, setMappings] = useState<Mapping>({
    plantName: "",
    routeName: "",
    assetTag: "",
    assetName: "",
    assetType: "",
    componentName: ""
  });

  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<"idle" | "importing" | "success" | "error">("idle");
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    success: number;
    skipped: number;
    warnings: string[];
  }>({ total: 0, success: 0, skipped: 0, warnings: [] });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Step 1: Download Excel Template (.xlsx) ---
  const downloadTemplateExcel = () => {
    try {
      console.log("Downloading Excel template...");
      const data = [
        ["Plant Name", "Route Name", "Asset Tag", "Asset Name", "Asset Type", "Component Name"],
        ["Faustina Facility", "Ammonia Compressors", "C-101", "Ammonia Compressor A", "Centrifugal Compressor", "Drive End Bearing"],
        ["Faustina Facility", "Ammonia Compressors", "C-101", "Ammonia Compressor A", "Centrifugal Compressor", "Non-Drive End Bearing"],
        ["Faustina Facility", "Cooling Water", "P-201", "Cooling Water Pump 1", "Centrifugal Pump", "Drive End Bearing"],
        ["Faustina Facility", "Cooling Water", "P-201", "Cooling Water Pump 1", "Centrifugal Pump", "Non-Drive End Bearing"],
        ["Faustina Facility", "Power Generation", "G-301", "Steam Turbine Generator", "Steam Turbine", "Thrust Bearing"],
      ];
      
      const ws = XLSX.utils.aoa_to_sheet(data);
      
      // Auto-fit column widths
      const maxColWidths = data[0].map((_, colIdx) => {
        return Math.max(...data.map(row => row[colIdx] ? row[colIdx].toString().length : 0)) + 3;
      });
      ws["!cols"] = maxColWidths.map(w => ({ wch: w }));

      // Add bold and light gray background to header row for Excel
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1:F6");
      for (let col = range.s.c; col <= range.e.c; ++col) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
        if (ws[cellRef]) {
          ws[cellRef].s = {
            font: { bold: true, color: { rgb: "000000" } },
            fill: { fgColor: { rgb: "EAEAEA" } }
          };
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Asset Template");
      XLSX.writeFile(wb, "MotorMedic_Pro_Asset_Template.xlsx");
      console.log("Excel template downloaded successfully.");
    } catch (err: any) {
      console.error("Failed to download Excel template:", err);
      setError("Failed to generate and download Excel template file.");
    }
  };

  // --- Step 1: Download CSV Template ---
  const downloadTemplateCSV = () => {
    try {
      const headers = ["Plant Name", "Route Name", "Asset Tag", "Asset Name", "Asset Type", "Component Name"];
      const rows = [
        ["Allied Refinery", "Boiler House", "PMP-101", "Feedwater Pump A", "Pump", "Drive End Bearing"],
        ["Allied Refinery", "Boiler House", "PMP-101", "Feedwater Pump A", "Pump", "Non-Drive End Bearing"],
        ["Allied Refinery", "Cooling Tower", "FAN-202", "Tower Fan Motor B", "Motor", ""],
        ["Allied Refinery", "Cooling Tower", "FAN-202", "Tower Fan Motor B", "Motor", "Gearbox Shaft"],
      ];
      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
        + [headers.join(","), ...rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "bulk_asset_import_template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error("Failed to download template:", err);
      setError("Failed to generate and download template file.");
    }
  };

  // --- Step 1: File Upload Handler ---
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
    if (isLoading) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLoading) return;
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    console.log("File selected:", file);
    if (!file) {
      setParseError("No file selected.");
      return;
    }
    if (!selectedCompanyId) {
      setParseError("No active company selected. Please select or create a company first.");
      return;
    }

    setFileName(file.name);
    setParseError(null);
    const ext = file.name.split(".").pop()?.toLowerCase();

    setIsLoading(true);

    try {
      if (ext === "csv") {
        console.log("Parsing CSV...");
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            setIsLoading(false);
            try {
              if (results && results.meta && results.meta.fields && Array.isArray(results.meta.fields) && results.meta.fields.length > 0) {
                setParsedHeaders(results.meta.fields);
                setParsedRows(Array.isArray(results.data) ? results.data : []);
                autoMapColumns(results.meta.fields);
                setStep(2);
              } else {
                setParseError("Failed to parse CSV file. Please check the format and try again.");
              }
            } catch (err: any) {
              console.error("CSV complete processing error:", err);
              setParseError("Failed to parse CSV file. Please check the format and try again.");
            }
          },
          error: (err) => {
            setIsLoading(false);
            console.error("CSV parse error:", err);
            setParseError("Failed to parse CSV file. Please check the format and try again.");
          }
        });
      } else if (ext === "xlsx" || ext === "xls") {
        console.log("Parsing XLSX/XLS file...");
        const reader = new FileReader();
        reader.onload = (e) => {
          setIsLoading(false);
          try {
            if (!e.target || !e.target.result) {
              throw new Error("No target or result in FileReader.");
            }
            const data = new Uint8Array(e.target.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: "array" });
            if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
              throw new Error("Invalid workbook format.");
            }
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json: any[] = XLSX.utils.sheet_to_json(worksheet);

            if (Array.isArray(json) && json.length > 0) {
              const headers = Object.keys(json[0]);
              setParsedHeaders(headers);
              setParsedRows(json);
              autoMapColumns(headers);
              setStep(2);
            } else {
              setParseError("The uploaded Excel sheet appears to be empty.");
            }
          } catch (error: any) {
            console.error("Excel parse error:", error);
            setParseError("Failed to parse CSV file. Please check the format and try again.");
          }
        };
        reader.onerror = (err) => {
          setIsLoading(false);
          console.error("FileReader error:", err);
          setParseError("Failed to parse CSV file. Please check the format and try again.");
        };
        reader.readAsArrayBuffer(file);
      } else {
        setIsLoading(false);
        setParseError("Unsupported file format. Please upload a .csv or .xlsx file.");
      }
    } catch (err: any) {
      setIsLoading(false);
      console.error("File processing crashed:", err);
      setParseError("Failed to parse CSV file. Please check the format and try again.");
    }
  };

  // --- Step 2: Auto Column Mapping ---
  const autoMapColumns = (headers: string[]) => {
    if (!Array.isArray(headers)) return;
    const map: Mapping = {
      plantName: "",
      routeName: "",
      assetTag: "",
      assetName: "",
      assetType: "",
      componentName: ""
    };

    headers.forEach(h => {
      const lh = h.toLowerCase().trim();
      if (lh.includes("plant") || lh.includes("facility")) map.plantName = h;
      else if (lh.includes("route") || lh.includes("area") || lh.includes("location")) map.routeName = h;
      else if (lh.includes("tag") || lh.includes("number") || lh.includes("code")) map.assetTag = h;
      else if (lh.includes("asset name") || lh.includes("asset_name") || (lh.includes("asset") && !lh.includes("type") && !lh.includes("tag"))) map.assetName = h;
      else if (lh.includes("type") || lh.includes("category")) map.assetType = h;
      else if (lh.includes("component") || lh.includes("part") || lh.includes("sub-assembly")) map.componentName = h;
    });

    // Fallbacks if not auto-mapped
    if (!map.assetName) {
      const nameHeader = headers.find(h => h.toLowerCase().includes("name"));
      if (nameHeader) map.assetName = nameHeader;
    }

    setMappings(map);
  };

  // --- Step 3: Map Data to Preview ---
  const mappedPreviewData = useMemo(() => {
    if (!Array.isArray(parsedRows)) return [];
    if (!mappings) return [];
    return parsedRows.slice(0, 5).map(row => {
      if (!row) return { plantName: "", routeName: "", assetTag: "", assetName: "", assetType: "", componentName: "" };
      return {
        plantName: row[mappings.plantName] || "",
        routeName: row[mappings.routeName] || "",
        assetTag: row[mappings.assetTag] || "",
        assetName: row[mappings.assetName] || "",
        assetType: row[mappings.assetType] || "",
        componentName: row[mappings.componentName] || ""
      };
    });
  }, [parsedRows, mappings]);

  // --- Step 4: Import Processing ---
  const handleImportSubmit = async () => {
    if (isLoading) return;
    
    // Safety checks
    if (!selectedCompanyId) {
      setError("Please select or configure a company ID before importing.");
      return;
    }
    if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
      setError("Import aborted: Parsed data rows are empty or invalid.");
      return;
    }
    if (!mappings || !mappings.plantName || !mappings.routeName || !mappings.assetName || !mappings.assetType) {
      setError("Import aborted: Column mapping configurations are missing or incomplete.");
      return;
    }

    setIsLoading(true);
    setStep(4);
    setImportStatus("importing");
    setImportProgress(10);
    setImportLogs(["Initializing secure connection to the central asset registry...", "Validating column schemas..."]);

    const allMappedRows = parsedRows.map(row => {
      if (!row) return null;
      return {
        plantName: (row[mappings.plantName] || "").toString().trim(),
        routeName: (row[mappings.routeName] || "").toString().trim(),
        assetTag: (row[mappings.assetTag] || "").toString().trim(),
        assetName: (row[mappings.assetName] || "").toString().trim(),
        assetType: (row[mappings.assetType] || "").toString().trim(),
        componentName: (row[mappings.componentName] || "").toString().trim()
      };
    }).filter(Boolean);

    try {
      setImportProgress(30);
      setImportLogs(prev => [...prev, `Mapped ${allMappedRows.length} rows. Uploading telemetry payload to database...`]);

      console.log("Sending to backend...");
      const res = await fetch("/api/assets/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          assets: allMappedRows
        })
      });

      console.log("Success/Error:", res);
      setImportProgress(75);

      if (res.ok) {
        const result = await res.json();
        setImportProgress(100);
        setImportStatus("success");
        setImportSummary({
          total: result.total || allMappedRows.length,
          success: result.success || 0,
          skipped: result.skipped || 0,
          warnings: result.warnings || []
        });
        setImportLogs(prev => [
          ...prev, 
          `Upload complete! Processed ${result.total} records.`,
          `Successfully registered ${result.success} hierarchy connections.`,
          result.skipped > 0 ? `⚠️ Skipped ${result.skipped} invalid rows due to missing fields.` : "No rows skipped."
        ]);
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Bulk import transaction failed on the host server.");
      }
    } catch (err: any) {
      console.error("Bulk Import error:", err);
      setImportStatus("error");
      setImportProgress(100);
      setImportLogs(prev => [...prev, `❌ Error: ${err.message || "Unknown database rejection error."}`]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMappingChange = (field: keyof Mapping, value: string) => {
    setMappings(prev => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
  };

  const resetModalState = () => {
    setStep(1);
    setFileName("");
    setParsedHeaders([]);
    setParsedRows([]);
    setParseError(null);
    setError(null);
    setImportProgress(0);
    setImportStatus("idle");
    setImportLogs([]);
    setIsLoading(false);
    setImportSummary({ total: 0, success: 0, skipped: 0, warnings: [] });
  };

  const handleFinish = () => {
    onImportComplete();
    resetModalState();
    onClose();
  };

  if (!isOpen) return null;

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <div className="p-6 bg-red-900 border border-red-750 text-white rounded-2xl max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 bg-red-500/10 text-red-100 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold">Import Error</h3>
          <p className="text-sm text-red-200">{error}</p>
          <div className="flex justify-center gap-3 pt-2">
            <button 
              onClick={() => {
                setError(null);
                resetModalState();
              }}
              className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              Try Again
            </button>
            <button 
              onClick={() => {
                setError(null);
                resetModalState();
                onClose();
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-all duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl flex flex-col max-h-[85vh] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-400/10 text-yellow-400 rounded-xl border border-yellow-400/20">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Bulk Asset Hierarchy Import</h3>
              <p className="text-xs text-slate-400">Import plants, routes, assets, and components from a CSV or Excel spreadsheet</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadTemplateExcel}
              disabled={isLoading}
              className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-md disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Excel Template</span>
            </button>
            <button 
              onClick={() => { resetModalState(); onClose(); }}
              disabled={isLoading}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors focus:outline-none disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          
          {/* Progress Indicators */}
          <div className="flex items-center justify-between text-xs px-2 print:hidden">
            {[
              { num: 1, label: "Upload" },
              { num: 2, label: "Column Mapping" },
              { num: 3, label: "Data Preview" },
              { num: 4, label: "Import Registry" }
            ].map((s) => (
              <div key={s.num} className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold border transition-all ${
                  step === s.num 
                    ? "bg-yellow-400 border-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/10" 
                    : step > s.num
                      ? "bg-emerald-400/10 border-emerald-500/30 text-emerald-400"
                      : "bg-slate-950 border-slate-850 text-slate-500"
                }`}>
                  {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
                </span>
                <span className={`font-semibold ${step === s.num ? "text-yellow-400" : "text-slate-400"}`}>
                  {s.label}
                </span>
                {s.num < 4 && <ChevronRight className="w-3.5 h-3.5 text-slate-700" />}
              </div>
            ))}
          </div>

          {/* STEP 1: UPLOAD FILE */}
          {step === 1 && (
            <div className="space-y-4">
              {parseError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl p-4 flex items-start gap-3" id="bulk-import-parse-error">
                  <AlertCircle className="w-5 h-5 text-red-450 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-red-400">File Processing Issue</h4>
                    <p className="text-[10px] leading-relaxed text-red-300">{parseError}</p>
                  </div>
                </div>
              )}

              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => { if (!isLoading) fileInputRef.current?.click(); }}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  dragActive 
                    ? "border-yellow-400 bg-yellow-400/5 shadow-inner" 
                    : "border-slate-800 bg-slate-950 hover:border-slate-700 hover:bg-slate-950/60"
                } ${isLoading ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv, .xlsx, .xls"
                  disabled={isLoading}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 bg-slate-900 rounded-full border border-slate-800 text-slate-400 group-hover:text-white transition-colors">
                    {isLoading ? (
                      <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
                    ) : (
                      <Upload className="w-8 h-8 text-yellow-400" />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-semibold text-sm text-slate-200">
                      {isLoading ? (
                        "Parsing and validating file..."
                      ) : (
                        <>Drag & drop your asset data file here, or <span className="text-yellow-400">browse local files</span></>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 font-medium">Supports CSV and Microsoft Excel (.xlsx, .xls) files</p>
                  </div>
                </div>
              </div>

              {/* Template Download Option */}
              <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400">
                    <FileText className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">Need an example template file?</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">Download our pre-structured Excel template with sample data or basic CSV template.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={downloadTemplateExcel}
                    disabled={isLoading}
                    className="px-3.5 py-1.5 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md focus:outline-none"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Excel Template (.xlsx)</span>
                  </button>
                  <button
                    onClick={downloadTemplateCSV}
                    disabled={isLoading}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 hover:text-white font-bold rounded-xl text-xs flex items-center gap-1.5 border border-slate-800 transition-all shadow-md focus:outline-none"
                  >
                    <Download className="w-3.5 h-3.5 text-yellow-400" />
                    <span>CSV Template</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-yellow-400">Critical: Verify Column Mappings</h4>
                  <p className="text-[10px] text-slate-300 leading-relaxed">
                    Map each database field to the corresponding column header in your spreadsheet. Any fields not matched can be selected manually. Missing non-essential fields (like Tag, Component Name) will utilize system defaults.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { field: "plantName", label: "Plant Name", req: true, desc: "e.g., Allied Refinery, Texas Refinery" },
                  { field: "routeName", label: "Route Area Name", req: true, desc: "e.g., Boiler House, Water Treatment" },
                  { field: "assetTag", label: "Asset Tag", req: false, desc: "e.g., PMP-101, FAN-202" },
                  { field: "assetName", label: "Asset Name", req: true, desc: "e.g., Feedwater Pump A, Exhaust Fan 3" },
                  { field: "assetType", label: "Asset Type", req: true, desc: "e.g., Pump, Motor, Gearbox, Fan" },
                  { field: "componentName", label: "Component Name", req: false, desc: "e.g., Drive End Bearing, NDE Rotor" }
                ].map((item) => (
                  <div key={item.field} className="bg-slate-950 p-4 border border-slate-850 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">
                        {item.label} {item.req && <span className="text-red-500 font-mono">*</span>}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">{item.desc}</span>
                    </div>
                    <select
                      value={mappings[item.field as keyof Mapping] || ""}
                      onChange={(e) => handleMappingChange(item.field as keyof Mapping, e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400/50"
                    >
                      <option value="">-- Click to choose column --</option>
                      {parsedHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!mappings.plantName || !mappings.routeName || !mappings.assetName || !mappings.assetType}
                  className="px-5 py-2 bg-yellow-400 text-slate-950 hover:bg-yellow-300 disabled:bg-slate-800 disabled:text-slate-500 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-lg"
                >
                  <span>Preview Data Mapping</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW DATA */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-slate-950 border border-slate-850 rounded-2xl overflow-hidden shadow-lg">
                <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Preview Mapped Records (First 5 Rows)</span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono font-bold">
                    {parsedRows.length} Rows Parsed
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900/60 text-slate-400 font-bold border-b border-slate-850">
                        <th className="p-3">Plant Name</th>
                        <th className="p-3">Route Area</th>
                        <th className="p-3">Tag</th>
                        <th className="p-3">Asset Name</th>
                        <th className="p-3">Asset Type</th>
                        <th className="p-3">Component Name</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {mappedPreviewData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/30">
                          <td className="p-3 font-medium text-slate-200">{row.plantName || <span className="text-red-500 font-mono">Missing</span>}</td>
                          <td className="p-3 text-slate-300">{row.routeName || <span className="text-red-500 font-mono">Missing</span>}</td>
                          <td className="p-3 text-slate-400 font-mono text-[11px]">{row.assetTag || "N/A"}</td>
                          <td className="p-3 font-semibold text-slate-200">{row.assetName || <span className="text-red-500 font-mono">Missing</span>}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded-full font-bold text-[9px] uppercase text-slate-400">
                              {row.assetType || <span className="text-red-500 font-mono">Missing</span>}
                            </span>
                          </td>
                          <td className="p-3 text-slate-400 italic">
                            {row.componentName || "Auto-Generate Defaults"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-slate-950 p-4 border border-slate-850 rounded-2xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-300">Hierarchy Assembly Rules</h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    If an asset row does not have a mapped component name, the system will evaluate the Asset Type. For motors, pumps, fans, and gearboxes, it will automatically instantiate drive-end and non-drive-end components so you can immediately load sensor telemetries.
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                <button
                  onClick={() => setStep(2)}
                  disabled={isLoading}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleImportSubmit}
                  disabled={isLoading}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>{isLoading ? "Executing Bulk Import..." : "Execute Bulk Import"}</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: PROGRESS & LOGS */}
          {step === 4 && (
            <div className="space-y-6">
              
              {/* Progress Bar Container */}
              <div className="space-y-2 bg-slate-950 p-6 border border-slate-850 rounded-2xl">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">
                    {importStatus === "importing" && "Analyzing file structure and writing records..."}
                    {importStatus === "success" && "Database transaction completed successfully!"}
                    {importStatus === "error" && "Database rejected upload."}
                  </span>
                  <span className="font-mono text-slate-400 font-bold">{importProgress}%</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      importStatus === "error" 
                        ? "bg-red-500 shadow-lg shadow-red-500/20" 
                        : importStatus === "success"
                          ? "bg-emerald-400 shadow-lg shadow-emerald-400/20"
                          : "bg-yellow-400 shadow-lg shadow-yellow-400/20"
                    }`}
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
              </div>

              {/* Import Summary Results */}
              {importStatus === "success" && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl text-center">
                    <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Total Evaluated</span>
                    <span className="text-xl font-bold font-mono text-slate-200 mt-1 block">{importSummary.total}</span>
                  </div>
                  <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl text-center">
                    <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider text-emerald-400">Successfully Imported</span>
                    <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">{importSummary.success}</span>
                  </div>
                  <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl text-center">
                    <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider text-yellow-500">Rows Skipped</span>
                    <span className="text-xl font-bold font-mono text-yellow-500 mt-1 block">{importSummary.skipped}</span>
                  </div>
                </div>
              )}

              {/* Warnings Box if any skipped */}
              {importStatus === "success" && importSummary.warnings.length > 0 && (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <h5 className="text-xs font-bold text-yellow-500">Warnings Detected During Validation</h5>
                  </div>
                  <div className="max-h-24 overflow-y-auto text-[10px] font-mono text-slate-400 space-y-1">
                    {importSummary.warnings.map((w, idx) => (
                      <div key={idx}>• {w}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Console Logs Terminal */}
              <div className="bg-black/80 rounded-2xl border border-slate-850 p-4 font-mono text-[10px] text-slate-400 space-y-1.5 max-h-56 overflow-y-auto shadow-inner">
                <div className="flex items-center gap-1.5 text-slate-500 border-b border-slate-900 pb-2 mb-2 font-bold uppercase tracking-wider text-[9px]">
                  <span>Import Log Output Terminal</span>
                </div>
                {importLogs.map((log, idx) => (
                  <div key={idx} className={`${
                    log.includes("❌") || log.includes("Error") 
                      ? "text-red-400 font-bold" 
                      : log.includes("Successfully") || log.includes("complete")
                        ? "text-emerald-400 font-bold"
                        : log.includes("⚠️")
                          ? "text-yellow-500"
                          : "text-slate-400"
                  }`}>
                    {log}
                  </div>
                ))}
              </div>

              {/* Footer Controls */}
              <div className="flex justify-end pt-4 border-t border-slate-800">
                {importStatus === "importing" ? (
                  <button
                    disabled
                    className="px-5 py-2.5 bg-slate-800 text-slate-500 font-bold rounded-xl text-xs flex items-center gap-2"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Database Ledger...</span>
                  </button>
                ) : (
                  <button
                    onClick={handleFinish}
                    className="px-6 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-lg"
                  >
                    <span>Close & Refresh Assets</span>
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}

// --- Wrapped BulkImportModal with Error Boundary ---
export default function BulkImportModal(props: BulkImportModalProps) {
  return (
    <BulkImportErrorBoundary>
      <BulkImportModalInner {...props} />
    </BulkImportErrorBoundary>
  );
}
