import React, { useState, useEffect, useMemo } from "react";
import { Plant, RouteArea, Equipment, ComponentAsset, SavedReport } from "../types";
import { 
  Folder, 
  Layers, 
  Settings, 
  Activity, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Edit3, 
  Plus, 
  Search, 
  Filter, 
  ChevronRight, 
  ChevronDown, 
  Database, 
  Cpu, 
  Wrench, 
  Wind, 
  Zap, 
  Thermometer, 
  Droplets, 
  X, 
  RefreshCw,
  Info,
  Calendar,
  ShieldAlert,
  Sliders,
  PlayCircle,
  TrendingUp,
  MapPin,
  Building,
  Sparkles,
  AlertCircle,
  Disc,
  HelpCircle,
  Link as LinkIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useToast } from "./Toast";
import BulkImportModal from "./BulkImportModal";

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
}

const clientSpecCache: Record<string, { specs: string[]; source: "cached" | "ai-generated"; matchedTypo?: boolean; originalMatch?: string }> = {};

const isStandardKey = (key: string) => {
  const standard = [
    "hp", "rpm", "voltage", "rotor_bars", "stator_slots", "line_frequency", "num_poles", "motor_type",
    "bearing_inner", "bearing_outer", "bearing_type", "bpfi", "bpfo", "ftf", "bsf", "gearbox_ratio",
    "gear_pinion_teeth", "gear_wheel_teeth", "input_rpm", "fan_blades", "flow_rate", "drive_type",
    "pressure", "temperature", "airflow_cfm", "static_pressure", "coupling_type", "coupling_size",
    "max_rpm", "measurement_point", "units", "target_value", "manufacturer", "model",
    "bearing_manufacturer", "bearing_model", "oil_type", "output_speed", "assetCriticality",
    "gravitySpecs", "powerRating", "systemDetails", "frame_size"
  ];
  if (standard.includes(key)) return true;
  if (key.endsWith("_is_custom") || key.endsWith("_custom_val") || key.endsWith("_source") || key.endsWith("_fields")) return true;
  return false;
};

interface FormSmartSelectProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  fieldKey: string;
  formSpecsObj: Record<string, string>;
  setFormSpecsObj: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  placeholder?: string;
}

