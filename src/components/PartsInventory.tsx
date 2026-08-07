import React, { useMemo, useState } from "react";
import {
  AlertTriangle, Building, CheckCircle2, ChevronDown, Clock, DollarSign, Filter,
  Layers, Plus, Search, X
} from "lucide-react";
import { useToast } from "./Toast";

// ===== Schema =====

export type PartCategory =
  | "Bearings"
  | "Seals"
  | "Couplings"
  | "Alignment"
  | "Lubricants"
  | "Fasteners"
  | "Dampers"
  | "Belts"
  | "Sensors";

export const PART_CATEGORIES: PartCategory[] = [
  "Bearings", "Seals", "Couplings", "Alignment", "Lubricants",
  "Fasteners", "Dampers", "Belts", "Sensors"
];

export interface InventoryPart {
  id: number;
  partNumber: string;
  description: string;
  category: PartCategory;
  manufacturer: string;
  quantityInStock: number;
  unitPrice: number;
  reorderLevel: number;
  supplierName: string;
  supplierContact: string;
  leadTimeDays: number;
  lastUpdated: string;
}

export const INITIAL_INVENTORY: InventoryPart[] = [
  { id: 1, partNumber: "SKF-NU314-ECP", description: "SKF NU 314 ECP Cylindrical Roller Bearing", category: "Bearings", manufacturer: "SKF", quantityInStock: 6, unitPrice: 312.0, reorderLevel: 2, supplierName: "Motion Industries", supplierContact: "orders@motion-ind.com", leadTimeDays: 5, lastUpdated: "2026-07-18" },
  { id: 2, partNumber: "ALN-SHIM-KIT", description: "Stainless Alignment Shims Kit, 0.002-0.125 in", category: "Alignment", manufacturer: "Precision Brand", quantityInStock: 9, unitPrice: 142, reorderLevel: 4, supplierName: "Applied Industrial", supplierContact: "sales@applied.com", leadTimeDays: 3, lastUpdated: "2026-07-11" },
  { id: 3, partNumber: "VBD-40-NEO", description: "Neoprene Vibration Damper Mount, 40 mm", category: "Dampers", manufacturer: "Vibrasystems", quantityInStock: 32, unitPrice: 38.75, reorderLevel: 10, supplierName: "Grainger", supplierContact: "1-800-472-4643", leadTimeDays: 1, lastUpdated: "2026-07-21" },
  { id: 4, partNumber: "NBR-3055-SL", description: "Nitrile Shaft Seal 30 x 55 x 7 mm", category: "Seals", manufacturer: "Freudenberg", quantityInStock: 24, unitPrice: 12.4, reorderLevel: 8, supplierName: "Motion Industries", supplierContact: "orders@motion-ind.com", leadTimeDays: 2, lastUpdated: "2026-06-29" },
  { id: 5, partNumber: "LVX-EP2-400", description: "Lithium Complex EP2 Grease Cartridge, 400 g", category: "Lubricants", manufacturer: "Mobil", quantityInStock: 40, unitPrice: 9.85, reorderLevel: 12, supplierName: "Fastenal", supplierContact: "industrial@fastenal.com", leadTimeDays: 1, lastUpdated: "2026-07-22" },
  { id: 6, partNumber: "CPL-L110-EL", description: "L110 Elastomeric Jaw Coupling Insert", category: "Couplings", manufacturer: "Lovejoy", quantityInStock: 5, unitPrice: 64.2, reorderLevel: 8, supplierName: "Applied Industrial", supplierContact: "sales@applied.com", leadTimeDays: 5, lastUpdated: "2026-07-09" },
  { id: 7, partNumber: "SKF-6308-C3", description: "SKF 6308 C3 Deep Groove Ball Bearing", category: "Bearings", manufacturer: "SKF", quantityInStock: 0, unitPrice: 146.9, reorderLevel: 4, supplierName: "Motion Industries", supplierContact: "orders@motion-ind.com", leadTimeDays: 7, lastUpdated: "2026-07-15" },
  { id: 8, partNumber: "FST-M16-A4", description: "M16 A4 Stainless Foundation Anchor Bolt Set", category: "Fasteners", manufacturer: "Hilti", quantityInStock: 60, unitPrice: 6.75, reorderLevel: 20, supplierName: "Fastenal", supplierContact: "industrial@fastenal.com", leadTimeDays: 1, lastUpdated: "2026-07-20" },
  { id: 9, partNumber: "BLT-SPZ-1180", description: "SPZ 1180 Narrow Section V-Belt", category: "Belts", manufacturer: "Gates", quantityInStock: 12, unitPrice: 22.3, reorderLevel: 6, supplierName: "Grainger", supplierContact: "1-800-472-4643", leadTimeDays: 2, lastUpdated: "2026-07-05" },
  { id: 10, partNumber: "SNS-ACC-100", description: "100 mV/g Accelerometer, Side Exit Connector", category: "Sensors", manufacturer: "Wilcoxon", quantityInStock: 7, unitPrice: 312, reorderLevel: 3, supplierName: "Amphenol Direct", supplierContact: "support@amphenol.com", leadTimeDays: 10, lastUpdated: "2026-06-30" },
  { id: 11, partNumber: "ALN-LASER-CAL", description: "Laser Alignment Calibration Target Set", category: "Alignment", manufacturer: "Easy-Laser", quantityInStock: 3, unitPrice: 198.5, reorderLevel: 2, supplierName: "Easy-Laser NA", supplierContact: "service@easylaser.com", leadTimeDays: 14, lastUpdated: "2026-05-27" },
  { id: 12, partNumber: "LVX-SYN-220", description: "Synthetic Gear Oil ISO VG 220, 5 L", category: "Lubricants", manufacturer: "Shell", quantityInStock: 15, unitPrice: 58.9, reorderLevel: 6, supplierName: "Fastenal", supplierContact: "industrial@fastenal.com", leadTimeDays: 3, lastUpdated: "2026-07-14" },
  { id: 13, partNumber: "SEA-VRING-45", description: "V-Ring Axial Seal, 45 mm Shaft", category: "Seals", manufacturer: "SKF", quantityInStock: 30, unitPrice: 8.6, reorderLevel: 10, supplierName: "Motion Industries", supplierContact: "orders@motion-ind.com", leadTimeDays: 2, lastUpdated: "2026-07-02" },
  { id: 14, partNumber: "DMP-ISO-PAD6", description: "Isolation Pad, 6 in Neoprene / Cork Composite", category: "Dampers", manufacturer: "Karman Rubber", quantityInStock: 22, unitPrice: 16.4, reorderLevel: 8, supplierName: "Grainger", supplierContact: "1-800-472-4643", leadTimeDays: 1, lastUpdated: "2026-07-19" }
];

