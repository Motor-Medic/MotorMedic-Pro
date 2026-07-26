import React, { useState, useRef } from "react";
import { 
  Upload, Plus, Trash2, Loader2, Sparkles, CheckCircle2, AlertTriangle, FileImage
} from "lucide-react";

interface ExtractedAsset {
  location: string;
  route: string;
  asset_name: string;
  asset_type: string;
  component_name: string;
}

interface AIDataMigrationProps {
  selectedCompanyId: number;
}

export default function AIDataMigration({ selectedCompanyId }: AIDataMigrationProps) {
  const [dragActive, setDragActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [data, setData] = useState<ExtractedAsset[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setError(null);
    setSuccess(null);
    
    // Check if it's an image
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, JPEG) showing your equipment list.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (!event.target?.result) {
        setError("Failed to read file.");
        return;
      }

      setAnalyzing(true);
      try {
        const base64String = event.target.result as string;
        const res = await fetch("/api/ai-extract-csv", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ image: base64String }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "AI Extraction failed.");
        }

        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
          setData(result.data);
          if (result.data.length === 0) {
            setError("AI finished analyzing, but no asset rows were found. Try adding some manually.");
          }
        } else {
          throw new Error("Invalid response format from AI extraction service.");
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Something went wrong while communicating with Gemini API.");
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCellChange = (index: number, field: keyof ExtractedAsset, value: string) => {
    const updated = [...data];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setData(updated);
  };

  const addRow = () => {
    setData([
      ...data,
      {
        location: "Plant A",
        route: "Route 1",
        asset_name: "New Pump",
        asset_type: "Pump",
        component_name: "Motor"
      }
    ]);
  };

  const deleteRow = (index: number) => {
    const updated = data.filter((_, idx) => idx !== index);
    setData(updated);
  };

  const handleImport = async () => {
    setError(null);
    setSuccess(null);

    if (data.length === 0) {
      setError("No data to import. Please upload a file first or add rows manually.");
      return;
    }

    // Basic frontend verification
    const invalidRowIdx = data.findIndex(
      row => !row.location?.trim() || !row.route?.trim() || !row.asset_name?.trim() || !row.asset_type?.trim()
    );

    if (invalidRowIdx !== -1) {
      setError(`Row #${invalidRowIdx + 1} has missing fields. Location, Route, Asset Name, and Asset Type are required.`);
      return;
    }

    try {
      // Map to assets format expected by bulk-import endpoint:
      // { plantName, routeName, assetTag, assetName, assetType, componentName }
      const formattedAssets = data.map(row => ({
        plantName: row.location.trim(),
        routeName: row.route.trim(),
        assetTag: "",
        assetName: row.asset_name.trim(),
        assetType: row.asset_type.trim(),
        componentName: row.component_name?.trim() || ""
      }));

      const res = await fetch("/api/assets/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          assets: formattedAssets
        })
      });

      if (!res.ok) {
        let errorMsg = "Failed to complete bulk import.";
        try {
          const errData = await res.json();
          errorMsg = errData.error || errData.message || errorMsg;
        } catch (e) {
          errorMsg = `Server returned status ${res.status}: ${res.statusText || "Internal Server Error"}`;
        }
        throw new Error(errorMsg);
      }

      const result = await res.json().catch(() => ({}));
      setSuccess(`Successfully imported ${formattedAssets.length} assets!`);
      setData([]); // Reset table on success
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to import assets.");
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 animate-fade-in" id="ai-migration-page">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Import Legacy Data via AI</h1>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Upload a screenshot or photo of your existing equipment list. Our AI will automatically extract the plant, routes, assets, and components structure for validation and import.
          </p>
        </div>
      </div>

      {/* Upload zone */}
      {data.length === 0 && !analyzing && (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-4 shadow-inner ${
            dragActive 
              ? "border-emerald-500 bg-emerald-500/5 shadow-emerald-500/5 scale-[0.99]" 
              : "border-slate-800 bg-slate-900/10 hover:border-slate-700 hover:bg-slate-900/20"
          }`}
          id="migration-dropzone"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-full text-emerald-400">
            <Upload className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">Drag & drop your equipment list image here</p>
            <p className="text-xs text-slate-400">or click to browse your computer (PNG, JPG, JPEG)</p>
          </div>
          <p className="text-[10px] text-slate-500 font-mono">
            Pro Tip: You can take a screenshot of a spreadsheet, list, or legacy PDF report and drop it directly!
          </p>
        </div>
      )}

      {/* Loading state */}
      {analyzing && (
        <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-16 text-center flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">AI is analyzing your document...</p>
            <p className="text-xs text-slate-400">Extracting location hierarchy, equipment names, types, and component relationships.</p>
          </div>
        </div>
      )}

      {/* Alert panels */}
      {error && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-xs text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl text-xs text-emerald-300 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{success}</div>
        </div>
      )}

      {/* Review table section */}
      {data.length > 0 && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Verify Extracted Assets Hierarchy</h2>
              <p className="text-xs text-slate-400">Review the AI extraction below. Double check fields, edit mistakes, add or delete rows before finalizing.</p>
            </div>
            <button
              onClick={addRow}
              className="px-3.5 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Row
            </button>
          </div>

          <div className="border border-slate-800/80 rounded-xl overflow-hidden shadow-xl bg-[#0b1220]/60 backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3">Location / Plant</th>
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Asset Name</th>
                    <th className="px-4 py-3">Asset Type</th>
                    <th className="px-4 py-3">Component Name</th>
                    <th className="px-4 py-3 w-16 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/20 transition-colors">
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.location}
                          onChange={(e) => handleCellChange(idx, "location", e.target.value)}
                          className="w-full bg-slate-950/40 border border-transparent hover:border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.route}
                          onChange={(e) => handleCellChange(idx, "route", e.target.value)}
                          className="w-full bg-slate-950/40 border border-transparent hover:border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.asset_name}
                          onChange={(e) => handleCellChange(idx, "asset_name", e.target.value)}
                          className="w-full bg-slate-950/40 border border-transparent hover:border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-semibold"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.asset_type}
                          onChange={(e) => handleCellChange(idx, "asset_type", e.target.value)}
                          className="w-full bg-slate-950/40 border border-transparent hover:border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.component_name}
                          onChange={(e) => handleCellChange(idx, "component_name", e.target.value)}
                          className="w-full bg-slate-950/40 border border-transparent hover:border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => deleteRow(idx)}
                          className="p-1.5 hover:text-red-400 hover:bg-slate-900 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions Row */}
            <div className="p-4 bg-slate-900/30 border-t border-slate-800 flex justify-between items-center">
              <button
                onClick={() => setData([])}
                className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white rounded-lg text-xs font-semibold cursor-pointer border border-slate-850"
              >
                Clear All
              </button>
              <button
                onClick={handleImport}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/15 cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm & Import ({data.length} Assets)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
