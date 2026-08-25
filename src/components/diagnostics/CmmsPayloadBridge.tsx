/**
 * Dynamic multi-system CMMS bridge.
 *
 * Renders the live diagnosis as pre-formatted work order fields in the selected
 * system's own vocabulary. Switching systems re-keys every field, relabels it
 * and re-maps the priority code; the underlying values never change.
 *
 * Includes "Other (Custom CMMS...)" workflow:
 *   - Text input for CMMS Software Name
 *   - Screenshot upload + AI parsing via existing OpenRouter vision provider
 *   - Fuzzy template search (debounced 300ms)
 *   - Human review preview of mapped fields before saving
 *   - Secure template persistence (no screenshot storage)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clipboard, Copy, FileText, Image, Loader2, Save, Search, Trash2, Upload, X } from "lucide-react";
import {
  buildCmmsFieldList,
  buildCustomCmmsFields,
  CMMS_TARGETS,
  type CmmsPayloadContext,
  type CmmsTargetId,
  type CustomCmmsFieldSchema,
  type CustomCmmsTemplate
} from "../../lib/diagnostics/cmmsPayload";

export interface CmmsPayloadBridgeProps {
  context: CmmsPayloadContext;
  sectionId?: string;
  onToast?: (
    message: string,
    type?: "success" | "info" | "warning" | "error"
  ) => void;
}

interface ParsedCmmsTemplate {
  fieldSchema: CustomCmmsFieldSchema;
  rawResponse: string;
}

interface TemplateSearchResult {
  templates: CustomCmmsTemplate[];
  loading: boolean;
  error: string | null;
}

export default function CmmsPayloadBridge({
  context,
  sectionId = "cmms-data-bridge",
  onToast
}: CmmsPayloadBridgeProps) {
  const [target, setTarget] = useState<CmmsTargetId>("sap");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Custom CMMS state
  const [customName, setCustomName] = useState("");
  const [customTemplate, setCustomTemplate] = useState<CustomCmmsFieldSchema | null>(null);
  const [customTemplateId, setCustomTemplateId] = useState<string | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewFields, setPreviewFields] = useState<ParsedCmmsTemplate | null>(null);
  const [editingPreview, setEditingPreview] = useState(false);
  const [editedFields, setEditedFields] = useState<CustomCmmsFieldSchema["fields"]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomCmmsTemplate[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<CustomCmmsTemplate | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Build fields for standard targets
  const cmmsFields = useMemo(
    () => {
      if (target === "custom") {
        return buildCustomCmmsFields(context, customTemplate ?? undefined);
      }
      return buildCmmsFieldList(target, context);
    },
    [target, context, customTemplate]
  );

  const fullPayloadText = cmmsFields
    .map((f) => `${f.key}: ${f.value}`)
    .join("\n");

  const copy = useCallback((value: string, id: string, label: string) => {
    void navigator.clipboard.writeText(value).then(
      () => {
        setCopiedKey(id);
        onToast?.(`${label} copied to clipboard`, "success");
        window.setTimeout(
          () => setCopiedKey((k) => (k === id ? null : k)),
          2000
        );
      },
      () => onToast?.("Clipboard unavailable in this browser", "error")
    );
  }, [onToast]);

  // Debounced template search
  const searchTemplates = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/cmms/templates?query=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data.templates || []);
    } catch (err) {
      onToast?.("Failed to search templates", "error");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchTemplates(searchQuery);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, searchTemplates]);

  const handleSearchSelect = useCallback((template: CustomCmmsTemplate) => {
    setSelectedTemplate(template);
    setCustomTemplate(template.field_schema);
    setCustomTemplateId(template.id);
    setCustomName(template.program_name);
    setSearchQuery(template.program_name);
    setSearchResults([]);
    onToast?.(`Loaded saved template: ${template.program_name}`, "success");
  }, [onToast]);

  const handleScreenshotUpload = useCallback((file: File) => {
    const validTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      onToast?.("Please upload PNG, JPG, or WebP image", "warning");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onToast?.("Image must be under 10MB", "warning");
      return;
    }
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
    setParseError(null);
    setShowPreview(false);
    setPreviewFields(null);
    setEditingPreview(false);
  }, [onToast]);

  const handleRemoveScreenshot = useCallback(() => {
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setParseError(null);
    setShowPreview(false);
    setPreviewFields(null);
    setEditingPreview(false);
  }, []);

  const parseScreenshot = useCallback(async () => {
    if (!screenshotFile) return;
    setParsing(true);
    setParseError(null);
    try {
      const base64 = await fileToBase64(screenshotFile);
      const res = await fetch("/api/cmms/parse-screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          context: {
            assetTag: context.assetTag,
            component: context.component,
            faultTitle: context.faultTitle,
            severity: context.severity,
            confidencePercent: context.confidencePercent,
            healthScore: context.healthScore,
            recommendations: context.recommendations
          }
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Parse failed");
      }
      const data = await res.json();
      const parsed: ParsedCmmsTemplate = {
        fieldSchema: data.fieldSchema,
        rawResponse: data.rawResponse
      };
      setPreviewFields(parsed);
      setEditedFields(parsed.fieldSchema.fields.map(f => ({ ...f })));
      setShowPreview(true);
      setEditingPreview(true);
      onToast?.("Screenshot parsed — review and edit field mappings below", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to parse screenshot";
      setParseError(msg);
      onToast?.(msg, "error");
    } finally {
      setParsing(false);
    }
  }, [screenshotFile, context, onToast]);

  const handleFieldEdit = useCallback((index: number, field: Partial<CustomCmmsFieldSchema["fields"][0]>) => {
    setEditedFields(prev => prev.map((f, i) => i === index ? { ...f, ...field } : f));
  }, []);

  const handleAddField = useCallback(() => {
    setEditedFields(prev => [...prev, {
      key: `CUSTOM_FIELD_${prev.length + 1}`,
      label: `Custom Field ${prev.length + 1}`,
      sourcePath: "",
      multiline: false
    }]);
  }, []);

  const handleRemoveField = useCallback((index: number) => {
    setEditedFields(prev => prev.filter((_, i) => i !== index));
  }, []);

  const saveTemplate = useCallback(async () => {
    if (!customName.trim()) {
      onToast?.("Enter a CMMS software name", "warning");
      return;
    }
    if (!editedFields.length) {
      onToast?.("Add at least one field mapping", "warning");
      return;
    }
    setSavingTemplate(true);
    setSaveError(null);
    try {
      const schema: CustomCmmsFieldSchema = {
        fields: editedFields,
        priorityMapping: {
          CRITICAL: "High",
          ANOMALY: "Medium",
          NORMAL: "Low"
        },
        workTypeMapping: {
          CRITICAL: "Corrective",
          ANOMALY: "Corrective",
          NORMAL: "Preventive"
        }
      };
      const res = await fetch("/api/cmms/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program_name: customName.trim(),
          field_schema: schema
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Save failed");
      }
      const saved = await res.json();
      setCustomTemplate(schema);
      setCustomTemplateId(saved.id);
      setEditingPreview(false);
      setShowPreview(true);
      onToast?.(`Template saved as "${customName}"`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save template";
      setSaveError(msg);
      onToast?.(msg, "error");
    } finally {
      setSavingTemplate(false);
    }
  }, [customName, editedFields, onToast]);

  const handleTargetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTarget = e.target.value as CmmsTargetId;
    setTarget(newTarget);
    if (newTarget !== "custom") {
      setCustomTemplate(null);
      setCustomTemplateId(null);
      setCustomName("");
      setScreenshotFile(null);
      setScreenshotPreview(null);
      setParseError(null);
      setShowPreview(false);
      setPreviewFields(null);
      setEditingPreview(false);
      setEditedFields([]);
      setSearchResults([]);
      setSearchQuery("");
      setSelectedTemplate(null);
    }
  }, []);

  return (
    <section
      id={sectionId}
      className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6"
    >
      <div className="mb-5">
        <h3 className="text-lg font-bold text-white">CMMS Work Order Bridge</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Live diagnosis pre-formatted for your system&apos;s fields and
          priority codes
        </p>
      </div>

      <div className="space-y-5">
        {/* STEP 1: System Selection */}
        <div>
          <label
            htmlFor={`${sectionId}-system`}
            className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block"
          >
            Step 1: Choose Your System
          </label>
          <select
            id={`${sectionId}-system`}
            value={target}
            onChange={handleTargetChange}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 outline-none"
          >
            {CMMS_TARGETS.map((sys) => (
              <option key={sys.id} value={sys.id}>
                {sys.label}
              </option>
            ))}
          </select>
        </div>

        {/* CUSTOM CMMS SUB-PANEL */}
        {target === "custom" && (
          <div className="space-y-4 border border-slate-700/50 rounded-xl p-4 bg-slate-950/30">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Custom CMMS Configuration
              </span>
              {selectedTemplate && (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Template loaded: {selectedTemplate.program_name}
                </span>
              )}
            </div>

            {/* CMMS Name Input + Fuzzy Search */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                CMMS Software Name
                {searchLoading && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type to search saved templates..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-10 py-2 text-sm text-white outline-none focus:border-yellow-500"
                />
                {searchResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-slate-950 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {searchResults.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => handleSearchSelect(tmpl)}
                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-800 flex items-center gap-2"
                      >
                        <FileText className="h-4 w-4 text-slate-400" />
                        <span className="truncate">{tmpl.program_name}</span>
                        <span className="text-[10px] text-slate-500 ml-auto">
                          {new Date(tmpl.created_at).toLocaleDateString()}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Or enter a new CMMS name..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
              />
            </div>

            {/* Screenshot Upload */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Upload Screenshot of Work Order Screen
              </label>
              {screenshotPreview ? (
                <div className="relative group">
                  <div className="aspect-video bg-slate-900 rounded-lg border border-slate-700 overflow-hidden relative">
                    <img
                      src={screenshotPreview}
                      alt="CMMS work order screenshot"
                      className="w-full h-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveScreenshot}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-slate-950/90 rounded hover:bg-red-500/20 text-slate-400"
                      aria-label="Remove screenshot"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={parseScreenshot}
                      disabled={parsing}
                      className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-slate-900 font-bold py-2 rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      {parsing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Image className="h-4 w-4" />
                          Analyze & Map Custom Fields
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveScreenshot}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 cursor-pointer transition-colors"
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-yellow-500 transition-colors cursor-pointer bg-slate-900/50"
                  onClick={() => document.getElementById(`${sectionId}-screenshot-input`)?.click()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) handleScreenshotUpload(file);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <input
                    id={`${sectionId}-screenshot-input`}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleScreenshotUpload(file);
                    }}
                  />
                  <Upload className="h-10 w-10 mx-auto text-slate-500 mb-2" />
                  <p className="text-sm text-slate-300">
                    Drag & drop or click to upload PNG/JPG/WebP
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Max 10MB</p>
                </div>
              )}
              {parseError && (
                <p className="text-sm text-red-400 flex items-center gap-1">
                  <Image className="h-4 w-4" />
                  {parseError}
                </p>
              )}
            </div>

            {/* Human Review Preview */}
            {showPreview && previewFields && (
              <div className="space-y-3 border-t border-slate-700/50 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Step 2: Review & Edit Field Mappings
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingPreview(!editingPreview)}
                    className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    {editingPreview ? (
                      <>
                        <Check className="h-3 w-3" />
                        Done Editing
                      </>
                    ) : (
                      <>
                        <Image className="h-3 w-3" />
                        Edit Mappings
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-2 max-h-96 overflow-auto">
                  {editedFields.map((field, index) => (
                    <div
                      key={index}
                      className={`flex gap-2 items-start p-3 bg-slate-950 rounded-lg border ${
                        editingPreview ? "border-slate-600" : "border-slate-700"
                      }`}
                    >
                      {editingPreview ? (
                        <>
                          <input
                            type="text"
                            value={field.key}
                            onChange={(e) => handleFieldEdit(index, { key: e.target.value })}
                            placeholder="Field Key (e.g., WO_NUMBER)"
                            className="w-32 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white outline-none focus:border-yellow-500 font-mono"
                          />
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => handleFieldEdit(index, { label: e.target.value })}
                            placeholder="Display Label"
                            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white outline-none focus:border-yellow-500"
                          />
                          <input
                            type="text"
                            value={field.sourcePath}
                            onChange={(e) => handleFieldEdit(index, { sourcePath: e.target.value })}
                            placeholder="Source Path (e.g., faultTitle)"
                            className="w-40 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white outline-none focus:border-yellow-500 font-mono text-slate-300"
                            title="Dot-notation path into diagnosis context"
                          />
                          <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={field.multiline ?? false}
                              onChange={(e) => handleFieldEdit(index, { multiline: e.target.checked })}
                              className="rounded border-slate-600 text-cyan-500 focus:ring-cyan-500"
                            />
                            Multi
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveField(index)}
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                            title="Remove field"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="w-32 font-mono text-[10px] text-slate-400 truncate">{field.key}</span>
                          <span className="flex-1 text-sm text-white truncate">{field.label}</span>
                          <span className="w-40 font-mono text-[10px] text-slate-500 truncate">{field.sourcePath || "—"}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            field.multiline ? "bg-cyan-500/15 text-cyan-400" : "bg-slate-500/15 text-slate-400"
                          }`}>
                            {field.multiline ? "Multi" : "Single"}
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                  {editingPreview && (
                    <button
                      type="button"
                      onClick={handleAddField}
                      className="w-full border-2 border-dashed border-slate-600 rounded-lg py-2 text-sm text-slate-400 hover:border-cyan-500 hover:text-cyan-400 transition-colors flex items-center justify-center gap-2"
                    >
                      <span className="h-4 w-4 border border-slate-500 rounded flex items-center justify-center">
                        <span className="text-[10px]">+</span>
                      </span>
                      Add Field Mapping
                    </button>
                  )}
                </div>

                {/* Save Template Button */}
                <div className="flex gap-2 pt-2 border-t border-slate-700/50">
                  <button
                    type="button"
                    onClick={saveTemplate}
                    disabled={savingTemplate}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-2 rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {savingTemplate ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Save Layout as Default for "{customName}"
                      </>
                    )}
                  </button>
                  {saveError && (
                    <span className="text-sm text-red-400 flex items-center">{saveError}</span>
                  )}
                </div>
              </div>
            )}

            {/* Fallback: Manual Field Builder if no template and parse failed */}
            {!showPreview && !screenshotPreview && parseError && (
              <div className="rounded-lg border border-dashed border-slate-700 p-4 bg-slate-900/50">
                <p className="text-sm text-slate-400 mb-3">
                  Screenshot parsing failed. Build field mappings manually:
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingPreview(true);
                    setShowPreview(true);
                    setPreviewFields({
                      fieldSchema: { fields: [], priorityMapping: {}, workTypeMapping: {} },
                      rawResponse: ""
                    });
                    setEditedFields([{
                      key: "WORK_ORDER_TYPE",
                      label: "Work Order Type",
                      sourcePath: "",
                      multiline: false,
                      staticValue: "Corrective"
                    }]);
                  }}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
                >
                  Open Manual Field Builder
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Pre-Formatted Fields (for all targets including custom) */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            {target === "custom" && !customTemplate
              ? "Step 2: Configure Custom Fields Above"
              : "Step 2: Pre-Formatted Work Order Fields"}
          </p>
          {target === "custom" && !customTemplate && !showPreview ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
              <Image className="h-10 w-10 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">
                Enter CMMS name and upload a screenshot to generate field mappings
              </p>
              <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-500">
                Or search for a saved template by typing the CMMS name above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cmmsFields.map((field) => (
                <div
                  key={field.key}
                  className={`min-w-0 ${field.multiline ? "sm:col-span-2" : ""}`}
                >
                  <span className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {field.label}:
                    <span className="font-mono normal-case tracking-normal text-slate-600">
                      {field.key}
                    </span>
                  </span>
                  <div className="flex gap-2 items-stretch">
                    {field.multiline ? (
                      <textarea
                        readOnly
                        rows={2}
                        value={field.value}
                        className="flex-1 min-w-0 resize-y bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                      />
                    ) : (
                      <input
                        type="text"
                        readOnly
                        value={field.value}
                        className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => copy(field.value, field.key, field.label)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 cursor-pointer transition-colors shrink-0 inline-flex items-center gap-1"
                      title={`Copy ${field.label}`}
                    >
                      {copiedKey === field.key ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Copy Full Payload */}
        {cmmsFields.length > 0 && (
          <button
            type="button"
            onClick={() => copy(fullPayloadText, "__all__", "Full payload")}
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Clipboard className="h-4 w-4" />
            Copy Full Multi-Field Payload to Clipboard
          </button>
        )}

        <p className="text-xs leading-relaxed text-slate-500">
          Fields whose source value was never recorded are omitted rather than
          defaulted. Priority and work-order type are mapped from the diagnosis
          severity using each system&apos;s own scale — switching systems
          rewrites the keys and codes, never the measured values.
        </p>
      </div>
    </section>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}