function FormSmartSelect({
  label,
  value,
  onChange,
  options,
  fieldKey,
  formSpecsObj,
  setFormSpecsObj,
  placeholder = ""
}: FormSmartSelectProps) {
  const isCustom = formSpecsObj[fieldKey + "_is_custom"] === "true" || value === "custom_other" || (!options.some(o => o.value === value) && value !== "");
  const customVal = formSpecsObj[fieldKey + "_custom_val"] || (isCustom ? value : "");
  const source = formSpecsObj[fieldKey + "_source"] || "";
  
  const [typedVal, setTypedVal] = React.useState(customVal);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setTypedVal(customVal);
  }, [customVal]);

  const triggerFetch = async (val: string) => {
    if (!val.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/get-component-specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentType: val })
      });
      if (res.ok) {
        const data = await res.json();
        setFormSpecsObj(prev => ({
          ...prev,
          [fieldKey + "_source"]: data.source || "cached",
          [fieldKey + "_fields"]: JSON.stringify(data.specs || [])
        }));
        if (Array.isArray(data.specs)) {
          setFormSpecsObj(prev => {
            const copy = { ...prev };
            data.specs.forEach((field: string) => {
              const keyName = field.toLowerCase().replace(/[^a-z0-9]+/g, "_");
              if (copy[keyName] === undefined) {
                copy[keyName] = "";
              }
            });
            return copy;
          });
        }
      }
    } catch (err) {
      console.error("Error fetching specs in FormSmartSelect:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBlurOrEnter = () => {
    if (typedVal !== customVal) {
      setFormSpecsObj(prev => ({
        ...prev,
        [fieldKey + "_custom_val"]: typedVal,
        [fieldKey]: typedVal
      }));
      onChange(typedVal);
      triggerFetch(typedVal);
    }
  };

  const parsedFields = React.useMemo(() => {
    try {
      const fieldsStr = formSpecsObj[fieldKey + "_fields"];
      return fieldsStr ? JSON.parse(fieldsStr) : [];
    } catch {
      return [];
    }
  }, [formSpecsObj[fieldKey + "_fields"]]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
          {label}
        </label>
        {isCustom && (source || loading) && (
          <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ${
            loading ? "bg-yellow-400/10 text-yellow-400 border border-yellow-400/10 animate-pulse" :
            source === "ai-generated" ? "bg-purple-500/10 text-purple-400 border border-purple-500/10" : "bg-blue-500/10 text-blue-400 border border-blue-500/10"
          }`}>
            {loading ? "Generating..." : source === "ai-generated" ? "✨ AI-Generated" : "📋 Standard"}
          </span>
        )}
      </div>

      <select
        value={isCustom ? "custom_other" : value}
        onChange={e => {
          const val = e.target.value;
          if (val === "custom_other") {
            setFormSpecsObj(prev => ({
              ...prev,
              [fieldKey + "_is_custom"]: "true",
              [fieldKey + "_custom_val"]: "",
              [fieldKey]: ""
            }));
            onChange("");
          } else {
            setFormSpecsObj(prev => ({
              ...prev,
              [fieldKey + "_is_custom"]: "false",
              [fieldKey + "_source"]: "",
              [fieldKey + "_fields"]: "",
              [fieldKey]: val
            }));
            onChange(val);
          }
        }}
        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono outline-none focus:border-yellow-400 cursor-pointer text-xs"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
        <option value="custom_other">Other / Custom</option>
      </select>

      {isCustom && (
        <div className="mt-2 space-y-2 pl-3 border-l-2 border-yellow-400/30">
          <div className="space-y-1">
            <span className="text-[9px] font-mono text-slate-500 block uppercase font-bold">Please specify custom {label}</span>
            <input
              type="text"
              value={typedVal}
              onChange={e => setTypedVal(e.target.value)}
              onBlur={handleBlurOrEnter}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  handleBlurOrEnter();
                }
              }}
              placeholder={placeholder || `Enter custom ${label.toLowerCase()}...`}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs outline-none focus:border-yellow-400"
            />
          </div>

          {parsedFields.length > 0 && (
            <div className="space-y-2 mt-2 pt-2 border-t border-slate-900">
              <span className="text-[9px] font-mono text-slate-400 block uppercase tracking-wider font-bold">
                {typedVal || "Custom"} Specifications:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {parsedFields.map((field: string) => {
                  const keyName = field.toLowerCase().replace(/[^a-z0-9]+/g, "_");
                  return (
                    <div key={field} className="space-y-1">
                      <label className="text-[9px] font-mono text-slate-500 uppercase block">
                        {field}
                      </label>
                      <input
                        type="text"
                        value={formSpecsObj[keyName] || ""}
                        onChange={e => setFormSpecsObj(prev => ({ ...prev, [keyName]: e.target.value }))}
                        placeholder={`Enter value`}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white font-mono text-xs outline-none focus:border-yellow-400"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Assets({ 
  user,
  reports, 
  onSelectReport, 
  onStartDiagnosis,
  selectedCompanyId = 1,
  setSelectedCompanyId = () => {},
  subscriptionPlan = "full_suite",
  onNavigateToMigration
}: AssetsProps) {
  const { showToast } = useToast();

  // --- Breadcrumb Drill Down State ---
  const [currentPlant, setCurrentPlant] = useState<Plant | null>(null);
  const [currentRoute, setCurrentRoute] = useState<RouteArea | null>(null);
  const [currentAsset, setCurrentAsset] = useState<Equipment | null>(null);
  const [currentComponent, setCurrentComponent] = useState<ComponentAsset | null>(null);

  // --- Core Lists ---
  const [plants, setPlants] = useState<Plant[]>([]);
  const [routes, setRoutes] = useState<RouteArea[]>([]);
  const [assets, setAssets] = useState<Equipment[]>([]);
  const [components, setComponents] = useState<ComponentAsset[]>([]);
  const [collectionPoints, setCollectionPoints] = useState<any[]>([]);

  // Loading States
  const [loadingPlants, setLoadingPlants] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [loadingCollectionPoints, setLoadingCollectionPoints] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Component Cross-Axis Analysis States
  const [isAnalyzingComponent, setIsAnalyzingComponent] = useState(false);
  const [componentAnalysisResult, setComponentAnalysisResult] = useState<any | null>(null);
  const [componentAnalysisError, setComponentAnalysisError] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCriticality, setFilterCriticality] = useState("All");
  const [filterTechnology, setFilterTechnology] = useState("All");

  // Modals
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"create" | "edit" | "delete" | null>(null);
  const [modalTargetType, setModalTargetType] = useState<"plant" | "route" | "equipment" | "component" | "collection_point" | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);

  // Form Fields
  const [formName, setFormName] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState("");
  const [customComponentType, setCustomComponentType] = useState("");
  const [formManufacturer, setFormManufacturer] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formSerialNumber, setFormSerialNumber] = useState("");
  const [formInstallDate, setFormInstallDate] = useState("");
  const [formCriticality, setFormCriticality] = useState("Medium");
  const [formStatus, setFormStatus] = useState("Active");
  const [formTechnologyType, setFormTechnologyType] = useState("Vibration");
  const [formOrientation, setFormOrientation] = useState("Horizontal");
  const [formArea, setFormArea] = useState("");

  // Dynamic Specification Form for Components
  const [activeComponentSpecTab, setActiveComponentSpecTab] = useState<string>("core");
  const [dynamicSpecFields, setDynamicSpecFields] = useState<string[]>([]);
  const [dynamicSpecValues, setDynamicSpecValues] = useState<Record<string, string>>({});
  const [dynamicSpecsLoading, setDynamicSpecsLoading] = useState(false);
  const [dynamicSpecsSource, setDynamicSpecsSource] = useState<"cached" | "ai-generated" | null>(null);
  const [dynamicSpecsTypoMatched, setDynamicSpecsTypoMatched] = useState(false);
  const [dynamicSpecsOriginalMatch, setDynamicSpecsOriginalMatch] = useState("");
  const [formSpecsObj, setFormSpecsObj] = useState<Record<string, string>>({
    hp: "",
    rpm: "",
    voltage: "",
    rotor_bars: "",
    stator_slots: "",
    line_frequency: "60",
    num_poles: "4",
    motor_type: "Induction",
    bearing_inner: "",
    bearing_outer: "",
    bearing_type: "Ball",
    bpfi: "",
    bpfo: "",
    ftf: "",
    bsf: "",
    gearbox_ratio: "",
    number_of_shafts: "",
    gear_pinion_teeth: "",
    gear_wheel_teeth: "",
    input_rpm: "",
    fan_blades: "",
    flow_rate: "",
    drive_type: "Direct Coupled"
  });

  const [expandedSpecsAccordion, setExpandedSpecsAccordion] = useState<string | null>("motor");

  const [showAddCustomSpecModal, setShowAddCustomSpecModal] = useState(false);
  const [customSpecName, setCustomSpecName] = useState("");
  const [customSpecValue, setCustomSpecValue] = useState("");

  // Flexible Collection Points Multi-point states
  const [isCPModalOpen, setIsCPModalOpen] = useState(false);
  const [cpModalStep, setCpModalStep] = useState<"config" | "edit">("config");
  const [cpCountInput, setCpCountInput] = useState("2");
  const [cpPointsList, setCpPointsList] = useState<{ id?: number; name: string }[]>([]);
  const [savingCPs, setSavingCPs] = useState(false);

  // Handle opening the collection point manager
  const openCollectionPointManager = () => {
    if (collectionPoints && collectionPoints.length > 0) {
      // Pre-populate existing
      setCpPointsList(collectionPoints.map(cp => ({ id: cp.id, name: cp.name })));
      setCpModalStep("edit");
    } else {
      // Fresh creation
      setCpCountInput("2");
      setCpPointsList([]);
      setCpModalStep("config");
    }
    setIsCPModalOpen(true);
  };

  // Handle step transition from "config" to "edit"
  const generateCPs = () => {
    const count = parseInt(cpCountInput, 10);
    if (isNaN(count) || count <= 0) {
      showToast("Please enter a valid number of points", "error");
      return;
    }
    const lowerType = (currentComponent?.type || "").toLowerCase();
    const list: { name: string }[] = [];
    for (let i = 0; i < count; i++) {
      if (lowerType.includes("motor")) {
        if (i === 0) list.push({ name: "Drive End" });
        else if (i === 1) list.push({ name: "Non-Drive End" });
        else list.push({ name: `Point ${i + 1}` });
      } else if (lowerType.includes("pump") || lowerType.includes("fan") || lowerType.includes("blower")) {
        if (i === 0) list.push({ name: "Inboard" });
        else if (i === 1) list.push({ name: "Outboard" });
        else list.push({ name: `Point ${i + 1}` });
      } else {
        list.push({ name: `Point ${i + 1}` });
      }
    }
    setCpPointsList(list);
    setCpModalStep("edit");
  };

  // Save the list of collection points in one batch
  const saveCPBatch = async () => {
    if (!currentComponent) return;
    setSavingCPs(true);
    try {
      const res = await fetch("/api/collection-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          component_id: currentComponent.id,
          points: cpPointsList
        })
      });
      if (!res.ok) throw new Error("Failed to save collection points");
      showToast("Collection points saved successfully!", "success");
      setIsCPModalOpen(false);
      fetchCollectionPoints(currentComponent.id);
    } catch (err: any) {
      console.error(err);
      showToast(`Error: ${err.message || "Failed to save points"}`, "error");
    } finally {
      setSavingCPs(false);
    }
  };

  // --- API Functions ---
  const fetchPlants = async () => {
    setLoadingPlants(true);
    setError(null);
    try {
      const res = await fetch(`/api/plants?company_id=${selectedCompanyId}`);
      if (!res.ok) throw new Error("Failed to load plants");
      const data = await res.json();
      setPlants(data);
    } catch (err: any) {
      console.error(err);
      setError("Error communicating with server database.");
    } finally {
      setLoadingPlants(false);
    }
  };

  const fetchRoutes = async (plantId: number) => {
    setLoadingRoutes(true);
    try {
      const res = await fetch(`/api/routes/${plantId}`);
      if (!res.ok) throw new Error("Failed to load routes");
      const data = await res.json();
      setRoutes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRoutes(false);
    }
  };

  const fetchAssets = async (routeId: number) => {
    setLoadingAssets(true);
    try {
      const res = await fetch(`/api/equipment/${routeId}`);
      if (!res.ok) throw new Error("Failed to load assets");
      const data = await res.json();
      setAssets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAssets(false);
    }
  };

  const fetchComponents = async (assetId: number) => {
    setLoadingComponents(true);
    try {
      const res = await fetch(`/api/components/${assetId}`);
      if (!res.ok) throw new Error("Failed to load components");
      const data = await res.json();
      setComponents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingComponents(false);
    }
  };

  const fetchCollectionPoints = async (componentId: number) => {
    setLoadingCollectionPoints(true);
    try {
      const res = await fetch(`/api/collection-points/component/${componentId}`);
      if (!res.ok) throw new Error("Failed to load collection points");
      const cpData = await res.json();
      setCollectionPoints(cpData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCollectionPoints(false);
    }
  };

  const handleAnalyzeComponent = async () => {
    if (!currentComponent) return;
    setIsAnalyzingComponent(true);
    setComponentAnalysisResult(null);
    setComponentAnalysisError(null);

    try {
      const res = await fetch("/api/analyze-component", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentId: currentComponent.id })
      });

      if (!res.ok) {
        throw new Error("Failed to execute component-wide cross-axis analysis.");
      }

      const data = await res.json();
      setComponentAnalysisResult(data);
    } catch (err: any) {
      console.error(err);
      setComponentAnalysisError(err.message || "An unexpected error occurred during component-wide analysis.");
    } finally {
      setIsAnalyzingComponent(false);
    }
  };

  // --- Initial & Cascade Fetching Trigger ---
  useEffect(() => {
    fetchPlants();
  }, [selectedCompanyId]);

  // Handle user-scoping of plant (auto-select single location)
  useEffect(() => {
    if (plants.length > 0 && !currentPlant) {
      const myPlant = (user && user.plant_id) ? plants.find(p => p.id === user.plant_id) : plants[0];
      if (myPlant) {
        setCurrentPlant(myPlant);
      }
    }
  }, [user, plants, currentPlant]);

  useEffect(() => {
    if (currentPlant) {
      fetchRoutes(currentPlant.id);
    } else {
      setRoutes([]);
      setCurrentRoute(null);
    }
  }, [currentPlant]);

  useEffect(() => {
    if (currentRoute) {
      fetchAssets(currentRoute.id);
    } else {
      setAssets([]);
      setCurrentAsset(null);
    }
  }, [currentRoute]);

  useEffect(() => {
    if (currentAsset) {
      fetchComponents(currentAsset.id);
    } else {
      setComponents([]);
      setCurrentComponent(null);
    }
  }, [currentAsset]);

  useEffect(() => {
    if (currentComponent) {
      fetchCollectionPoints(currentComponent.id);
      setComponentAnalysisResult(null);
      setComponentAnalysisError(null);
    } else {
      setCollectionPoints([]);
      setComponentAnalysisResult(null);
      setComponentAnalysisError(null);
    }
  }, [currentComponent]);

  useEffect(() => {
    if (formType) {
      const lowerType = formType.toLowerCase();
      if (lowerType.includes("motor") || lowerType.includes("electric")) {
        setExpandedSpecsAccordion("motor");
      } else if (lowerType.includes("gearbox") || lowerType.includes("gear")) {
        setExpandedSpecsAccordion("gearbox");
      } else if (lowerType.includes("pump") || lowerType.includes("fan") || lowerType.includes("blower")) {
        setExpandedSpecsAccordion("pump_fan");
      }
    }
    setActiveComponentSpecTab("core");
  }, [formType]);

  useEffect(() => {
    const activeType = formType === "Other" ? customComponentType.trim() : formType;
    if (!activeType) {
      setDynamicSpecFields([]);
      setDynamicSpecsSource(null);
      setDynamicSpecsTypoMatched(false);
      setDynamicSpecsOriginalMatch("");
      return;
    }

    const cacheKey = activeType.toLowerCase();
    if (clientSpecCache[cacheKey]) {
      const cached = clientSpecCache[cacheKey];
      setDynamicSpecFields(cached.specs);
      setDynamicSpecsSource(cached.source);
      setDynamicSpecsTypoMatched(cached.matchedTypo || false);
      setDynamicSpecsOriginalMatch(cached.originalMatch || "");
      
      const itemSpecs = editingItem ? (editingItem.specifications || editingItem.specs || {}) : {};
      const newVals: Record<string, string> = {};
      cached.specs.forEach(field => {
        newVals[field] = itemSpecs[field] || "";
      });
      setDynamicSpecValues(newVals);
      return;
    }

    const delay = formType === "Other" ? 500 : 0;
    
    const handler = setTimeout(async () => {
      setDynamicSpecsLoading(true);
      try {
        const response = await fetch("/api/get-component-specs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ componentType: activeType })
        });
        if (response.ok) {
          const data = await response.json();
          clientSpecCache[cacheKey] = {
            specs: data.specs,
            source: data.source,
            matchedTypo: data.matchedTypo,
            originalMatch: data.originalMatch
          };

          setDynamicSpecFields(data.specs);
          setDynamicSpecsSource(data.source);
          setDynamicSpecsTypoMatched(data.matchedTypo || false);
          setDynamicSpecsOriginalMatch(data.originalMatch || "");

          const itemSpecs = editingItem ? (editingItem.specifications || editingItem.specs || {}) : {};
          const newVals: Record<string, string> = {};
          data.specs.forEach((field: string) => {
            newVals[field] = itemSpecs[field] || "";
          });
          setDynamicSpecValues(newVals);
        }
      } catch (err) {
        console.error("Failed to fetch dynamic specifications:", err);
      } finally {
        setDynamicSpecsLoading(false);
      }
    }, delay);

    return () => clearTimeout(handler);
  }, [formType, customComponentType, editingItem]);

  // --- Modal Openers ---
  const openCreateModal = (targetType: "plant" | "route" | "equipment" | "component" | "collection_point") => {
    setModalType("create");
    setModalTargetType(targetType);
    setEditingItem(null);

    // Reset fields
    setFormName("");
    setFormLocation("");
    setFormDescription("");
    setFormType(targetType === "component" ? "Electric Motor" : "");
    setCustomComponentType("");
    setFormManufacturer("");
    setFormModel("");
    setFormSerialNumber("");
    setFormInstallDate("");
    setFormCriticality("Medium");
    setFormStatus("Active");
    setFormTechnologyType("Vibration");
    setFormOrientation("Horizontal");
    setFormArea("");
    setFormSpecsObj({
      hp: "",
      rpm: "",
      voltage: "",
      rotor_bars: "",
      stator_slots: "",
      line_frequency: "60",
      num_poles: "4",
      motor_type: "Induction",
      bearing_inner: "",
      bearing_outer: "",
      bearing_type: "Ball",
      bpfi: "",
      bpfo: "",
      ftf: "",
      bsf: "",
      gearbox_ratio: "",
      number_of_shafts: "",
      gear_pinion_teeth: "",
      gear_wheel_teeth: "",
      input_rpm: "",
      fan_blades: "",
      flow_rate: "",
      drive_type: "Direct Coupled"
    });
    // Set default accordion expansion based on type when created
    setExpandedSpecsAccordion("motor");
  };

  const openEditModal = (targetType: "plant" | "route" | "equipment" | "component" | "collection_point", item: any) => {
    setModalType("edit");
    setModalTargetType(targetType);
    setEditingItem(item);

    setFormName(item.name || "");
    setFormLocation(item.location || "");
    setFormDescription(item.description || item.notes || "");
    const standardTypes = [
      "Electric Motor", "Gearbox", "Pump", "Coupling", "Ventilation Fan", 
      "Compressor", "Blower", "Conveyor", "Elevator", "Dryer", 
      "Granulator", "Agitator", "Reclaimer", "Lump Breaker", "Screw Conveyor"
    ];
    if (targetType === "component" && item.type) {
      if (standardTypes.includes(item.type)) {
        setFormType(item.type);
        setCustomComponentType("");
      } else {
        setFormType("Other");
        setCustomComponentType(item.type);
      }
    } else {
      setFormType(item.type || "");
      setCustomComponentType("");
    }
    setFormManufacturer(item.manufacturer || "");
    setFormModel(item.model || "");
    setFormSerialNumber(item.serial_number || "");
    setFormInstallDate(item.install_date ? item.install_date.substring(0, 10) : "");
    setFormCriticality(item.criticality || "Medium");
    setFormStatus(item.status || "Active");
    setFormTechnologyType(item.technology_type || "Vibration");
    setFormOrientation(item.orientation || "Horizontal");
    setFormArea(item.area || "");

    const specs = item.specifications || item.specs || {};
    const loadedSpecs: Record<string, string> = {
      hp: specs.hp || "",
      rpm: specs.rpm || "",
      voltage: specs.voltage || specs.voltageRating || "",
      rotor_bars: specs.rotor_bars || specs.numRotorBars || "",
      stator_slots: specs.stator_slots || specs.numStatorSlots || "",
      line_frequency: specs.line_frequency || specs.lineFrequency || "60",
      num_poles: specs.num_poles || specs.numPoles || "4",
      motor_type: specs.motor_type || specs.motorType || "Induction",
      bearing_inner: specs.bearing_inner || specs.bearingModel || "",
      bearing_outer: specs.bearing_outer || specs.bearingModel || "",
      bearing_type: specs.bearing_type || specs.bearingType || "Ball",
      bpfi: specs.bpfi || "",
      bpfo: specs.bpfo || "",
      ftf: specs.ftf || "",
      bsf: specs.bsf || "",
      gearbox_ratio: specs.gearbox_ratio || "",
      number_of_shafts: specs.number_of_shafts || "",
      gear_pinion_teeth: specs.gear_pinion_teeth || "",
      gear_wheel_teeth: specs.gear_wheel_teeth || "",
      input_rpm: specs.input_rpm || "",
      fan_blades: specs.fan_blades || specs.fanBlades || "",
      flow_rate: specs.flow_rate || "",
      drive_type: specs.drive_type || specs.driveType || "Direct Coupled"
    };

    // Load any other/custom specifications from the saved object
    Object.entries(specs).forEach(([key, val]) => {
      if (val !== undefined && val !== null && !loadedSpecs[key]) {
        loadedSpecs[key] = String(val);
      }
    });

    setFormSpecsObj(loadedSpecs);

    // Auto expand accordion depending on edited item type
    const lowerType = (item.type || "").toLowerCase();
    if (lowerType.includes("motor") || lowerType.includes("electric")) {
      setExpandedSpecsAccordion("motor");
    } else if (lowerType.includes("gearbox") || lowerType.includes("gear")) {
      setExpandedSpecsAccordion("gearbox");
    } else if (lowerType.includes("pump") || lowerType.includes("fan") || lowerType.includes("blower")) {
      setExpandedSpecsAccordion("pump_fan");
    } else {
      setExpandedSpecsAccordion("bearings");
    }
  };

  const openDeleteModal = (targetType: "plant" | "route" | "equipment" | "component" | "collection_point", item: any) => {
    setModalTargetType(targetType);
    setEditingItem(item);
    setModalType("delete");
  };

  const handleWipeAll = () => {
    setIsWipeModalOpen(true);
  };

  // --- Modal Submit ---
  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    try {
      if (modalType === "create") {
        let url = "";
        let body: any = {};

        if (modalTargetType === "plant") {
          url = "/api/plants";
          body = { name: formName, location: formLocation, company_id: selectedCompanyId, user_id: user?.id };
        } else if (modalTargetType === "route") {
          url = "/api/routes";
          body = { plant_id: currentPlant?.id, name: formName, area: formArea, description: formDescription };
        } else if (modalTargetType === "equipment") {
          url = "/api/equipment";
          body = {
            route_id: currentRoute?.id,
            name: formName,
            type: formType,
            manufacturer: formManufacturer,
            model: formModel,
            serial_number: formSerialNumber,
            install_date: formInstallDate,
            criticality: formCriticality,
            status: formStatus,
            technology_type: formTechnologyType,
            description: formDescription
          };
        } else if (modalTargetType === "component") {
          url = "/api/components";
          body = {
            equipment_id: currentAsset?.id,
            name: formName,
            type: formType === "Other" ? (customComponentType.trim() || "Other") : formType,
            manufacturer: formManufacturer,
            model: formModel,
            specifications: { ...formSpecsObj, ...dynamicSpecValues },
            specs: { ...formSpecsObj, ...dynamicSpecValues },
            notes: formDescription
          };
        } else if (modalTargetType === "collection_point") {
          url = "/api/collection-points";
          body = {
            component_id: currentComponent?.id,
            name: formName,
            orientation: formOrientation,
            notes: formDescription
          };
        }

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        if (!res.ok) throw new Error(`Failed to create ${modalTargetType}`);
        
        let label = modalTargetType === "equipment" ? "Equipment" : modalTargetType === "component" ? "Component" : modalTargetType?.toUpperCase();
        showToast(`✅ ${label} added successfully!`, "success");

        // Refresh cascade
        if (modalTargetType === "plant") fetchPlants();
        if (modalTargetType === "route" && currentPlant) fetchRoutes(currentPlant.id);
        if (modalTargetType === "equipment" && currentRoute) fetchAssets(currentRoute.id);
        if (modalTargetType === "component" && currentAsset) fetchComponents(currentAsset.id);
        if (modalTargetType === "collection_point" && currentComponent) fetchCollectionPoints(currentComponent.id);

      } else if (modalType === "edit" && editingItem) {
        let url = "";
        let body: any = {};

        if (modalTargetType === "plant") {
          url = `/api/plants/${editingItem.id}`;
          body = { name: formName, location: formLocation };
        } else if (modalTargetType === "route") {
          url = `/api/routes/${editingItem.id}`;
          body = { name: formName, area: formArea, description: formDescription };
        } else if (modalTargetType === "equipment") {
          url = `/api/equipment/${editingItem.id}`;
          body = {
            name: formName,
            type: formType,
            manufacturer: formManufacturer,
            model: formModel,
            serial_number: formSerialNumber,
            install_date: formInstallDate,
            criticality: formCriticality,
            status: formStatus,
            technology_type: formTechnologyType,
            description: formDescription
          };
        } else if (modalTargetType === "component") {
          url = `/api/components/${editingItem.id}`;
          body = {
            name: formName,
            type: formType === "Other" ? (customComponentType.trim() || "Other") : formType,
            manufacturer: formManufacturer,
            model: formModel,
            specifications: { ...formSpecsObj, ...dynamicSpecValues },
            specs: { ...formSpecsObj, ...dynamicSpecValues },
            notes: formDescription
          };
        } else if (modalTargetType === "collection_point") {
          url = `/api/collection-points/${editingItem.id}`;
          body = {
            name: formName,
            orientation: formOrientation,
            notes: formDescription
          };
        }

        const res = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        if (!res.ok) throw new Error(`Failed to update ${modalTargetType}`);
        showToast(`${modalTargetType?.toUpperCase()} updated successfully!`, "success");

        // Refresh cascade
        if (modalTargetType === "plant") fetchPlants();
        if (modalTargetType === "route" && currentPlant) fetchRoutes(currentPlant.id);
        if (modalTargetType === "equipment" && currentRoute) fetchAssets(currentRoute.id);
        if (modalTargetType === "component" && currentAsset) fetchComponents(currentAsset.id);
        if (modalTargetType === "collection_point" && currentComponent) fetchCollectionPoints(currentComponent.id);
      }

      setModalType(null);
    } catch (err: any) {
      console.error(err);
      showToast(`Error: ${err.message || "Failed to save item"}`, "error");
    }
  };

  const handleDeleteSubmit = async () => {
    if (!editingItem || !modalTargetType) return;

    try {
      let url = "";
      if (modalTargetType === "collection_point") {
        url = `/api/collection-points/${editingItem.id}`;
      } else if (modalTargetType === "route") {
        url = `/api/routes/${editingItem.id}`;
      } else if (modalTargetType === "component") {
        url = `/api/components/${editingItem.id}`;
      } else if (modalTargetType === "equipment") {
        url = `/api/assets/${editingItem.id}`;
      } else {
        url = `/api/${modalTargetType}s/${editingItem.id}`;
      }

      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");

      showToast(`${modalTargetType.toUpperCase()} deleted.`, "success");

      // Reset paths if deleted active item
      if (modalTargetType === "plant" && currentPlant?.id === editingItem.id) setCurrentPlant(null);
      if (modalTargetType === "route" && currentRoute?.id === editingItem.id) setCurrentRoute(null);
      if (modalTargetType === "equipment" && currentAsset?.id === editingItem.id) setCurrentAsset(null);
      if (modalTargetType === "component" && currentComponent?.id === editingItem.id) setCurrentComponent(null);

      // Refresh cascade
      if (modalTargetType === "plant") fetchPlants();
      if (modalTargetType === "route" && currentPlant) fetchRoutes(currentPlant.id);
      if (modalTargetType === "equipment" && currentRoute) fetchAssets(currentRoute.id);
      if (modalTargetType === "component" && currentAsset) fetchComponents(currentAsset.id);
      if (modalTargetType === "collection_point" && currentComponent) fetchCollectionPoints(currentComponent.id);

      setModalType(null);
    } catch (err: any) {
      console.error(err);
      showToast(`Error: ${err.message || "Failed to delete"}`, "error");
    }
  };

  // --- Filtered Views ---
  const filteredPlants = useMemo(() => {
    return plants.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (p.location && p.location.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchSearch;
    });
  }, [plants, searchQuery]);

  const filteredRoutes = useMemo(() => {
    return routes.filter(r => {
      const matchSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (r.area && r.area.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchSearch;
    });
  }, [routes, searchQuery]);

  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      const matchSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (a.tag_number && a.tag_number.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchCriticality = filterCriticality === "All" || a.criticality === filterCriticality;
      const matchTech = filterTechnology === "All" || a.technology_type === filterTechnology;
      const matchAssigned = user?.role !== 'mechanic' || (a.id % 2 === 1);
      return matchSearch && matchCriticality && matchTech && matchAssigned;
    });
  }, [assets, searchQuery, filterCriticality, filterTechnology, user]);

  const filteredComponents = useMemo(() => {
    return components.filter(c => {
      return c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
             (c.type && c.type.toLowerCase().includes(searchQuery.toLowerCase()));
    });
  }, [components, searchQuery]);

  // Is current asset non-vibration?
  const isVibrationAsset = currentAsset ? (currentAsset.technology_type || "Vibration").toLowerCase() === "vibration" : true;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-white" id="equipment-db-view">
      
      {/* Upper header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-sans font-bold text-white flex items-center gap-2">
            <Database className="h-6 w-6 text-emerald-400" />
            <span>Industrial Equipment Database</span>
          </h1>
          <p className="text-sm text-slate-400">
            ISO 14224 Standard 5-Tier Functional Hierarchy Scoped Diagnostics
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleWipeAll}
            className="px-4 py-2 bg-red-950/40 border border-red-900/60 hover:bg-red-900/60 hover:border-red-500 text-red-400 hover:text-white rounded-lg text-sm transition-all flex items-center gap-2 cursor-pointer font-medium font-mono"
            id="wipe-all-equipment-btn"
          >
            <Trash2 className="h-4 w-4 text-red-400" />
            <span>WIPE ALL EQUIPMENT</span>
          </button>

          <button
            onClick={() => setIsBulkImportOpen(true)}
            className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-slate-200 hover:text-emerald-400 rounded-lg text-sm transition-all flex items-center gap-2 cursor-pointer font-medium"
            id="bulk-import-btn"
          >
            <Folder className="h-4 w-4" />
            <span>Bulk Import (CSV)</span>
          </button>
          
          {onNavigateToMigration && (
            <button
              onClick={onNavigateToMigration}
              className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-slate-200 hover:text-yellow-400 rounded-lg text-sm transition-all flex items-center gap-2 cursor-pointer font-medium"
              id="ai-migration-btn"
            >
              <Sparkles className="h-4 w-4 text-yellow-400" />
              <span>Import via AI</span>
            </button>
          )}
          


          {currentPlant && !currentRoute && (
            <button
              onClick={() => openCreateModal("route")}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-medium rounded-lg text-sm transition-all flex items-center gap-1.5 cursor-pointer"
              id="add-route-btn"
            >
              <Plus className="h-4 w-4 text-slate-950" />
              <span>Add Route</span>
            </button>
          )}

          {currentRoute && !currentAsset && user?.role !== 'mechanic' && (
            <button
              onClick={() => openCreateModal("equipment")}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-medium rounded-lg text-sm transition-all flex items-center gap-1.5 cursor-pointer"
              id="add-asset-btn"
            >
              <Plus className="h-4 w-4 text-slate-950" />
              <span>Add Asset</span>
            </button>
          )}

          {currentAsset && !currentComponent && user?.role !== 'mechanic' && (
            <button
              onClick={() => openCreateModal("component")}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-medium rounded-lg text-sm transition-all flex items-center gap-1.5 cursor-pointer"
              id="add-component-btn"
            >
              <Plus className="h-4 w-4 text-slate-950" />
              <span>Add Component</span>
            </button>
          )}

          {currentComponent && isVibrationAsset && user?.role !== 'mechanic' && (
            <button
              onClick={openCollectionPointManager}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-medium rounded-lg text-sm transition-all flex items-center gap-1.5 cursor-pointer animate-fade-in"
              id="add-cp-btn"
            >
              <Settings className="h-4 w-4 text-slate-950" />
              <span>Manage Collection Points</span>
            </button>
          )}
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400 font-sans bg-slate-900/40 p-4 rounded-xl border border-slate-850" id="assets-breadcrumbs">
        {currentPlant && (
          <button 
            onClick={() => {
              setCurrentRoute(null);
              setCurrentAsset(null);
              setCurrentComponent(null);
            }}
            className="hover:text-emerald-400 transition-colors font-medium flex items-center gap-1.5 cursor-pointer bg-transparent border-none outline-none text-slate-300"
          >
            <Building className="h-4 w-4 text-emerald-400" />
            <span>{currentPlant.name}</span>
          </button>
        )}

        {currentRoute && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-slate-600 shrink-0" />
            <button 
              onClick={() => {
                setCurrentAsset(null);
                setCurrentComponent(null);
              }}
              className="hover:text-emerald-400 transition-colors font-medium cursor-pointer bg-transparent border-none outline-none text-slate-300"
            >
              <span>{currentRoute.name}</span>
            </button>
          </>
        )}

        {currentAsset && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-slate-600 shrink-0" />
            <button 
              onClick={() => {
                setCurrentComponent(null);
              }}
              className="hover:text-emerald-400 transition-colors font-medium cursor-pointer bg-transparent border-none outline-none text-slate-300"
            >
              <span>{currentAsset.name}</span>
            </button>
          </>
        )}

        {currentComponent && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-slate-600 shrink-0" />
            <span className="text-emerald-400 font-semibold">{currentComponent.name}</span>
          </>
        )}
      </div>

      {/* Control Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div className="relative w-full md:w-96">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hierarchy..."
            className="w-full bg-slate-950 border border-slate-850 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
          />
        </div>

        {currentRoute && !currentAsset && (
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Criticality:</span>
              <select
                value={filterCriticality}
                onChange={(e) => setFilterCriticality(e.target.value)}
                className="bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.5 text-xs text-white"
              >
                <option value="All">All Criticalities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Technology:</span>
              <select
                value={filterTechnology}
                onChange={(e) => setFilterTechnology(e.target.value)}
                className="bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.5 text-xs text-white"
              >
                <option value="All">All Technologies</option>
                <option value="Vibration">Vibration Spectrum</option>
                <option value="IR Thermography">IR Thermography</option>
                <option value="Oil Analysis">Oil Analysis</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Drill-down Cascade Level Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" id="drill-down-cards-grid">
        
        {/* Level 0: Plants */}
        {currentPlant === null && (
          loadingPlants ? (
            <div className="col-span-full py-20 text-center text-slate-400">Loading industrial plants...</div>
          ) : filteredPlants.length === 0 ? (
            <div className="col-span-full text-center py-20 border border-dashed border-slate-800 rounded-2xl bg-slate-900/10">
              <Building className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No Plants Registered</p>
              <p className="text-slate-600 text-xs mt-1">Add your plant facility to begin configuring your routes.</p>
            </div>
          ) : (
            filteredPlants.map(p => (
              <div 
                key={p.id}
                onClick={() => setCurrentPlant(p)}
                className="bg-slate-900 border border-slate-800 hover:border-emerald-500/30 rounded-2xl p-6 transition-all group cursor-pointer relative shadow-lg hover:shadow-emerald-950/10 hover:-translate-y-0.5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-950 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/10 transition-colors">
                    <Building className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">{p.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span>{p.location || "No address defined"}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-850 mt-6 pt-4 text-xs text-slate-400">
                  <span className="font-medium group-hover:text-emerald-400 transition-colors flex items-center gap-1">
                    <span>Drill down to Routes</span>
                    <ChevronRight className="h-3 w-3" />
                  </span>
                  
                  {user?.role !== 'mechanic' && (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => openEditModal("plant", p)}
                        className="p-1.5 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button 
                        onClick={() => openDeleteModal("plant", p)}
                        className="p-1.5 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )
        )}

        {/* Level 1: Routes */}
        {currentPlant && !currentRoute && (
          loadingRoutes ? (
            <div className="col-span-full py-20 text-center text-slate-400">Loading plant routes...</div>
          ) : filteredRoutes.length === 0 ? (
            <div className="col-span-full text-center py-20 border border-dashed border-slate-800 rounded-2xl bg-slate-900/10">
              <Layers className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No Routes Found inside {currentPlant.name}</p>
              <button
                onClick={() => openCreateModal("route")}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-slate-950 font-medium rounded-lg text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create First Route</span>
              </button>
            </div>
          ) : (
            filteredRoutes.map(r => (
              <div 
                key={r.id}
                onClick={() => setCurrentRoute(r)}
                className="bg-slate-900 border border-slate-800 hover:border-emerald-500/30 rounded-2xl p-6 transition-all group cursor-pointer relative shadow-lg hover:shadow-emerald-950/10 hover:-translate-y-0.5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-950 flex items-center justify-center text-sky-400 group-hover:bg-sky-500/10 transition-colors">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-sky-400 transition-colors">{r.name}</h3>
                    {r.area && (
                      <span className="inline-block mt-1 bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded">
                        {r.area}
                      </span>
                    )}
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2">{r.description || "No description provided"}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-850 mt-6 pt-4 text-xs text-slate-400">
                  <span className="font-medium group-hover:text-sky-400 transition-colors flex items-center gap-1">
                    <span>Explore Assets</span>
                    <ChevronRight className="h-3 w-3" />
                  </span>
                  
                  {user?.role !== 'mechanic' && (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => openEditModal("route", r)}
                        className="p-1.5 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button 
                        onClick={() => openDeleteModal("route", r)}
                        className="p-1.5 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )
        )}

        {/* Level 2: Assets */}
        {currentPlant && currentRoute && !currentAsset && (
          loadingAssets ? (
            <div className="col-span-full py-20 text-center text-slate-400">Loading route assets...</div>
          ) : filteredAssets.length === 0 ? (
            <div className="col-span-full text-center py-20 border border-dashed border-slate-800 rounded-2xl bg-slate-900/10">
              <Wrench className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No Assets Inside {currentRoute.name}</p>
              <button
                onClick={() => openCreateModal("equipment")}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-slate-950 font-medium rounded-lg text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Asset</span>
              </button>
            </div>
          ) : (
            filteredAssets.map(a => (
              <div 
                key={a.id}
                onClick={() => setCurrentAsset(a)}
                className="bg-slate-900 border border-slate-800 hover:border-emerald-500/30 rounded-2xl p-6 transition-all group cursor-pointer relative shadow-lg hover:shadow-emerald-950/10 hover:-translate-y-0.5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-xl bg-slate-950 flex items-center justify-center text-amber-400 group-hover:bg-amber-500/10 transition-colors">
                      <Wrench className="h-5 w-5" />
                    </div>
                    
                    <span className={`px-2 py-0.5 text-[10px] rounded border font-mono uppercase font-bold ${
                      a.criticality === "Critical" ? "text-red-400 bg-red-950/40 border-red-500/30" :
                      a.criticality === "High" ? "text-amber-400 bg-amber-950/40 border-amber-500/30" :
                      "text-slate-400 bg-slate-950/40 border-slate-800"
                    }`}>
                      {a.criticality}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors line-clamp-1">{a.name}</h3>
                    
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="bg-slate-950 border border-slate-850 px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 uppercase">
                        {a.technology_type || "Vibration"}
                      </span>
                      {a.tag_number && (
                        <span className="bg-slate-950 border border-slate-850 px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 uppercase">
                          TAG: {a.tag_number}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 mt-4 font-sans pt-3 border-t border-slate-850">
                      <div>Mfg: <span className="text-slate-300 font-medium">{a.manufacturer || "N/A"}</span></div>
                      <div>Model: <span className="text-slate-300 font-medium">{a.model || "N/A"}</span></div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-850 mt-6 pt-4 text-xs text-slate-400">
                  <span className="font-medium group-hover:text-amber-400 transition-colors flex items-center gap-1">
                    <span>Inspect Components</span>
                    <ChevronRight className="h-3 w-3" />
                  </span>
                  
                  {user?.role !== 'mechanic' && (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => openEditModal("equipment", a)}
                        className="p-1.5 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button 
                        onClick={() => openDeleteModal("equipment", a)}
                        className="p-1.5 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )
        )}

        {/* Level 3: Components */}
        {currentPlant && currentRoute && currentAsset && !currentComponent && (
          loadingComponents ? (
            <div className="col-span-full py-20 text-center text-slate-400">Loading equipment components...</div>
          ) : filteredComponents.length === 0 ? (
            <div className="col-span-full text-center py-20 border border-dashed border-slate-800 rounded-2xl bg-slate-900/10">
              <Cpu className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No Components Added to {currentAsset.name}</p>
              <button
                onClick={() => openCreateModal("component")}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-slate-950 font-medium rounded-lg text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Component</span>
              </button>
            </div>
          ) : (
            filteredComponents.map(c => (
              <div 
                key={c.id}
                onClick={() => setCurrentComponent(c)}
                className="bg-slate-900 border border-slate-800 hover:border-emerald-500/30 rounded-2xl p-6 transition-all group cursor-pointer relative shadow-lg hover:shadow-emerald-950/10 hover:-translate-y-0.5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-950 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/10 transition-colors">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors">{c.name}</h3>
                    {c.type && (
                      <span className="inline-block mt-1 bg-slate-950 border border-slate-850 text-slate-400 font-mono text-[10px] uppercase px-2 py-0.5 rounded">
                        {c.type}
                      </span>
                    )}

                    {/* Specifications Grid */}
                    {(c.specifications || c.specs) && (
                      <div className="mt-4 p-3 bg-slate-950/40 rounded-lg space-y-1 text-xs border border-slate-850">
                        {Object.entries(c.specifications || c.specs || {}).map(([key, val]) => {
                          if (!val) return null;
                          return (
                            <div key={key} className="flex justify-between">
                              <span className="text-slate-500 capitalize">{key.replace("_", " ")}:</span>
                              <span className="text-slate-300 font-mono">{String(val)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-850 mt-6 pt-4 text-xs text-slate-400">
                  <span className="font-medium group-hover:text-emerald-400 transition-colors flex items-center gap-1">
                    <span>{isVibrationAsset ? "Select Collection Points" : "Ready for Diagnosis"}</span>
                    <ChevronRight className="h-3 w-3" />
                  </span>
                  
                  {user?.role !== 'mechanic' && (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => openEditModal("component", c)}
                        className="p-1.5 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button 
                        onClick={() => openDeleteModal("component", c)}
                        className="p-1.5 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )
        )}

        {/* Level 4: Collection Points */}
        {currentPlant && currentRoute && currentAsset && currentComponent && (
          <>
            {/* Component Header Block with Cross-Axis Diagnosis */}
            {isVibrationAsset && (
              <div className="col-span-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mb-3 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                        <Cpu className="h-5 w-5" />
                      </span>
                      <h2 className="text-lg font-black text-white uppercase tracking-wide">
                        {currentComponent.name}
                      </h2>
                    </div>
                    <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                      Cross-axis component diagnostics evaluates and aggregates all underlying measurement locations (Horizontal, Vertical, Axial) to identify coupled machine anomalies and load-sharing defects.
                    </p>
                  </div>
                  
                  {collectionPoints.length > 0 && (
                    <button
                      onClick={handleAnalyzeComponent}
                      disabled={isAnalyzingComponent}
                      className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 self-start md:self-center cursor-pointer min-w-[220px]"
                    >
                      {isAnalyzingComponent ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin text-slate-950" />
                          <span>Analyzing Axes...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 text-slate-950" />
                          <span>Analyze Entire Component</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Loading state message as requested: "Aggregating collection points... Running cross-axis analysis..." */}
                {isAnalyzingComponent && (
                  <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-850 space-y-3 animate-pulse">
                    <RefreshCw className="h-8 w-8 text-emerald-400 animate-spin mx-auto" />
                    <p className="text-sm font-semibold text-emerald-400">Aggregating collection points...</p>
                    <p className="text-xs text-slate-500">Running cross-axis analysis & executing consensus diagnostics...</p>
                  </div>
                )}

                {/* Error State */}
                {componentAnalysisError && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{componentAnalysisError}</span>
                  </div>
                )}

                {/* Probability & Severity Matrix Result */}
                {componentAnalysisResult && !isAnalyzingComponent && (
                  <div className="border-t border-slate-800 pt-6 space-y-6 animate-fade-in">
                    <div className="flex flex-col lg:flex-row gap-6">
                      
                      {/* Left: Matrix Card */}
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sliders className="h-4 w-4 text-emerald-400" />
                            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                              Vibration Matrix (ISO 10816 limits)
                            </h4>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                            componentAnalysisResult.overall_severity?.toLowerCase() === 'critical'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : componentAnalysisResult.overall_severity?.toLowerCase() === 'warning'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            Component Severity: {componentAnalysisResult.overall_severity || 'Healthy'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          {(componentAnalysisResult.ranked_faults || []).map((fault: any, idx: number) => {
                            const prob = fault.probability || 0;
                            const isHigh = prob > 75;
                            const isMed = prob > 40 && prob <= 75;
                            return (
                              <div key={idx} className="p-4 bg-slate-950/60 border border-slate-850 rounded-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:border-slate-700/50 transition-all">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`h-2 w-2 rounded-full ${isHigh ? 'bg-rose-500' : isMed ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`} />
                                    <h5 className="text-xs font-bold text-white font-sans">{fault.type}</h5>
                                  </div>
                                  <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                                    {fault.evidence}
                                  </p>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                  <div className="text-right">
                                    <span className="text-[9px] text-slate-500 block uppercase font-mono">Probability</span>
                                    <span className="text-xs font-mono font-bold text-white">{prob}%</span>
                                  </div>
                                  <div className="h-8 w-px bg-slate-800" />
                                  <div>
                                    <span className="text-[9px] text-slate-500 block uppercase font-mono">Severity</span>
                                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                                      isHigh 
                                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                                        : isMed 
                                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    }`}>
                                      {isHigh ? "High" : isMed ? "Medium" : "Low"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right: Summary Card */}
                      <div className="w-full lg:w-96 bg-slate-950/40 border border-slate-850 rounded-xl p-5 space-y-4">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                          Engineering Diagnostics
                        </h4>
                        
                        {componentAnalysisResult.executive_summary && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">Executive Summary</span>
                            <p className="text-xs text-slate-300 leading-relaxed font-sans font-normal">
                              {componentAnalysisResult.executive_summary}
                            </p>
                          </div>
                        )}

                        {componentAnalysisResult.manager_summary && (
                          <div className="space-y-2 border-t border-slate-850 pt-3">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500">Downtime Estimate:</span>
                              <span className="text-slate-300 font-mono font-bold">
                                {componentAnalysisResult.manager_summary.estimated_downtime || 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500">Repair Cost:</span>
                              <span className="text-emerald-400 font-mono font-bold">
                                {componentAnalysisResult.manager_summary.cost_estimate || 'N/A'}
                              </span>
                            </div>
                            {componentAnalysisResult.manager_summary.business_impact && (
                              <div className="space-y-1 text-xs">
                                <span className="text-slate-500">Business Impact:</span>
                                <p className="text-slate-400 leading-relaxed">
                                  {componentAnalysisResult.manager_summary.business_impact}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}
              </div>
            )}

            {!isVibrationAsset ? (
              <div className="col-span-full py-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/10">
                <Sliders className="h-10 w-10 text-slate-500 mx-auto mb-3" />
                <p className="text-slate-300 font-medium">Ready for Non-Vibration Diagnostics</p>
                <p className="text-slate-500 text-xs mt-1.5 max-w-md mx-auto leading-relaxed">
                  Collection Points are bypassed because this asset is configured for <strong className="text-emerald-400">{currentAsset.technology_type || "IR Thermography"}</strong>. Go to the Diagnose page to execute instant assessments.
                </p>
                <button
                  onClick={() => {
                    if (onStartDiagnosis) {
                      onStartDiagnosis(
                        currentPlant.id,
                        currentRoute.id,
                        currentAsset.id,
                        currentComponent.id,
                        currentAsset.technology_type || "IR Thermography"
                      );
                    }
                  }}
                  className="mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 mx-auto transition-all"
                >
                  <PlayCircle className="h-4 w-4" />
                  <span>Launch Diagnostic Workbench</span>
                </button>
              </div>
            ) : loadingCollectionPoints ? (
              <div className="col-span-full py-20 text-center text-slate-400">Loading collection points...</div>
            ) : collectionPoints.length === 0 ? (
              <div className="col-span-full text-center py-20 border border-dashed border-slate-800 rounded-2xl bg-slate-900/10">
                <MapPin className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">No Collection Points Inside {currentComponent.name}</p>
                <button
                  onClick={openCollectionPointManager}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-slate-950 font-medium rounded-lg text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Configure Collection Points</span>
                </button>
              </div>
            ) : (
              collectionPoints.map(cp => (
                <div 
                  key={cp.id}
                  className="bg-slate-900 border border-slate-850 rounded-2xl p-6 transition-all group relative shadow-lg flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="h-10 w-10 rounded-xl bg-slate-950 flex items-center justify-center text-rose-400">
                        <MapPin className="h-5 w-5" />
                      </div>
                      <span className="px-2 py-0.5 bg-slate-950 border border-slate-850 rounded text-[10px] font-mono text-slate-400 uppercase">
                        Orient: {cp.orientation || "Horizontal"}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">{cp.name}</h3>
                      {cp.notes && <p className="text-xs text-slate-500 mt-2">{cp.notes}</p>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-850 mt-6 pt-4 text-xs text-slate-400">
                    <button 
                      onClick={() => {
                        // Set URL prefill parameter
                        window.history.pushState(null, "", "?prefillId=" + cp.id);
                        if (onStartDiagnosis) {
                          onStartDiagnosis(
                            currentPlant.id,
                            currentRoute.id,
                            currentAsset.id,
                            currentComponent.id,
                            "Vibration",
                            cp.id
                          );
                        }
                      }}
                      className="px-3.5 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-md border-none outline-none"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-slate-950" />
                      <span>⚡ Run Diagnosis</span>
                    </button>
                    
                    {user?.role !== 'mechanic' && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => openEditModal("collection_point", cp)}
                          className="p-1.5 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button 
                          onClick={() => openDeleteModal("collection_point", cp)}
                          className="p-1.5 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* Mechanic Portal: Repair Guides & Work Orders */}
        {user?.role === 'mechanic' && currentComponent && (
          <div className="col-span-full mt-6 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-yellow-400 flex items-center gap-2 uppercase tracking-wider font-mono">
              <Wrench className="w-4.5 h-4.5" />
              Mechanic Portal: Active Work Order & Repair Guide
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Below is the automatically generated field service guide for <strong className="text-white">{currentComponent.name}</strong>. Refer to instructions, use proper safety equipment, and mark completed once finished.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Repair Guide */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-3">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono">Step-by-Step Repair Guide</span>
                <ul className="text-xs text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
                  <li>Isolate power supply and perform proper Lock-Out/Tag-Out (LOTO) procedures.</li>
                  <li>Perform visual inspection of the housing, base bolts, and couplings for wear or cracks.</li>
                  <li>Check lubrication levels and clear grease ports. Replenish with matching high-temp grease if dry.</li>
                  <li>Verify shaft alignment using dial indicators or laser alignment tool if available.</li>
                  <li>Re-torque all fasteners to specified foot-pounds according to manufacturer specs.</li>
                </ul>
              </div>

              {/* Work Order Actions */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-4">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest font-mono">Work Order Status</span>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      IN PROGRESS
                    </span>
                    <span className="text-[11px] text-slate-400">Assigned Technician: {user?.username}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    showToast(`Work Order for ${currentComponent.name} has been marked complete!`, "success");
                  }}
                  className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
                >
                  Mark Work Order Complete
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Wipe All Equipment Modal Overlay */}
      {isWipeModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm" id="wipe-modal-overlay">
          <div className="bg-slate-900 border border-red-900/60 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4" id="wipe-modal-box">
            <div className="flex items-start gap-3 text-red-500">
              <AlertTriangle className="h-6 w-6 mt-1 shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-white font-display">Wipe All Equipment Database?</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  <strong className="text-red-400 font-bold">CRITICAL WARNING:</strong> Are you sure you want to WIPE ALL EQUIPMENT from the database? This will permanently delete all routes, assets, components, collection points, measurement points, and analysis histories. This action is completely irreversible!
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsWipeModalOpen(false)}
                className="px-4 py-2 bg-slate-950 hover:bg-slate-850 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer border border-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const response = await fetch("/api/wipe-equipment", { method: "POST" });
                    if (response.ok) {
                      showToast("All equipment database wiped successfully.", "success");
                      setCurrentRoute(null);
                      setCurrentAsset(null);
                      setCurrentComponent(null);
                      if (currentPlant) fetchRoutes(currentPlant.id);
                    } else {
                      const err = await response.json().catch(() => ({}));
                      showToast(`Wipe failed: ${err.error || response.statusText}`, "error");
                    }
                  } catch (err: any) {
                    showToast(`Error: ${err.message}`, "error");
                  } finally {
                    setIsWipeModalOpen(false);
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold cursor-pointer font-mono shadow-lg shadow-red-600/20"
              >
                CONFIRM WIPE ALL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Standard Modals Container */}
      {modalType && modalTargetType && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm" id="modal-container-overlay">
          
          {modalType === "delete" ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4" id="delete-modal-box">
              <div className="flex items-start gap-3 text-red-400">
                <AlertTriangle className="h-6 w-6 mt-1 shrink-0" />
                <div>
                  <h3 className="text-lg font-bold text-white">Delete {modalTargetType.toUpperCase()}?</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Are you sure you want to delete <strong className="text-white">{editingItem?.name}</strong>? This will recursively destroy all subsequent child records inside the ISO standard functional hierarchy. This action is permanent.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 bg-slate-950 hover:bg-slate-850 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSubmit}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleModalSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4" id="form-modal-box">
              <button 
                type="button" 
                onClick={() => setModalType(null)} 
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>

              <div>
                <h3 className="text-lg font-bold text-white">
                  {modalType === "create" ? "Create New" : "Edit"} {modalTargetType.replace("_", " ").toUpperCase()}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Specify functional hierarchy attributes cleanly.</p>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Name / Label</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Primary Induction Motor, Route Alpha"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                {/* Plant Fields */}
                {modalTargetType === "plant" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Physical Location / Address</label>
                    <input
                      type="text"
                      value={formLocation}
                      onChange={(e) => setFormLocation(e.target.value)}
                      placeholder="e.g., 120 Industrial Pkwy, Houston, TX"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    />
                  </div>
                )}

                {/* Route Fields */}
                {modalTargetType === "route" && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Route Area / Subdivision (Optional)</label>
                      <input
                        type="text"
                        value={formArea}
                        onChange={(e) => setFormArea(e.target.value)}
                        placeholder="e.g., North Plant Refinery"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Description / Notes</label>
                      <textarea
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="Define operational details about this route sequence..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none h-20"
                      />
                    </div>
                  </>
                )}

                {/* Equipment (Asset) Fields */}
                {modalTargetType === "equipment" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400 block">Criticality</label>
                      <select
                        value={formCriticality}
                        onChange={(e) => setFormCriticality(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
                      >
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400 block">Technology Type</label>
                      <select
                        value={formTechnologyType}
                        onChange={(e) => setFormTechnologyType(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
                      >
                        <option value="Vibration">Vibration Spectrum</option>
                        <option value="IR Thermography">IR Thermography</option>
                        <option value="Oil Analysis">Oil Analysis</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400 block">Manufacturer</label>
                      <input
                        type="text"
                        value={formManufacturer}
                        onChange={(e) => setFormManufacturer(e.target.value)}
                        placeholder="e.g., Baldor, Siemens"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400 block">Model</label>
                      <input
                        type="text"
                        value={formModel}
                        onChange={(e) => setFormModel(e.target.value)}
                        placeholder="e.g., H6024"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400 block">Serial Number</label>
                      <input
                        type="text"
                        value={formSerialNumber}
                        onChange={(e) => setFormSerialNumber(e.target.value)}
                        placeholder="e.g., SN-88902"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400 block">Install Date</label>
                      <input
                        type="date"
                        value={formInstallDate}
                        onChange={(e) => setFormInstallDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </div>
                )}

                {/* Component Fields + Dynamic specifications form */}
                {modalTargetType === "component" && (
                  <>
                     <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-slate-400 block">Component Type</label>
                          <select
                            value={formType || "Electric Motor"}
                            onChange={(e) => setFormType(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-medium cursor-pointer focus:border-yellow-400 outline-none"
                          >
                            <option value="Electric Motor">Electric Motor</option>
                            <option value="Gearbox">Gearbox</option>
                            <option value="Pump">Pump</option>
                            <option value="Coupling">Coupling</option>
                            <option value="Ventilation Fan">Ventilation Fan</option>
                            <option value="Compressor">Compressor</option>
                            <option value="Blower">Blower</option>
                            <option value="Conveyor">Conveyor</option>
                            <option value="Elevator">Elevator</option>
                            <option value="Dryer">Dryer</option>
                            <option value="Granulator">Granulator</option>
                            <option value="Agitator">Agitator</option>
                            <option value="Reclaimer">Reclaimer</option>
                            <option value="Lump Breaker">Lump Breaker</option>
                            <option value="Screw Conveyor">Screw Conveyor</option>
                            <option value="Other">Other / Custom</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-slate-400 block">Manufacturer</label>
                          <input
                            type="text"
                            value={formManufacturer}
                            onChange={(e) => setFormManufacturer(e.target.value)}
                            placeholder="e.g., Baldor, SKF, Falk"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-400 outline-none"
                          />
                        </div>
                      </div>

                      {formType === "Other" && (
                        <div className="space-y-1.5 p-3 bg-slate-900/40 border border-slate-800 rounded-lg animate-fade-in">
                          <label className="text-xs font-medium text-slate-400 block">Please specify component type:</label>
                          <input
                            type="text"
                            value={customComponentType}
                            onChange={(e) => setCustomComponentType(e.target.value)}
                            placeholder="e.g., Hydraulic Cylinder, Heat Exchanger, Turbine, etc."
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-400 outline-none"
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 p-4 bg-slate-950/60 border border-slate-800 rounded-xl" id="component-specs-form">
                      {/* MACHINE SPECIFICATIONS HEADER */}
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                        <h3 className="text-xs font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-2 font-mono">
                          <Settings className="w-3.5 h-3.5 text-yellow-400" />
                          <span>Machine Specifications</span>
                        </h3>
                        <span className="text-[10px] text-slate-500 font-mono">ISO 14224 Compliant</span>
                      </div>

                      {/* Progressive Disclosure Tabs Navigation */}
                      <div className="flex flex-row gap-2 border-b border-slate-800/40 pb-2 overflow-x-auto scrollbar-none">
                        {(() => {
                          const compShowGearbox = (formType || "").toLowerCase().includes("gearbox") || (formType || "").toLowerCase().includes("gear");
                          const compShowFans = (formType || "").toLowerCase().includes("fan") || (formType || "").toLowerCase().includes("pump");
                          const compShowElectrical = (formType || "").toLowerCase().includes("motor") || (formType || "").toLowerCase().includes("electric");

                          const compTabsConfig = [
                            { id: "core", label: "Core Specs", icon: Sliders, visible: true },
                            { id: "bearings", label: "Bearings", icon: Disc, visible: !["coupling", "static"].some(k => (formType || "").toLowerCase().includes(k)) },
                            { id: "gearbox", label: "Gearbox", icon: Settings, visible: compShowGearbox },
                            { id: "fans", label: (formType || "").toLowerCase().includes("pump") ? "Pump Specs" : "Fans/Impellers", icon: Wind, visible: compShowFans },
                            { id: "electrical", label: "Electrical", icon: Zap, visible: compShowElectrical },
                            { id: "coupling", label: "Coupling Specs", icon: LinkIcon, visible: (formType || "").toLowerCase().includes("coupling") },
                            { id: "static", label: "Static Specs", icon: Sliders, visible: (formType || "").toLowerCase().includes("static") },
                            { id: "ai_specs", label: "AI Specs", icon: Sparkles, visible: dynamicSpecFields.length > 0 },
                            { id: "custom_specs", label: "Custom Specs", icon: Plus, visible: true }
                          ];

                          const visibleCompTabs = compTabsConfig.filter(t => t.visible);
                          const finalActiveSpecTab = visibleCompTabs.some(t => t.id === activeComponentSpecTab)
                            ? activeComponentSpecTab
                            : (visibleCompTabs[0]?.id || "core");

                          const compValidationError = (() => {
                            if (formType !== "Static Measurement") {
                              if (formSpecsObj.rpm && (isNaN(parseFloat(formSpecsObj.rpm)) || parseFloat(formSpecsObj.rpm) <= 0)) {
                                return "Operating Speed (RPM) must be a positive number.";
                              }
                            }
                            if (compShowFans && formSpecsObj.fan_blades && (isNaN(parseInt(formSpecsObj.fan_blades)) || parseInt(formSpecsObj.fan_blades) <= 0)) {
                              return "Number of Blades/Vanes must be a positive integer.";
                            }
                            if (compShowElectrical && formSpecsObj.rotor_bars && isNaN(parseInt(formSpecsObj.rotor_bars))) {
                              return "Number of Rotor Bars must be an integer.";
                            }
                            return null;
                          })();

                          return (
                            <div className="w-full space-y-4">
                              <div className="flex flex-row gap-1 overflow-x-auto pb-1 scrollbar-none">
                                {visibleCompTabs.map((tab) => {
                                  const Icon = tab.icon;
                                  const isSelected = finalActiveSpecTab === tab.id;
                                  return (
                                    <button
                                      key={tab.id}
                                      type="button"
                                      id={`tab-btn-${tab.id}`}
                                      onClick={() => setActiveComponentSpecTab(tab.id)}
                                      className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold font-mono tracking-wide transition-all duration-200 cursor-pointer whitespace-nowrap ${
                                        isSelected
                                          ? "bg-yellow-400 text-slate-950 border-yellow-400 font-bold shadow-md shadow-yellow-400/10"
                                          : "bg-slate-950/40 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/50"
                                      }`}
                                    >
                                      <Icon className="w-3.5 h-3.5" />
                                      <span>{tab.label}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Real-time Validation Errors */}
                              {compValidationError && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-mono rounded-xl flex items-center gap-2 animate-fade-in">
                                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                  <span>{compValidationError}</span>
                                </div>
                              )}

                              {/* Active Tab Panel Content */}
                              <div className="bg-slate-900/20 border border-slate-800/80 rounded-xl p-4 min-h-[200px]">
                                <AnimatePresence mode="wait">
                                  <motion.div
                                    key={finalActiveSpecTab}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.15 }}
                                    className="space-y-4"
                                  >
                                    {finalActiveSpecTab === "core" && (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                        {/* Operating Speed (RPM) */}
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                                            Operating Speed (RPM) <span className="text-red-500">*</span>
                                          </label>
                                          <input 
                                            type="text" 
                                            required
                                            value={formSpecsObj.rpm || ""} 
                                            onChange={e => setFormSpecsObj(prev => ({ ...prev, rpm: e.target.value }))}
                                            placeholder="e.g., 1750"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>

                                        {/* Machine Orientation */}
                                        <FormSmartSelect
                                          label="Machine Orientation"
                                          value={formSpecsObj.gravitySpecs || "Horizontal"}
                                          onChange={val => setFormSpecsObj(prev => ({ ...prev, gravitySpecs: val }))}
                                          options={[
                                            { value: "Horizontal", label: "Horizontal" },
                                            { value: "Vertical", label: "Vertical" },
                                            { value: "Angular", label: "Angular / Suspended" }
                                          ]}
                                          fieldKey="gravitySpecs"
                                          formSpecsObj={formSpecsObj}
                                          setFormSpecsObj={setFormSpecsObj}
                                        />

                                        {/* Drive Mode */}
                                        <FormSmartSelect
                                          label="Drive Mode"
                                          value={formSpecsObj.drive_type || "Direct Coupled"}
                                          onChange={val => setFormSpecsObj(prev => ({ ...prev, drive_type: val }))}
                                          options={[
                                            { value: "Direct Coupled", label: "Direct Coupled" },
                                            { value: "Belt Drive", label: "Belt Drive" },
                                            { value: "Gear Drive", label: "Gear Drive" }
                                          ]}
                                          fieldKey="drive_type"
                                          formSpecsObj={formSpecsObj}
                                          setFormSpecsObj={setFormSpecsObj}
                                        />

                                        {/* Asset Criticality */}
                                        <FormSmartSelect
                                          label="Asset Criticality"
                                          value={formSpecsObj.assetCriticality || "Standard"}
                                          onChange={val => setFormSpecsObj(prev => ({ ...prev, assetCriticality: val }))}
                                          options={[
                                            { value: "Critical", label: "Critical (Class I / High Ingress)" },
                                            { value: "Important", label: "Important (Class II / Process Core)" },
                                            { value: "Standard", label: "Standard (Class III / Auxiliary)" },
                                            { value: "Non-Critical", label: "Non-Critical (Class IV / Run to Fail)" }
                                          ]}
                                          fieldKey="assetCriticality"
                                          formSpecsObj={formSpecsObj}
                                          setFormSpecsObj={setFormSpecsObj}
                                        />

                                        {/* Power Rating */}
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                                            Power Rating (HP/kW)
                                          </label>
                                          <input 
                                            type="text" 
                                            value={formSpecsObj.powerRating || formSpecsObj.hp || ""} 
                                            onChange={e => setFormSpecsObj(prev => ({ ...prev, powerRating: e.target.value, hp: e.target.value }))}
                                            placeholder="e.g., 150 kW"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>

                                        {/* OEM Manufacturer */}
                                        <FormSmartSelect
                                          label="OEM Manufacturer"
                                          value={formSpecsObj.manufacturer || formManufacturer || ""}
                                          onChange={val => {
                                            setFormSpecsObj(prev => ({ ...prev, manufacturer: val }));
                                            setFormManufacturer(val);
                                          }}
                                          options={[
                                            { value: "Sulzer", label: "Sulzer" },
                                            { value: "Baldor", label: "Baldor" },
                                            { value: "ABB", label: "ABB" },
                                            { value: "Siemens", label: "Siemens" },
                                            { value: "General Electric", label: "General Electric" },
                                            { value: "WEG", label: "WEG" },
                                            { value: "Falk", label: "Falk" },
                                            { value: "Dodge", label: "Dodge" },
                                            { value: "Rexnord", label: "Rexnord" }
                                          ]}
                                          fieldKey="manufacturer"
                                          formSpecsObj={formSpecsObj}
                                          setFormSpecsObj={setFormSpecsObj}
                                          placeholder="e.g., Sulzer, Baldor, SKF"
                                        />
                                      </div>
                                    )}

                                    {finalActiveSpecTab === "bearings" && (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                        <FormSmartSelect
                                          label="Bearing Type"
                                          value={formSpecsObj.bearing_type || "Ball"}
                                          onChange={val => setFormSpecsObj(prev => ({ ...prev, bearing_type: val }))}
                                          options={[
                                            { value: "Ball", label: "Deep Groove Ball Bearing" },
                                            { value: "Roller", label: "Spherical Roller Bearing" },
                                            { value: "Tapered", label: "Tapered Roller Bearing" },
                                            { value: "Sleeve", label: "Sleeve / Journal" }
                                          ]}
                                          fieldKey="bearing_type"
                                          formSpecsObj={formSpecsObj}
                                          setFormSpecsObj={setFormSpecsObj}
                                        />
                                        <FormSmartSelect
                                          label="Bearing Manufacturer"
                                          value={formSpecsObj.bearing_manufacturer || ""}
                                          onChange={val => setFormSpecsObj(prev => ({ ...prev, bearing_manufacturer: val }))}
                                          options={[
                                            { value: "SKF", label: "SKF" },
                                            { value: "Timken", label: "Timken" },
                                            { value: "NSK", label: "NSK" },
                                            { value: "FAG", label: "FAG" },
                                            { value: "NTN", label: "NTN" },
                                            { value: "Koyo", label: "Koyo" },
                                            { value: "Link-Belt", label: "Link-Belt" },
                                            { value: "Dodge", label: "Dodge" }
                                          ]}
                                          fieldKey="bearing_manufacturer"
                                          formSpecsObj={formSpecsObj}
                                          setFormSpecsObj={setFormSpecsObj}
                                          placeholder="e.g., SKF, Timken, NSK"
                                        />
                                        <div className="space-y-1 col-span-2">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Model Number</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.bearing_model || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, bearing_model: e.target.value }))}
                                            placeholder="e.g., 6314-2RS"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                      </div>
                                    )}

                                    {finalActiveSpecTab === "gearbox" && (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Ratio</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.gearbox_ratio || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, gearbox_ratio: e.target.value }))}
                                            placeholder="e.g., 4.15:1"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Oil Type</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.oil_type || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, oil_type: e.target.value }))}
                                            placeholder="e.g., ISO VG 220 Synthetic"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Input Speed (RPM)</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.input_rpm || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, input_rpm: e.target.value }))}
                                            placeholder="e.g., 1750"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Output Speed (RPM)</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.output_speed || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, output_speed: e.target.value }))}
                                            placeholder="e.g., 420"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Number of Shafts</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.number_of_shafts || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, number_of_shafts: e.target.value }))}
                                            placeholder="e.g., 3"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                      </div>
                                    )}

                                    {finalActiveSpecTab === "fans" && (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                        {(formType || "").toLowerCase().includes("pump") ? (
                                          <>
                                            <div className="space-y-1">
                                              <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Flow Rate (GPM)</label>
                                              <input
                                                type="text"
                                                value={formSpecsObj.flow_rate || ""}
                                                onChange={(e) => setFormSpecsObj(prev => ({ ...prev, flow_rate: e.target.value }))}
                                                placeholder="e.g., 350 GPM"
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Pressure (PSI)</label>
                                              <input
                                                type="text"
                                                value={formSpecsObj.pressure || ""}
                                                onChange={(e) => setFormSpecsObj(prev => ({ ...prev, pressure: e.target.value }))}
                                                placeholder="e.g., 125 PSI"
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Temperature (°F)</label>
                                              <input
                                                type="text"
                                                value={formSpecsObj.temperature || ""}
                                                onChange={(e) => setFormSpecsObj(prev => ({ ...prev, temperature: e.target.value }))}
                                                placeholder="e.g., 185 °F"
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Speed (RPM)</label>
                                              <input
                                                type="text"
                                                value={formSpecsObj.rpm || ""}
                                                onChange={(e) => setFormSpecsObj(prev => ({ ...prev, rpm: e.target.value }))}
                                                placeholder="e.g., 1750"
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                              />
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <div className="space-y-1">
                                              <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Airflow (CFM)</label>
                                              <input
                                                type="text"
                                                value={formSpecsObj.airflow_cfm || ""}
                                                onChange={(e) => setFormSpecsObj(prev => ({ ...prev, airflow_cfm: e.target.value }))}
                                                placeholder="e.g., 12500 CFM"
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Static Pressure</label>
                                              <input
                                                type="text"
                                                value={formSpecsObj.static_pressure || ""}
                                                onChange={(e) => setFormSpecsObj(prev => ({ ...prev, static_pressure: e.target.value }))}
                                                placeholder="e.g., 2.5 in. w.g."
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                              />
                                            </div>
                                            <div className="space-y-1 col-span-2">
                                              <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Speed (RPM)</label>
                                              <input
                                                type="text"
                                                value={formSpecsObj.rpm || ""}
                                                onChange={(e) => setFormSpecsObj(prev => ({ ...prev, rpm: e.target.value }))}
                                                placeholder="e.g., 1180"
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                              />
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    )}

                                    {finalActiveSpecTab === "electrical" && (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Power (HP)</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.hp || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, hp: e.target.value }))}
                                            placeholder="e.g., 75"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Voltage (V)</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.voltage || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, voltage: e.target.value }))}
                                            placeholder="e.g., 460"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Speed (RPM)</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.rpm || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, rpm: e.target.value }))}
                                            placeholder="e.g., 1775"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Frame Size</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.frame_size || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, frame_size: e.target.value }))}
                                            placeholder="e.g., 365T"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                        <div className="space-y-1 col-span-2">
                                          <FormSmartSelect
                                            label="Enclosure Type"
                                            value={formSpecsObj.enclosure_type || "TEFC"}
                                            onChange={val => setFormSpecsObj(prev => ({ ...prev, enclosure_type: val }))}
                                            options={[
                                              { value: "TEFC", label: "TEFC (Totally Enclosed Fan Cooled)" },
                                              { value: "ODP", label: "ODP (Open Drip Proof)" },
                                              { value: "Explosion Proof", label: "Explosion Proof (HazLoc)" },
                                              { value: "TENV", label: "TENV (Totally Enclosed Non-Ventilated)" }
                                            ]}
                                            fieldKey="enclosure_type"
                                            formSpecsObj={formSpecsObj}
                                            setFormSpecsObj={setFormSpecsObj}
                                          />
                                        </div>
                                      </div>
                                    )}

                                    {finalActiveSpecTab === "coupling" && (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                        <FormSmartSelect
                                          label="Coupling Type"
                                          value={formSpecsObj.coupling_type || "Flexible"}
                                          onChange={val => setFormSpecsObj(prev => ({ ...prev, coupling_type: val }))}
                                          options={[
                                            { value: "Flexible", label: "Flexible Coupling" },
                                            { value: "Rigid", label: "Rigid Coupling" },
                                            { value: "Fluid", label: "Fluid Coupling" },
                                            { value: "Grid", label: "Grid Coupling" },
                                            { value: "Gear", label: "Gear Coupling" }
                                          ]}
                                          fieldKey="coupling_type"
                                          formSpecsObj={formSpecsObj}
                                          setFormSpecsObj={setFormSpecsObj}
                                        />
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Size</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.coupling_size || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, coupling_size: e.target.value }))}
                                            placeholder="e.g., Size 1050T"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                        <div className="space-y-1 col-span-2">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Max RPM</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.max_rpm || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, max_rpm: e.target.value }))}
                                            placeholder="e.g., 3600 RPM"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                      </div>
                                    )}

                                    {finalActiveSpecTab === "static" && (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                        <div className="space-y-1 col-span-2">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Measurement Point</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.measurement_point || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, measurement_point: e.target.value }))}
                                            placeholder="e.g., Structural Foundation Bolt #4"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Units</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.units || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, units: e.target.value }))}
                                            placeholder="e.g., mils, mm/s, °C, PSI"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Target Value</label>
                                          <input
                                            type="text"
                                            value={formSpecsObj.target_value || ""}
                                            onChange={(e) => setFormSpecsObj(prev => ({ ...prev, target_value: e.target.value }))}
                                            placeholder="e.g., < 0.05 in/s"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                          />
                                        </div>
                                      </div>
                                    )}

                                    {finalActiveSpecTab === "ai_specs" && (
                                      <div className="space-y-4">
                                        {/* Meta/Status Information */}
                                        <div className="flex flex-wrap gap-2 items-center justify-between p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-mono">
                                          <div className="flex items-center gap-1 text-slate-400">
                                            <span>Source:</span>
                                            {dynamicSpecsLoading ? (
                                              <span className="text-yellow-400 animate-pulse">Generating...</span>
                                            ) : dynamicSpecsSource === "cached" ? (
                                              <span className="text-emerald-400 font-bold">Standard Template / Cache</span>
                                            ) : (
                                              <span className="text-purple-400 font-bold">AI Generated</span>
                                            )}
                                          </div>
                                          {dynamicSpecsTypoMatched && (
                                            <div className="text-amber-400 font-bold flex items-center gap-1">
                                              <span>Fuzzy Matched:</span>
                                              <span>"{dynamicSpecsOriginalMatch}"</span>
                                            </div>
                                          )}
                                        </div>

                                        {dynamicSpecsLoading ? (
                                          <div className="py-8 text-center space-y-2">
                                            <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" />
                                            <p className="text-[10px] text-slate-400 font-mono">AI is analyzing component type & tailoring engineering specifications...</p>
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                            {dynamicSpecFields.map((field) => (
                                              <div key={field} className="space-y-1">
                                                <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                                                  {field.replace(/_/g, " ")}
                                                </label>
                                                <input
                                                  type="text"
                                                  value={dynamicSpecValues[field] || ""}
                                                  onChange={(e) => {
                                                    const val = e.target.value;
                                                    setDynamicSpecValues((prev) => ({ ...prev, [field]: val }));
                                                  }}
                                                  placeholder={`Enter ${field.replace(/_/g, " ").toLowerCase()}`}
                                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                                                />
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {finalActiveSpecTab === "custom_specs" && (
                                      <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                                            Custom Engineering Specifications
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => setShowAddCustomSpecModal(true)}
                                            className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-[10px] font-mono rounded-lg hover:bg-yellow-400/20 transition-all font-bold cursor-pointer animate-pulse"
                                          >
                                            <Plus className="w-3 h-3" />
                                            <span>Add Custom Spec</span>
                                          </button>
                                        </div>

                                        {Object.keys(formSpecsObj).filter(k => !isStandardKey(k)).length === 0 ? (
                                          <div className="py-8 text-center bg-slate-950/20 border border-dashed border-slate-800 rounded-xl space-y-1.5">
                                            <p className="text-xs text-slate-400">No custom specifications added yet.</p>
                                            <p className="text-[10px] text-slate-500 font-mono">Use custom specifications to capture unique parameters for expert analysis.</p>
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                            {Object.keys(formSpecsObj)
                                              .filter(k => !isStandardKey(k))
                                              .map(key => (
                                                <div key={key} className="flex items-center gap-2 p-2.5 bg-slate-950/40 border border-slate-800/80 rounded-lg animate-fade-in">
                                                  <div className="flex-1 min-w-0">
                                                    <span className="text-[10px] font-mono text-slate-400 uppercase block font-bold truncate">
                                                      {key.replace(/_/g, " ")}
                                                    </span>
                                                    <input
                                                      type="text"
                                                      value={formSpecsObj[key] || ""}
                                                      onChange={e => setFormSpecsObj(prev => ({ ...prev, [key]: e.target.value }))}
                                                      placeholder="Enter value"
                                                      className="w-full bg-slate-950/60 border border-slate-800/50 rounded px-2 py-1 text-xs text-white font-mono outline-none focus:border-yellow-400 mt-1"
                                                    />
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setFormSpecsObj(prev => {
                                                        const copy = { ...prev };
                                                        delete copy[key];
                                                        return copy;
                                                      });
                                                    }}
                                                    className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded transition-colors self-end cursor-pointer"
                                                    title="Delete Specification"
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                  </button>
                                                </div>
                                              ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </motion.div>
                                </AnimatePresence>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                )}

                {/* Collection Point Fields */}
                {modalTargetType === "collection_point" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 block">Measurement Orientation</label>
                    <select
                      value={formOrientation}
                      onChange={(e) => setFormOrientation(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
                    >
                      <option value="Horizontal">Horizontal</option>
                      <option value="Vertical">Vertical</option>
                      <option value="Axial">Axial</option>
                    </select>
                  </div>
                )}

              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 bg-slate-950 hover:bg-slate-850 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-lg text-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}

        </div>
      )}

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onImportComplete={() => {
          fetchPlants();
          if (currentPlant) fetchRoutes(currentPlant.id);
          showToast("✅ Data imported successfully!", "success");
        }}
        selectedCompanyId={selectedCompanyId}
      />

      {/* Add Custom Spec Modal */}
      {showAddCustomSpecModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] bg-black/80 backdrop-blur-sm animate-fade-in" id="add-custom-spec-modal-overlay">
          <div className="bg-[#0b1220] border border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl relative space-y-4">
            <button
              type="button"
              onClick={() => {
                setShowAddCustomSpecModal(false);
                setCustomSpecName("");
                setCustomSpecValue("");
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-yellow-400 font-mono uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-yellow-400" />
                <span>Add Custom Specification</span>
              </h4>
              <p className="text-[10px] text-slate-400 font-mono">
                Capture bespoke operational parameters.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                  Field Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., lube_oil_viscosity"
                  value={customSpecName}
                  onChange={e => setCustomSpecName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-yellow-400"
                />
                <p className="text-[9px] text-slate-500 font-mono">
                  Characters, numbers, or underscores only.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                  Value <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., ISO VG 46"
                  value={customSpecValue}
                  onChange={e => setCustomSpecValue(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddCustomSpecModal(false);
                  setCustomSpecName("");
                  setCustomSpecValue("");
                }}
                className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-850 text-slate-300 rounded-lg text-[10px] font-semibold cursor-pointer font-mono"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!customSpecName.trim() || !customSpecValue.trim()}
                onClick={() => {
                  const rawKey = customSpecName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/__+/g, "_");
                  if (!rawKey) {
                    showToast("❌ Field name cannot be empty", "error");
                    return;
                  }
                  if (isStandardKey(rawKey)) {
                    showToast(`❌ "${customSpecName}" is a standard field key`, "error");
                    return;
                  }
                  setFormSpecsObj(prev => ({
                    ...prev,
                    [rawKey]: customSpecValue.trim()
                  }));
                  setShowAddCustomSpecModal(false);
                  setCustomSpecName("");
                  setCustomSpecValue("");
                  showToast(`✅ Custom spec "${rawKey}" added!`, "success");
                }}
                className="px-3.5 py-1.5 bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-[10px] cursor-pointer font-mono"
              >
                Add Spec
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collection Point Manager Modal */}
      {isCPModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm" id="cp-modal-overlay">
          <div className="bg-[#0b1220] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <button
              type="button"
              onClick={() => setIsCPModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <MapPin className="h-4 w-4 text-emerald-400 animate-pulse" />
                Configure Collection Points
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Configure measurement locations for {currentComponent?.name}
              </p>
            </div>

            {cpModalStep === "config" ? (
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    How many points?
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={cpCountInput}
                    onChange={(e) => setCpCountInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-xl px-3.5 py-2 text-xs text-slate-200 font-semibold"
                    placeholder="e.g. 2 or 4"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCPModalOpen(false)}
                    className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={generateCPs}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Generate
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Point Names (Editable)
                  </span>
                  {cpPointsList.map((pt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-mono w-6 text-right">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={pt.name}
                        onChange={(e) => {
                          const updated = [...cpPointsList];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setCpPointsList(updated);
                        }}
                        className="flex-1 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-xl px-3.5 py-2 text-xs text-slate-200 font-semibold"
                        placeholder={`Point ${idx + 1}`}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 justify-between pt-2 border-t border-slate-850">
                  <button
                    type="button"
                    onClick={() => setCpModalStep("config")}
                    className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Back to Config
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCPModalOpen(false)}
                      className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveCPBatch}
                      disabled={savingCPs}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer"
                    >
                      {savingCPs ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