export const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function getStockStatus(part: InventoryPart) {
  if (part.quantityInStock <= 0) {
    return { label: "Out of Stock", badge: "bg-red-500/10 text-red-400 border-red-500/25" };
  }
  if (part.quantityInStock <= part.reorderLevel) {
    return { label: "Low Stock", badge: "bg-yellow-400/10 text-yellow-400 border-yellow-400/25" };
  }
  return { label: "In Stock", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Owns the inventory records so parts created through the modal persist for the
 * lifetime of the page rather than resetting each time the modal is reopened.
 */
export function usePartsInventory() {
  const [inventory, setInventory] = useState<InventoryPart[]>(INITIAL_INVENTORY);

  const savePart = (draft: Omit<InventoryPart, "id" | "lastUpdated"> & { id?: number }) => {
    setInventory((prev) => {
      if (draft.id != null) {
        return prev.map((p) =>
          p.id === draft.id ? { ...p, ...draft, id: draft.id, lastUpdated: todayIso() } : p
        );
      }
      const nextId = prev.reduce((max, p) => Math.max(max, p.id), 0) + 1;
      return [...prev, { ...draft, id: nextId, lastUpdated: todayIso() }];
    });
  };

  return { inventory, savePart };
}

// ===== Form helpers =====

interface PartFormState {
  partNumber: string;
  description: string;
  category: PartCategory;
  manufacturer: string;
  quantityInStock: string;
  unitPrice: string;
  reorderLevel: string;
  supplierName: string;
  supplierContact: string;
  leadTimeDays: string;
}

const EMPTY_FORM: PartFormState = {
  partNumber: "",
  description: "",
  category: "Bearings",
  manufacturer: "",
  quantityInStock: "0",
  unitPrice: "0",
  reorderLevel: "0",
  supplierName: "",
  supplierContact: "",
  leadTimeDays: "0"
};

const toFormState = (part: InventoryPart): PartFormState => ({
  partNumber: part.partNumber,
  description: part.description,
  category: part.category,
  manufacturer: part.manufacturer,
  quantityInStock: String(part.quantityInStock),
  unitPrice: String(part.unitPrice),
  reorderLevel: String(part.reorderLevel),
  supplierName: part.supplierName,
  supplierContact: part.supplierContact,
  leadTimeDays: String(part.leadTimeDays)
});

const inputClass =
  "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-yellow-400/60";

function Field({
  label,
  children,
  required = false
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
        {label}
        {required && <span className="text-yellow-400 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

// ===== Modal =====

interface PartsInventoryModalProps {
  inventory: InventoryPart[];
  reportPartIds: number[];
  onAddToReport: (part: InventoryPart) => void;
  onSavePart: (draft: Omit<InventoryPart, "id" | "lastUpdated"> & { id?: number }) => void;
  onClose: () => void;
}

export default function PartsInventoryModal({
  inventory,
  reportPartIds,
  onAddToReport,
  onSavePart,
  onClose
}: PartsInventoryModalProps) {
  const { toast } = useToast();
  const [view, setView] = useState<"browse" | "form">("browse");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PartFormState>(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PartCategory | "All">("All");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory.filter((part) => {
      if (category !== "All" && part.category !== category) return false;
      if (!q) return true;
      return (
        part.partNumber.toLowerCase().includes(q) ||
        part.description.toLowerCase().includes(q) ||
        part.manufacturer.toLowerCase().includes(q) ||
        part.supplierName.toLowerCase().includes(q)
      );
    });
  }, [inventory, query, category]);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setView("form");
  };

  const openEditForm = (part: InventoryPart) => {
    setEditingId(part.id);
    setForm(toFormState(part));
    setView("form");
  };

  const setField = <K extends keyof PartFormState>(key: K, value: PartFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.partNumber.trim() || !form.description.trim()) {
      toast("Part number and description are required.", "error");
      return;
    }
    onSavePart({
      id: editingId ?? undefined,
      partNumber: form.partNumber.trim(),
      description: form.description.trim(),
      category: form.category,
      manufacturer: form.manufacturer.trim() || "Unspecified",
      quantityInStock: Math.max(0, Number(form.quantityInStock) || 0),
      unitPrice: Math.max(0, Number(form.unitPrice) || 0),
      reorderLevel: Math.max(0, Number(form.reorderLevel) || 0),
      supplierName: form.supplierName.trim() || "Unassigned",
      supplierContact: form.supplierContact.trim() || "—",
      leadTimeDays: Math.max(0, Number(form.leadTimeDays) || 0)
    });
    toast(
      editingId != null
        ? `${form.partNumber.trim()} updated in inventory.`
        : `${form.partNumber.trim()} saved to inventory.`,
      "success"
    );
    setView("browse");
    setEditingId(null);
  };

  const handleAdd = (part: InventoryPart) => {
    onAddToReport(part);
    toast(`${part.partNumber} added to the report parts list.`, "success");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-800">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-yellow-400" />
              <span>{view === "browse" ? "Parts Inventory" : editingId != null ? "Edit Part" : "Add New Part"}</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {view === "browse"
                ? "Search the stockroom database and add parts to the active report."
                : "All fields feed the shared inventory record used for report pricing."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close parts inventory"
            className="text-slate-500 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {view === "browse" ? (
          <>
            {/* Filters */}
            <div className="p-5 border-b border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 min-w-0">
                  <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by part number, description, manufacturer, or supplier..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400/60"
                  />
                </div>

                <div className="relative shrink-0">
                  <Filter className="h-3.5 w-3.5 text-yellow-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as PartCategory | "All")}
                    className="appearance-none bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-9 py-2.5 text-xs font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-400/60"
                  >
                    <option value="All">All Categories</option>
                    {PART_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <button
                  type="button"
                  onClick={openCreateForm}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-xl cursor-pointer transition-colors shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add New Part</span>
                </button>
              </div>

              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {results.length} of {inventory.length} parts
                {category !== "All" && ` · ${category}`}
              </p>
            </div>

            {/* Results grid */}
            <div className="p-5 overflow-y-auto flex-1">
              {results.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <AlertTriangle className="h-8 w-8 text-slate-700 mx-auto" />
                  <p className="text-xs font-bold text-slate-400">No parts match your search</p>
                  <p className="text-[11px] text-slate-500">
                    Adjust the filters, or create the part if it is not yet catalogued.
                  </p>
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 hover:border-yellow-400/50 hover:text-yellow-400 text-slate-300 text-xs font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add New Part</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {results.map((part) => {
                    const stock = getStockStatus(part);
                    const alreadyAdded = reportPartIds.includes(part.id);

                    return (
                      <div
                        key={part.id}
                        className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-700 transition-colors flex flex-col"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[11px] font-bold text-yellow-400 font-mono">
                              {part.partNumber}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold shrink-0 ${stock.badge}`}>
                              {stock.label}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-200 leading-snug">{part.description}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-bold text-slate-400">
                              {part.category}
                            </span>
                            <span className="text-[10px] text-slate-500">{part.manufacturer}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                          <div className="bg-slate-900/60 border border-slate-800 rounded-lg px-2 py-1.5">
                            <span className="text-slate-500 block">Stock</span>
                            <span className="text-slate-200 font-bold">{part.quantityInStock} on hand</span>
                          </div>
                          <div className="bg-slate-900/60 border border-slate-800 rounded-lg px-2 py-1.5">
                            <span className="text-slate-500 block">Unit Price</span>
                            <span className="text-emerald-400 font-bold">{formatUsd(part.unitPrice)}</span>
                          </div>
                        </div>

                        <div className="space-y-1 text-[10px] text-slate-500 flex-1">
                          <p className="flex items-center gap-1.5 truncate">
                            <Building className="h-3 w-3 text-slate-600 shrink-0" />
                            <span className="truncate">{part.supplierName}</span>
                          </p>
                          <p className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3 text-slate-600 shrink-0" />
                            <span>{part.leadTimeDays} day lead time · reorder at {part.reorderLevel}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleAdd(part)}
                            disabled={alreadyAdded}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-bold rounded-lg transition-colors ${
                              alreadyAdded
                                ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-400"
                                : "bg-yellow-400 hover:bg-yellow-500 text-slate-950 cursor-pointer"
                            }`}
                          >
                            {alreadyAdded ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>In Report</span>
                              </>
                            ) : (
                              <>
                                <Plus className="h-3.5 w-3.5" />
                                <span>Add to Report</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditForm(part)}
                            className="px-2.5 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Add / Edit form */
          <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
            <div className="p-5 overflow-y-auto flex-1 space-y-4">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Part Number" required>
                  <input
                    type="text"
                    value={form.partNumber}
                    onChange={(e) => setField("partNumber", e.target.value)}
                    placeholder="SKF-NU314-ECP"
                    className={`${inputClass} font-mono`}
                  />
                </Field>
                <Field label="Category">
                  <div className="relative">
                    <select
                      value={form.category}
                      onChange={(e) => setField("category", e.target.value as PartCategory)}
                      className={`${inputClass} appearance-none pr-9 cursor-pointer`}
                    >
                      {PART_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </Field>
              </div>

              <Field label="Description" required>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  placeholder="Sealed ball bearing, 25 mm bore"
                  className={inputClass}
                />
              </Field>

              <Field label="Manufacturer">
                <input
                  type="text"
                  value={form.manufacturer}
                  onChange={(e) => setField("manufacturer", e.target.value)}
                  placeholder="SKF"
                  className={inputClass}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Quantity in Stock">
                  <input
                    type="number"
                    min="0"
                    value={form.quantityInStock}
                    onChange={(e) => setField("quantityInStock", e.target.value)}
                    className={`${inputClass} font-mono`}
                  />
                </Field>
                <Field label="Unit Price (USD)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unitPrice}
                    onChange={(e) => setField("unitPrice", e.target.value)}
                    className={`${inputClass} font-mono`}
                  />
                </Field>
                <Field label="Reorder Level">
                  <input
                    type="number"
                    min="0"
                    value={form.reorderLevel}
                    onChange={(e) => setField("reorderLevel", e.target.value)}
                    className={`${inputClass} font-mono`}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Supplier Name">
                  <input
                    type="text"
                    value={form.supplierName}
                    onChange={(e) => setField("supplierName", e.target.value)}
                    placeholder="Motion Industries"
                    className={inputClass}
                  />
                </Field>
                <Field label="Supplier Contact">
                  <input
                    type="text"
                    value={form.supplierContact}
                    onChange={(e) => setField("supplierContact", e.target.value)}
                    placeholder="orders@supplier.com"
                    className={inputClass}
                  />
                </Field>
                <Field label="Lead Time (days)">
                  <input
                    type="number"
                    min="0"
                    value={form.leadTimeDays}
                    onChange={(e) => setField("leadTimeDays", e.target.value)}
                    className={`${inputClass} font-mono`}
                  />
                </Field>
              </div>

              <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-slate-600" />
                <span>Last updated stamps automatically on save.</span>
              </p>
            </div>

            {/* Form footer */}
            <div className="flex flex-wrap items-center justify-end gap-2 p-5 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setView("browse");
                  setEditingId(null);
                }}
                className="px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                <DollarSign className="h-3.5 w-3.5" />
                <span>Save to Inventory</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
