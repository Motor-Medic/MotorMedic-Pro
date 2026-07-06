import React, { useState, useEffect } from "react";
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
  PlayCircle
} from "lucide-react";
import { useToast } from "./Toast";

interface AssetsProps {
  reports: SavedReport[];
  onSelectReport?: (report: SavedReport) => void;
  onStartDiagnosis?: (
    plantId: number,
    routeId: number,
    assetId: number,
    componentId: number,
    technologyType: string
  ) => void;
  selectedCompanyId?: number;
  setSelectedCompanyId?: (id: number) => void;
}

export default function Assets({ 
  reports, 
  onSelectReport, 
  onStartDiagnosis,
  selectedCompanyId = 1,
  setSelectedCompanyId = () => {}
}: AssetsProps) {
  const { showToast } = useToast();

  // --- Core States ---
  const [plants, setPlants] = useState<Plant[]>([]);
  const [routes, setRoutes] = useState<Record<number, RouteArea[]>>({});
  const [equipment, setEquipment] = useState<Record<number, Equipment[]>>({});
  const [components, setComponents] = useState<Record<number, ComponentAsset[]>>({});
  const [collectionPoints, setCollectionPoints] = useState<Record<number, any[]>>({});

  // Loading and Error States
  const [loadingPlants, setLoadingPlants] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState<Record<number, boolean>>({});
  const [loadingEquipment, setLoadingEquipment] = useState<Record<number, boolean>>({});
  const [loadingComponents, setLoadingComponents] = useState<Record<number, boolean>>({});
  const [loadingCollectionPoints, setLoadingCollectionPoints] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Tree Expansion States
  const [expandedPlants, setExpandedPlants] = useState<Record<number, boolean>>({});
  const [expandedRoutes, setExpandedRoutes] = useState<Record<number, boolean>>({});
  const [expandedEquipment, setExpandedEquipment] = useState<Record<number, boolean>>({});

  // Selection
  const [selectedItem, setSelectedItem] = useState<{
    type: "plant" | "route" | "equipment" | "component";
    data: any;
  } | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All"); // All, Healthy, Faults, Unknown
  const [filterType, setFilterType] = useState("All");
  const [filterCriticality, setFilterCriticality] = useState("All");

  // Diagnosis History Tab State
  const [historyTab, setHistoryTab] = useState<"All" | "Vibration" | "Thermal" | "Oil" | "Electrical">("All");

  // --- CRUD Modal States ---
  const [modalType, setModalType] = useState<"create" | "edit" | "delete" | null>(null);
  const [modalTargetType, setModalTargetType] = useState<"plant" | "route" | "equipment" | "component" | null>(null);
  const [modalParentId, setModalParentId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);

  // Form Fields
  const [formName, setFormName] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState("");
  const [formManufacturer, setFormManufacturer] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formSerialNumber, setFormSerialNumber] = useState("");
  const [formInstallDate, setFormInstallDate] = useState("");
  const [formCriticality, setFormCriticality] = useState("Medium");
  const [formStatus, setFormStatus] = useState("Active");
  const [formSpecs, setFormSpecs] = useState<Array<{ key: string; value: string }>>([
    { key: "Part Number", value: "" },
    { key: "Material", value: "" }
  ]);

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
      setError("Error communicating with server database. Using local fallback.");
    } finally {
      setLoadingPlants(false);
    }
  };

  const fetchRoutes = async (plantId: number) => {
    setLoadingRoutes(prev => ({ ...prev, [plantId]: true }));
    try {
      const res = await fetch(`/api/routes/${plantId}`);
      if (!res.ok) throw new Error("Failed to load routes");
      const data = await res.json();
      setRoutes(prev => ({ ...prev, [plantId]: data }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRoutes(prev => ({ ...prev, [plantId]: false }));
    }
  };

  const fetchEquipment = async (routeId: number) => {
    setLoadingEquipment(prev => ({ ...prev, [routeId]: true }));
    try {
      const res = await fetch(`/api/equipment/${routeId}`);
      if (!res.ok) throw new Error("Failed to load equipment");
      const data = await res.json();
      setEquipment(prev => ({ ...prev, [routeId]: data }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingEquipment(prev => ({ ...prev, [routeId]: false }));
    }
  };

  const fetchComponents = async (equipmentId: number) => {
    setLoadingComponents(prev => ({ ...prev, [equipmentId]: true }));
    try {
      const res = await fetch(`/api/components/${equipmentId}`);
      if (!res.ok) throw new Error("Failed to load components");
      const data = await res.json();
      setComponents(prev => ({ ...prev, [equipmentId]: data }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingComponents(prev => ({ ...prev, [equipmentId]: false }));
    }
  };

  const fetchCollectionPoints = async (componentId: number) => {
    setLoadingCollectionPoints(prev => ({ ...prev, [componentId]: true }));
    try {
      const res = await fetch(`/api/collection-points/component/${componentId}`);
      if (!res.ok) throw new Error("Failed to load collection points");
      const cpData = await res.json();
      
      const cpWithMps = await Promise.all(
        cpData.map(async (cp: any) => {
          try {
            const mpRes = await fetch(`/api/measurement-points/collection-point/${cp.id}`);
            if (mpRes.ok) {
              const mpData = await mpRes.json();
              return { ...cp, measurement_points: mpData };
            }
          } catch (e) {
            console.error(e);
          }
          return { ...cp, measurement_points: [] };
        })
      );

      setCollectionPoints(prev => ({ ...prev, [componentId]: cpWithMps }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCollectionPoints(prev => ({ ...prev, [componentId]: false }));
    }
  };

  const selectedType = selectedItem?.type;
  const selectedId = selectedItem?.data?.id;

  useEffect(() => {
    if (selectedType === "component" && selectedId) {
      fetchCollectionPoints(selectedId);
    }
  }, [selectedType, selectedId]);

  // --- Fetch initial data ---
  useEffect(() => {
    fetchPlants();
  }, [selectedCompanyId]);

  // --- Trigger lazy fetches on tree expand ---
  const togglePlant = (plantId: number) => {
    const nextVal = !expandedPlants[plantId];
    setExpandedPlants(prev => ({ ...prev, [plantId]: nextVal }));
    if (nextVal && !routes[plantId]) {
      fetchRoutes(plantId);
    }
  };

  const toggleRoute = (routeId: number) => {
    const nextVal = !expandedRoutes[routeId];
    setExpandedRoutes(prev => ({ ...prev, [routeId]: nextVal }));
    if (nextVal && !equipment[routeId]) {
      fetchEquipment(routeId);
    }
  };

  const toggleEquipment = (equipmentId: number) => {
    const nextVal = !expandedEquipment[equipmentId];
    setExpandedEquipment(prev => ({ ...prev, [equipmentId]: nextVal }));
    if (nextVal && !components[equipmentId]) {
      fetchComponents(equipmentId);
    }
  };

  // --- Equipment Status Logic ---
  const getEquipmentStatus = (equip: Equipment) => {
    // 1. Check matched reports in cache
    const matched = reports.filter(r => {
      const rName = (r.specs?.equipmentName || "").toLowerCase();
      const eName = equip.name.toLowerCase();
      return rName.includes(eName) || eName.includes(rName);
    });

    if (matched.length === 0) {
      return { status: "Unknown", color: "text-slate-400 bg-slate-400/10 border-slate-400/20", dotColor: "bg-slate-400" };
    }

    // Sort by date (newest first)
    const sorted = [...matched].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = sorted[0];
    const status = latest.data?.equipment_status || "Unknown";

    if (status === "HEALTHY") {
      return { status: "Healthy", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", dotColor: "bg-emerald-400" };
    } else {
      return { status: "Fault", color: "text-rose-400 bg-rose-500/10 border-rose-500/20", dotColor: "bg-rose-400" };
    }
  };

  // --- Equipment Icon Matcher ---
  const getEquipmentIcon = (type: string) => {
    const lower = (type || "").toLowerCase();
    if (lower.includes("motor") || lower.includes("electric")) return <Cpu className="w-4 h-4 text-cyan-400" />;
    if (lower.includes("pump")) return <Droplets className="w-4 h-4 text-sky-400" />;
    if (lower.includes("fan") || lower.includes("blower")) return <Wind className="w-4 h-4 text-emerald-400" />;
    if (lower.includes("compressor")) return <Activity className="w-4 h-4 text-amber-400" />;
    if (lower.includes("gearbox") || lower.includes("transmission")) return <Sliders className="w-4 h-4 text-purple-400" />;
    if (lower.includes("generator") || lower.includes("power")) return <Zap className="w-4 h-4 text-yellow-400" />;
    return <Wrench className="w-4 h-4 text-slate-400" />;
  };

  // --- Search & Filter Matching logic on the equipment level ---
  // To show search results cleanly, we can filter plants and routes that contain matching equipment,
  // or show all hierarchy but flag matching assets. Let's do a smart filter:
  // If query is empty and no filters, show everything.
  // If filtering, we check if equipment fits query + filters.
  const isEquipmentMatching = (equip: Equipment) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = equip.name.toLowerCase().includes(q);
      const matchType = (equip.type || "").toLowerCase().includes(q);
      const matchSerial = (equip.serial_number || "").toLowerCase().includes(q);
      const matchManufacturer = (equip.manufacturer || "").toLowerCase().includes(q);
      if (!matchName && !matchType && !matchSerial && !matchManufacturer) return false;
    }

    if (filterType !== "All") {
      if (!(equip.type || "").toLowerCase().includes(filterType.toLowerCase())) return false;
    }

    if (filterCriticality !== "All") {
      if ((equip.criticality || "").toLowerCase() !== filterCriticality.toLowerCase()) return false;
    }

    if (filterStatus !== "All") {
      const calc = getEquipmentStatus(equip);
      if (filterStatus === "Healthy" && calc.status !== "Healthy") return false;
      if (filterStatus === "Faults" && calc.status !== "Fault") return false;
      if (filterStatus === "Unknown" && calc.status !== "Unknown") return false;
    }

    return true;
  };

  // --- Form & Action Handlers ---
  const openCreateModal = (targetType: "plant" | "route" | "equipment" | "component" | "collection_point", parentId: number | null) => {
    setModalType("create");
    setModalTargetType(targetType);
    setModalParentId(parentId);
    setEditingItem(null);

    // Reset fields
    setFormName("");
    setFormLocation("");
    setFormDescription("");
    setFormType(targetType === "equipment" ? "Electric Motor" : targetType === "component" ? "Bearing" : "");
    setFormManufacturer("");
    setFormModel("");
    setFormSerialNumber("");
    setFormInstallDate(new Date().toISOString().split("T")[0]);
    setFormCriticality("Medium");
    setFormStatus("Active");
    setFormSpecs([
      { key: "Part Number", value: "" },
      { key: "Material", value: "" }
    ]);
  };

  const openEditModal = (targetType: "plant" | "route" | "equipment" | "component" | "collection_point", item: any) => {
    setModalType("edit");
    setModalTargetType(targetType);
    setEditingItem(item);
    setModalParentId(null);

    setFormName(item.name || "");
    setFormLocation(item.location || "");
    setFormDescription(item.description || item.notes || "");
    setFormType(item.type || "");
    setFormManufacturer(item.manufacturer || "");
    setFormModel(item.model || "");
    setFormSerialNumber(item.serial_number || "");
    setFormInstallDate(item.install_date ? item.install_date.substring(0, 10) : "");
    setFormCriticality(item.criticality || "Medium");
    setFormStatus(item.status || "Active");

    if (item.specifications) {
      const entries = Object.entries(item.specifications).map(([k, v]) => ({ key: k, value: String(v) }));
      setFormSpecs(entries.length > 0 ? entries : [{ key: "Part Number", value: "" }]);
    } else {
      setFormSpecs([{ key: "Part Number", value: "" }]);
    }
  };

  const openDeleteModal = (targetType: "plant" | "route" | "equipment" | "component" | "collection_point", item: any) => {
    setModalType("delete");
    setModalTargetType(targetType);
    setEditingItem(item);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    try {
      if (modalType === "create") {
        let url = "";
        let body: any = {};

        if (modalTargetType === "plant") {
          url = "/api/plants";
          body = { name: formName, location: formLocation, company_id: selectedCompanyId };
        } else if (modalTargetType === "route") {
          url = "/api/routes";
          body = { plant_id: modalParentId, name: formName, description: formDescription };
        } else if (modalTargetType === "equipment") {
          url = "/api/equipment";
          body = {
            route_id: modalParentId,
            name: formName,
            type: formType,
            manufacturer: formManufacturer,
            model: formModel,
            serial_number: formSerialNumber,
            install_date: formInstallDate,
            criticality: formCriticality,
            status: formStatus
          };
        } else if (modalTargetType === "component") {
          url = "/api/components";
          const specsObj: Record<string, string> = {};
          formSpecs.forEach(spec => {
            if (spec.key.trim()) {
              specsObj[spec.key.trim()] = spec.value;
            }
          });
          body = {
            equipment_id: modalParentId,
            name: formName,
            type: formType,
            specifications: specsObj
          };
        } else if (modalTargetType === "collection_point") {
          url = "/api/collection-points";
          body = {
            component_id: modalParentId,
            name: formName,
            location_order: 1,
            notes: formDescription
          };
        }

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        if (!res.ok) throw new Error("Failed to create asset");
        
        // Refresh appropriate branch
        if (modalTargetType === "plant") {
          fetchPlants();
        } else if (modalTargetType === "route" && modalParentId) {
          fetchRoutes(modalParentId);
        } else if (modalTargetType === "equipment" && modalParentId) {
          fetchEquipment(modalParentId);
        } else if (modalTargetType === "component" && modalParentId) {
          fetchComponents(modalParentId);
        } else if (modalTargetType === "collection_point" && modalParentId) {
          fetchCollectionPoints(modalParentId);
        }

      } else if (modalType === "edit" && editingItem) {
        let url = "";
        let body: any = {};

        if (modalTargetType === "plant") {
          url = `/api/plants/${editingItem.id}`;
          body = { name: formName, location: formLocation };
        } else if (modalTargetType === "route") {
          url = `/api/routes/${editingItem.id}`;
          body = { name: formName, description: formDescription };
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
            status: formStatus
          };
        } else if (modalTargetType === "component") {
          url = `/api/components/${editingItem.id}`;
          const specsObj: Record<string, string> = {};
          formSpecs.forEach(spec => {
            if (spec.key.trim()) {
              specsObj[spec.key.trim()] = spec.value;
            }
          });
          body = {
            name: formName,
            type: formType,
            specifications: specsObj
          };
        } else if (modalTargetType === "collection_point") {
          url = `/api/collection-points/${editingItem.id}`;
          body = {
            name: formName,
            location_order: editingItem.location_order || 1,
            notes: formDescription
          };
        }

        const res = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        if (!res.ok) throw new Error("Failed to update asset");
        const updated = await res.json();

        // Update active details panel if selected
        if (selectedItem && selectedItem.type === modalTargetType && selectedItem.data.id === editingItem.id) {
          setSelectedItem({ type: modalTargetType as any, data: updated });
        }

        // Refresh lists
        if (modalTargetType === "plant") {
          fetchPlants();
        } else if (modalTargetType === "route") {
          fetchPlants().then(() => {
            if (editingItem.plant_id) fetchRoutes(editingItem.plant_id);
          });
        } else if (modalTargetType === "equipment") {
          if (editingItem.route_id) fetchEquipment(editingItem.route_id);
        } else if (modalTargetType === "component") {
          if (editingItem.equipment_id) fetchComponents(editingItem.equipment_id);
        } else if (modalTargetType === "collection_point") {
          if (editingItem.component_id) fetchCollectionPoints(editingItem.component_id);
        }
      }

      setModalType(null);
      showToast(`Success: Asset saved successfully!`, "success");
    } catch (err: any) {
      console.error(err);
      showToast(`Error: ${err.message || "Failed to save asset."}`, "error");
    }
  };

  const handleDeleteSubmit = async () => {
    if (!editingItem || !modalTargetType) return;

    try {
      let url = "";
      if (modalTargetType === "collection_point") {
        url = `/api/collection-points/${editingItem.id}`;
      } else {
        url = `/api/${modalTargetType === "route" ? "routes" : modalTargetType === "component" ? "components" : modalTargetType}s/${editingItem.id}`;
      }
      
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete operation failed");

      // Clear details panel if we deleted the currently selected item
      if (selectedItem && selectedItem.type === modalTargetType && selectedItem.data.id === editingItem.id) {
        setSelectedItem(null);
      }

      // Refresh appropriate lists
      if (modalTargetType === "plant") {
        fetchPlants();
      } else if (modalTargetType === "route") {
        if (editingItem.plant_id) fetchRoutes(editingItem.plant_id);
      } else if (modalTargetType === "equipment") {
        if (editingItem.route_id) fetchEquipment(editingItem.route_id);
      } else if (modalTargetType === "component") {
        if (editingItem.equipment_id) fetchComponents(editingItem.equipment_id);
      } else if (modalTargetType === "collection_point") {
        if (editingItem.component_id) fetchCollectionPoints(editingItem.component_id);
      }

      setModalType(null);
      showToast(`Success: Asset deleted successfully!`, "success");
    } catch (err: any) {
      console.error(err);
      showToast(`Error: ${err.message || "Failed to delete asset."}`, "error");
    }
  };

  // Specification field handlers
  const handleSpecChange = (index: number, field: "key" | "value", value: string) => {
    const next = [...formSpecs];
    next[index][field] = value;
    setFormSpecs(next);
  };

  const addSpecRow = () => {
    setFormSpecs(prev => [...prev, { key: "", value: "" }]);
  };

  const removeSpecRow = (index: number) => {
    setFormSpecs(prev => prev.filter((_, i) => i !== index));
  };

  // --- Filtering Equipment Logic for Combined Lists ---
  const getMatchingEquipmentHistory = (equip: Equipment) => {
    const matched = reports.filter(r => {
      const rName = (r.specs?.equipmentName || "").toLowerCase();
      const eName = equip.name.toLowerCase();
      return rName.includes(eName) || eName.includes(rName);
    });

    // Match technology
    return matched.filter(r => {
      if (historyTab === "All") return true;
      const tech = (r.category || "").toLowerCase();
      if (historyTab === "Vibration" && tech.includes("mechanical")) return true;
      if (historyTab === "Thermal" && tech.includes("thermal")) return true;
      if (historyTab === "Oil" && tech.includes("oil")) return true;
      if (historyTab === "Electrical" && tech.includes("electrical")) return true;
      return false;
    });
  };

  // Count matches
  const totalMatchingCount = plants.reduce((acc, plant) => {
    const plantRoutes = routes[plant.id] || [];
    const count = plantRoutes.reduce((acc2, route) => {
      const routeEquip = equipment[route.id] || [];
      const matchCount = routeEquip.filter(isEquipmentMatching).length;
      return acc2 + matchCount;
    }, 0);
    return acc + count;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Company Selection Header Card */}
      <div className="bg-slate-900/60 border border-slate-850 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-400/10 rounded-xl border border-yellow-400/20">
            <Sliders className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <label htmlFor="company-select" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Tenant Company Context
            </label>
            <span className="text-xs text-slate-500">Isolate plants, routes, and machinery assets by organization.</span>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400 whitespace-nowrap font-medium">Select Company:</span>
          <select
            id="company-select"
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(parseInt(e.target.value, 10))}
            className="w-full sm:w-56 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-100 text-xs font-semibold rounded-xl px-3.5 py-2 focus:outline-none focus:ring-1 focus:ring-yellow-400/30 cursor-pointer"
          >
            <option value={1}>Allied Reliability</option>
            <option value={2}>ExxonMobil</option>
          </select>
        </div>
      </div>

      {/* Page Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-yellow-400" />
            Equipment Database
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Browse and manage industrial assets in a hierarchical CMMS plant structure.
          </p>
        </div>

        <button
          onClick={() => openCreateModal("plant", null)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-lg transition-all shadow"
        >
          <Plus className="w-4 h-4" />
          Add Plant Facility
        </button>
      </div>

      {/* Search & Filters Card */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search assets by name, tag, model or serial number..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-yellow-400/50"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 shrink-0">
            {/* Filter Status */}
            <div className="flex items-center bg-slate-950 border border-slate-850 rounded-xl px-2.5">
              <span className="text-[10px] text-slate-500 mr-1.5 hidden lg:inline">Status:</span>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="bg-transparent text-slate-300 text-xs focus:outline-none cursor-pointer py-2"
              >
                <option value="All">All Status</option>
                <option value="Healthy">Healthy</option>
                <option value="Faults">Faults</option>
                <option value="Unknown">Not Monitored</option>
              </select>
            </div>

            {/* Filter Criticality */}
            <div className="flex items-center bg-slate-950 border border-slate-850 rounded-xl px-2.5">
              <span className="text-[10px] text-slate-500 mr-1.5 hidden lg:inline">Crit:</span>
              <select
                value={filterCriticality}
                onChange={e => setFilterCriticality(e.target.value)}
                className="bg-transparent text-slate-300 text-xs focus:outline-none cursor-pointer py-2"
              >
                <option value="All">All Criticality</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            {/* Filter Type */}
            <div className="flex items-center bg-slate-950 border border-slate-850 rounded-xl px-2.5">
              <span className="text-[10px] text-slate-500 mr-1.5 hidden lg:inline">Type:</span>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="bg-transparent text-slate-300 text-xs focus:outline-none cursor-pointer py-2"
              >
                <option value="All">All Types</option>
                <option value="Motor">Motor</option>
                <option value="Pump">Pump</option>
                <option value="Fan">Fan</option>
                <option value="Compressor">Compressor</option>
                <option value="Gearbox">Gearbox</option>
              </select>
            </div>
          </div>
        </div>

        {(searchQuery || filterStatus !== "All" || filterType !== "All" || filterCriticality !== "All") && (
          <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-950/40 p-2 rounded-lg border border-slate-850">
            <span>Filtered result matches <strong className="text-yellow-400">{totalMatchingCount}</strong> equipment item(s).</span>
            <button
              onClick={() => {
                setSearchQuery("");
                setFilterStatus("All");
                setFilterType("All");
                setFilterCriticality("All");
              }}
              className="text-xs text-yellow-400 hover:underline font-semibold"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Split-pane view */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Tree Pane (40%) */}
        <div className="lg:col-span-5 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 min-h-[500px]">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Plant Hierarchy</span>
            <button
              onClick={fetchPlants}
              className="p-1 text-slate-500 hover:text-white transition-all"
              title="Refresh database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPlants ? "animate-spin" : ""}`} />
            </button>
          </div>

          {loadingPlants && plants.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs font-mono">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-yellow-400" />
              Fetching facility assets...
            </div>
          ) : plants.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-slate-800 rounded-xl">
              <Folder className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-slate-400 text-xs">No plant facilities registered.</p>
              <button
                onClick={() => openCreateModal("plant", null)}
                className="mt-3 px-3 py-1.5 bg-yellow-400 text-slate-950 text-[11px] font-bold rounded-lg hover:bg-yellow-500"
              >
                Register First Facility
              </button>
            </div>
          ) : (
            <div className="space-y-3 font-mono text-xs select-none">
              {plants.map(plant => {
                const isPlantExpanded = expandedPlants[plant.id];
                const plantRoutes = routes[plant.id] || [];
                const isLoadingRoutes = loadingRoutes[plant.id];

                return (
                  <div key={plant.id} className="border border-slate-800/60 rounded-xl p-1 bg-slate-950/20">
                    {/* Level 1: Plant Row */}
                    <div 
                      onClick={() => {
                        togglePlant(plant.id);
                        setSelectedItem({ type: "plant", data: plant });
                      }}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all hover:bg-slate-900 ${
                        selectedItem?.type === "plant" && selectedItem?.data.id === plant.id ? "bg-slate-900 border border-slate-800" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isPlantExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                        <Folder className="w-4 h-4 text-yellow-500 shrink-0" />
                        <span className="font-bold text-slate-200">{plant.name}</span>
                        {plant.location && <span className="text-[10px] text-slate-500 hidden sm:inline">({plant.location})</span>}
                      </div>

                      {/* Level 1 Action Buttons */}
                      <div className="flex items-center gap-1 opacity-60 hover:opacity-100" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => openCreateModal("route", plant.id)}
                          className="p-1 hover:text-emerald-400 rounded transition-all"
                          title="Add Area/Route"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal("plant", plant)}
                          className="p-1 hover:text-sky-400 rounded transition-all"
                          title="Edit"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openDeleteModal("plant", plant)}
                          className="p-1 hover:text-rose-400 rounded transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Level 2: Routes/Areas Container */}
                    {isPlantExpanded && (
                      <div className="pl-4 pr-1 py-1 space-y-2 border-l border-slate-850 mt-1 ml-4">
                        {isLoadingRoutes ? (
                          <div className="text-[10px] text-slate-500 p-2">Loading area routes...</div>
                        ) : plantRoutes.length === 0 ? (
                          <div className="text-[10px] text-slate-500 p-2 italic">No routes defined.</div>
                        ) : (
                          plantRoutes.map(route => {
                            const isRouteExpanded = expandedRoutes[route.id];
                            const routeEquip = equipment[route.id] || [];
                            const isLoadingEquip = loadingEquipment[route.id];

                            return (
                              <div key={route.id} className="space-y-1">
                                {/* Route Row */}
                                <div
                                  onClick={() => {
                                    toggleRoute(route.id);
                                    setSelectedItem({ type: "route", data: route });
                                  }}
                                  className={`flex items-center justify-between p-1.5 rounded-md cursor-pointer hover:bg-slate-900 ${
                                    selectedItem?.type === "route" && selectedItem?.data.id === route.id ? "bg-slate-900" : ""
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    {isRouteExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                                    <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                    <span className="text-slate-300 font-medium">{route.name}</span>
                                  </div>

                                  {/* Level 2 Action Buttons */}
                                  <div className="flex items-center gap-1 opacity-40 hover:opacity-100" onClick={e => e.stopPropagation()}>
                                    <button
                                      onClick={() => openCreateModal("equipment", route.id)}
                                      className="p-1 hover:text-emerald-400 rounded transition-all"
                                      title="Add Equipment"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => openEditModal("route", route)}
                                      className="p-1 hover:text-sky-400 rounded transition-all"
                                      title="Edit"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => openDeleteModal("route", route)}
                                      className="p-1 hover:text-rose-400 rounded transition-all"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Level 3: Equipment Container */}
                                {isRouteExpanded && (
                                  <div className="pl-4 py-1 space-y-1 border-l border-slate-850 ml-3">
                                    {isLoadingEquip ? (
                                      <div className="text-[10px] text-slate-500 p-1">Loading equipment...</div>
                                    ) : routeEquip.length === 0 ? (
                                      <div className="text-[10px] text-slate-500 p-1 italic">No equipment defined.</div>
                                    ) : (
                                      routeEquip.map(equip => {
                                        const isMatching = isEquipmentMatching(equip);
                                        const isEquipExpanded = expandedEquipment[equip.id];
                                        const equipComp = components[equip.id] || [];
                                        const isLoadingComp = loadingComponents[equip.id];
                                        const statusObj = getEquipmentStatus(equip);

                                        return (
                                          <div 
                                            key={equip.id} 
                                            className={`space-y-1 rounded transition-all ${isMatching ? "" : "opacity-35 hover:opacity-100"}`}
                                          >
                                            {/* Equipment Row */}
                                            <div
                                              onClick={() => {
                                                toggleEquipment(equip.id);
                                                setSelectedItem({ type: "equipment", data: equip });
                                              }}
                                              className={`flex items-center justify-between p-1.5 rounded cursor-pointer hover:bg-slate-900/80 ${
                                                selectedItem?.type === "equipment" && selectedItem?.data.id === equip.id ? "bg-slate-900 border border-slate-800" : ""
                                              }`}
                                            >
                                              <div className="flex items-center gap-1.5 min-w-0">
                                                {/* Expand chevron */}
                                                {isEquipExpanded ? <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />}
                                                
                                                {/* Equipment status indicator */}
                                                <span 
                                                  className={`w-2 h-2 rounded-full shrink-0 ${statusObj.dotColor}`} 
                                                  title={`Status: ${statusObj.status}`}
                                                />

                                                {/* Equipment type icon */}
                                                {getEquipmentIcon(equip.type)}

                                                <span className="text-slate-300 font-medium truncate" title={equip.name}>
                                                  {equip.name}
                                                </span>
                                              </div>

                                              {/* Level 3 Actions */}
                                              <div className="flex items-center gap-1 opacity-20 hover:opacity-100" onClick={e => e.stopPropagation()}>
                                                <button
                                                  onClick={() => openCreateModal("component", equip.id)}
                                                  className="p-1 hover:text-emerald-400 rounded transition-all"
                                                  title="Add Component"
                                                >
                                                  <Plus className="w-3 h-3" />
                                                </button>
                                                <button
                                                  onClick={() => openEditModal("equipment", equip)}
                                                  className="p-1 hover:text-sky-400 rounded transition-all"
                                                  title="Edit"
                                                >
                                                  <Edit3 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  onClick={() => openDeleteModal("equipment", equip)}
                                                  className="p-1 hover:text-rose-400 rounded transition-all"
                                                  title="Delete"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            </div>

                                            {/* Level 4: Components Container */}
                                            {isEquipExpanded && (
                                              <div className="pl-5 py-0.5 space-y-1 border-l border-slate-850 ml-3">
                                                {isLoadingComp ? (
                                                  <div className="text-[9px] text-slate-600 p-0.5">Loading components...</div>
                                                ) : equipComp.length === 0 ? (
                                                  <div className="text-[9px] text-slate-600 p-0.5 italic">No components.</div>
                                                ) : (
                                                  equipComp.map(comp => (
                                                    <div
                                                      key={comp.id}
                                                      onClick={() => setSelectedItem({ type: "component", data: comp })}
                                                      className={`flex items-center justify-between p-1 rounded text-[11px] cursor-pointer hover:bg-slate-900 ${
                                                        selectedItem?.type === "component" && selectedItem?.data.id === comp.id ? "bg-slate-900 border border-slate-850" : "text-slate-400"
                                                      }`}
                                                    >
                                                      <div className="flex items-center gap-1">
                                                        <Settings className="w-3 h-3 text-slate-500" />
                                                        <span>{comp.name}</span>
                                                        {comp.type && <span className="text-[9px] text-slate-600 font-mono">({comp.type})</span>}
                                                      </div>

                                                      {/* Component Actions */}
                                                      <div className="flex items-center gap-1 opacity-0 hover:opacity-100" onClick={e => e.stopPropagation()}>
                                                        <button
                                                          onClick={() => openEditModal("component", comp)}
                                                          className="p-1 hover:text-sky-400 rounded transition-all"
                                                          title="Edit"
                                                        >
                                                          <Edit3 className="w-3 h-3" />
                                                        </button>
                                                        <button
                                                          onClick={() => openDeleteModal("component", comp)}
                                                          className="p-1 hover:text-rose-400 rounded transition-all"
                                                          title="Delete"
                                                        >
                                                          <Trash2 className="w-3 h-3" />
                                                        </button>
                                                      </div>
                                                    </div>
                                                  ))
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Details Panel (60%) */}
        <div className="lg:col-span-7 bg-[#0c1220]/75 border border-slate-900/80 rounded-2xl p-5 min-h-[500px]">
          {selectedItem ? (
            <div className="space-y-6">
              {/* Heading */}
              <div className="flex items-start justify-between border-b border-slate-800/80 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                      {selectedItem.type}
                    </span>
                    {selectedItem.type === "equipment" && (
                      <span className={`px-2 py-0.5 text-[10px] rounded-full border ${getEquipmentStatus(selectedItem.data).color}`}>
                        {getEquipmentStatus(selectedItem.data).status.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-white mt-2 flex items-center gap-2 font-display">
                    {selectedItem.type === "plant" && <Folder className="w-5 h-5 text-yellow-400" />}
                    {selectedItem.type === "route" && <Layers className="w-5 h-5 text-indigo-400" />}
                    {selectedItem.type === "equipment" && getEquipmentIcon(selectedItem.data.type)}
                    {selectedItem.type === "component" && <Settings className="w-5 h-5 text-slate-400" />}
                    {selectedItem.data.name}
                  </h3>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEditModal(selectedItem.type, selectedItem.data)}
                    className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-all"
                    title={`Edit ${selectedItem.type}`}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openDeleteModal(selectedItem.type, selectedItem.data)}
                    className="p-2 bg-slate-900 hover:bg-slate-800 text-rose-400 rounded-xl border border-slate-800 transition-all"
                    title={`Delete ${selectedItem.type}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Plant details */}
              {selectedItem.type === "plant" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-900">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Location Address</span>
                      <span className="text-sm font-semibold text-white mt-1 block">
                        {selectedItem.data.location || "N/A"}
                      </span>
                    </div>
                    <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-900">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Registered On</span>
                      <span className="text-sm font-semibold text-slate-300 mt-1 block">
                        {new Date(selectedItem.data.created_at || Date.now()).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-3">Facility Areas/Routes</h4>
                    {routes[selectedItem.data.id]?.length > 0 ? (
                      <div className="space-y-2">
                        {routes[selectedItem.data.id].map(r => (
                          <div 
                            key={r.id} 
                            onClick={() => setSelectedItem({ type: "route", data: r })}
                            className="p-2.5 bg-slate-950/80 hover:bg-slate-900 border border-slate-850 rounded-lg flex justify-between items-center cursor-pointer transition-all text-xs"
                          >
                            <span className="font-semibold text-slate-200">{r.name}</span>
                            <span className="text-slate-500 text-[10px] max-w-[200px] truncate">{r.description || "No description"}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">No routes defined for this facility. Click the (+) button on the plant node to add one.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Route details */}
              {selectedItem.type === "route" && (
                <div className="space-y-4">
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-900">
                    <span className="text-[10px] text-slate-500 block uppercase font-mono">Route Description</span>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {selectedItem.data.description || "No description provided for this area route."}
                    </p>
                  </div>

                  <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-3">Equipment in Route</h4>
                    {equipment[selectedItem.data.id]?.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {equipment[selectedItem.data.id].map(e => {
                          const status = getEquipmentStatus(e);
                          return (
                            <div 
                              key={e.id} 
                              onClick={() => setSelectedItem({ type: "equipment", data: e })}
                              className="p-2.5 bg-slate-950/80 hover:bg-slate-900 border border-slate-850 rounded-lg flex items-center justify-between cursor-pointer transition-all text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${status.dotColor}`} />
                                {getEquipmentIcon(e.type)}
                                <span className="font-semibold text-slate-200">{e.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 px-1.5 py-0.5 bg-slate-900 rounded border border-slate-800">
                                {e.criticality || "Medium"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">No equipment assets defined in this area. Click the (+) button on the route node to add one.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Equipment details */}
              {selectedItem.type === "equipment" && (
                <div className="space-y-6">
                  {/* Info Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                      <span className="text-[9px] text-slate-500 uppercase font-mono">Type</span>
                      <span className="text-xs font-semibold text-slate-200 mt-1 block truncate">
                        {selectedItem.data.type || "Other"}
                      </span>
                    </div>
                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                      <span className="text-[9px] text-slate-500 uppercase font-mono">Manufacturer</span>
                      <span className="text-xs font-semibold text-slate-200 mt-1 block truncate">
                        {selectedItem.data.manufacturer || "N/A"}
                      </span>
                    </div>
                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                      <span className="text-[9px] text-slate-500 uppercase font-mono">Model</span>
                      <span className="text-xs font-semibold text-slate-200 mt-1 block truncate">
                        {selectedItem.data.model || "N/A"}
                      </span>
                    </div>
                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                      <span className="text-[9px] text-slate-500 uppercase font-mono">Serial Number</span>
                      <span className="text-xs font-mono font-semibold text-slate-200 mt-1 block truncate">
                        {selectedItem.data.serial_number || "N/A"}
                      </span>
                    </div>
                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                      <span className="text-[9px] text-slate-500 uppercase font-mono">Install Date</span>
                      <span className="text-xs font-semibold text-slate-200 mt-1 block truncate">
                        {selectedItem.data.install_date ? new Date(selectedItem.data.install_date).toLocaleDateString() : "N/A"}
                      </span>
                    </div>
                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                      <span className="text-[9px] text-slate-500 uppercase font-mono">Criticality</span>
                      <span className="text-xs font-semibold mt-1 block">
                        <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                          selectedItem.data.criticality === "High" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                          selectedItem.data.criticality === "Low" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}>
                          {selectedItem.data.criticality || "Medium"}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Components List */}
                  <div className="bg-slate-950/20 border border-slate-900 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-slate-900">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Monitored Components</h4>
                      <button
                        onClick={() => openCreateModal("component", selectedItem.data.id)}
                        className="text-[11px] text-yellow-400 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Plus className="w-3 h-3" /> Add Component
                      </button>
                    </div>

                    {components[selectedItem.data.id]?.length > 0 ? (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        {components[selectedItem.data.id].map(c => (
                          <div
                            key={c.id}
                            onClick={() => setSelectedItem({ type: "component", data: c })}
                            className="p-2 bg-slate-950/80 hover:bg-slate-900 border border-slate-850 rounded-lg flex items-center justify-between cursor-pointer text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <Settings className="w-3.5 h-3.5 text-slate-500" />
                              <span className="font-semibold text-slate-200">{c.name}</span>
                              {c.type && <span className="text-[10px] text-slate-500">({c.type})</span>}
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic py-2">No components defined. Add bearings, couplings, seals, or gearboxes to track detailed point structures.</p>
                    )}
                  </div>

                  {/* Diagnostic / Analysis History */}
                  <div className="bg-slate-950/20 border border-slate-900 rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-slate-500" />
                        Analysis History
                      </h4>
                    </div>

                    {/* Technology Tabs */}
                    <div className="flex gap-1.5 border-b border-slate-850 pb-2 overflow-x-auto text-[10px] font-mono custom-scrollbar">
                      {["All", "Vibration", "Thermal", "Oil", "Electrical"].map(tab => (
                        <button
                          key={tab}
                          onClick={() => setHistoryTab(tab as any)}
                          className={`px-2.5 py-1 rounded transition-all shrink-0 font-bold ${
                            historyTab === tab 
                              ? "bg-yellow-400 text-slate-950" 
                              : "bg-slate-900 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {tab.toUpperCase()}
                        </button>
                      ))}
                    </div>

                    {/* Chronological History List */}
                    <div className="space-y-2">
                      {getMatchingEquipmentHistory(selectedItem.data).length > 0 ? (
                        getMatchingEquipmentHistory(selectedItem.data).map(report => {
                          const severity = report.data?.manager_summary?.severity || "Low";
                          const isHigh = severity === "Critical" || severity === "High";

                          return (
                            <div 
                              key={report.id}
                              className="p-3 bg-slate-950/80 border border-slate-850 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] text-slate-400">{report.date}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    isHigh ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  }`}>
                                    {severity.toUpperCase()}
                                  </span>
                                </div>
                                <p className="mt-1 font-semibold text-slate-200">
                                  {report.data?.probable_faults?.[0]?.fault_name || "Diagnostic scan logged"}
                                </p>
                              </div>

                              <button
                                onClick={() => onSelectReport && onSelectReport(report)}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-yellow-400 hover:underline shrink-0"
                              >
                                <PlayCircle className="w-3.5 h-3.5" />
                                View Report
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-6 text-center border border-dashed border-slate-850 rounded-lg">
                          <Info className="w-5 h-5 text-slate-600 mx-auto mb-1.5" />
                          <p className="text-slate-500 text-xs">No analysis reports logged for this equipment.</p>
                          <p className="text-[10px] text-slate-600 mt-1">To record diagnostics, run a diagnostic scan on the "Run Diagnostics" tab and specify this asset's nameplate name.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Component details */}
              {selectedItem.type === "component" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-900">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Component Type</span>
                      <span className="text-sm font-semibold text-white mt-1 block">
                        {selectedItem.data.type || "N/A"}
                      </span>
                    </div>
                    <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-900">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Registered On</span>
                      <span className="text-sm font-semibold text-slate-300 mt-1 block">
                        {new Date(selectedItem.data.created_at || Date.now()).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-3">Specifications Parameters</h4>
                    {selectedItem.data.specifications && Object.keys(selectedItem.data.specifications).length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {Object.entries(selectedItem.data.specifications).map(([key, val]) => (
                          <div key={key} className="p-2.5 bg-slate-950/80 border border-slate-850 rounded-lg flex flex-col">
                            <span className="text-[10px] text-slate-500 uppercase font-mono">{key}</span>
                            <span className="font-semibold text-slate-200 mt-0.5">{String(val)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">No custom specifications parameters defined for this component.</p>
                    )}
                  </div>

                  {/* Condition Monitoring Technologies Table */}
                  <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-cyan-400" />
                        Condition Monitoring Technologies
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-900 text-slate-500 uppercase font-mono text-[9px] tracking-wider">
                            <th className="py-2 px-3">Technology</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/60 font-medium">
                          {[
                            { id: "Vibration", label: "Vibration Analysis", icon: "📊", status: "Healthy", color: "text-emerald-400" },
                            { id: "Thermal", label: "Infrared Thermography", icon: "🌡️", status: "Healthy", color: "text-emerald-400" },
                            { id: "Oil", label: "Oil Analysis", icon: "🧪", status: "Healthy", color: "text-emerald-400" },
                            { id: "Electrical", label: "Motor Circuit Analysis (MCA)", icon: "⚡", status: "Healthy", color: "text-emerald-400" }
                          ].map((tech) => (
                            <tr key={tech.id} className="hover:bg-slate-950/30 transition-colors">
                              <td className="py-2.5 px-3 flex items-center gap-2">
                                <span className="text-base">{tech.icon}</span>
                                <span className="text-slate-200 font-semibold">{tech.label}</span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`flex items-center gap-1.5 ${tech.color}`}>
                                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                  {tech.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="inline-flex items-center gap-2">
                                  {/* DataGrid Icon */}
                                  <button
                                    type="button"
                                    title="View Datagrid"
                                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-900 rounded transition-all"
                                  >
                                    <Database className="w-3.5 h-3.5" />
                                  </button>
                                  {/* Manage Icon */}
                                  <button
                                    type="button"
                                    title="Manage Setup"
                                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-900 rounded transition-all"
                                  >
                                    <Sliders className="w-3.5 h-3.5" />
                                  </button>
                                  {/* Run Diagnosis Button */}
                                  <button
                                    type="button"
                                    title="Run Diagnosis"
                                    onClick={() => {
                                      const componentId = selectedItem.data.id;
                                      const assetId = selectedItem.data.equipment_id || selectedItem.data.asset_id;
                                      
                                      let routeId = null;
                                      let plantId = null;
                                      
                                      for (const [rIdStr, eqList] of Object.entries(equipment)) {
                                        const foundEq = (eqList as any).find((eq: any) => eq.id === assetId);
                                        if (foundEq) {
                                          routeId = Number(rIdStr);
                                          for (const [pIdStr, rList] of Object.entries(routes)) {
                                            const foundRt = (rList as any).find((rt: any) => rt.id === routeId);
                                            if (foundRt) {
                                              plantId = Number(pIdStr);
                                              break;
                                            }
                                          }
                                          break;
                                        }
                                      }

                                      if (onStartDiagnosis) {
                                        onStartDiagnosis(
                                          plantId || 1, 
                                          routeId || 1, 
                                          assetId || 1, 
                                          componentId, 
                                          tech.id
                                        );
                                      }
                                    }}
                                    className="px-2.5 py-1 bg-yellow-400 text-slate-950 hover:bg-yellow-500 font-bold text-[10px] rounded flex items-center gap-1 transition-all"
                                  >
                                    <Wrench className="w-3 h-3" />
                                    <span>Run Diagnosis</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Collection Points & Vibration Measurement Points */}
                  <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                        <Folder className="w-4 h-4 text-yellow-400" />
                        Vibration Collection Points
                      </h4>
                      <button
                        onClick={() => openCreateModal("collection_point", selectedItem.data.id)}
                        className="text-[11px] bg-yellow-400 text-slate-950 px-2 py-1 rounded font-bold hover:bg-yellow-500 transition-all flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Point
                      </button>
                    </div>

                    {loadingCollectionPoints[selectedItem.data.id] ? (
                      <p className="text-xs text-slate-500 italic py-2">Loading vibration points structure...</p>
                    ) : collectionPoints[selectedItem.data.id] && collectionPoints[selectedItem.data.id].length > 0 ? (
                      <div className="space-y-3">
                        {collectionPoints[selectedItem.data.id].map((cp: any) => (
                          <div key={cp.id} className="p-3 bg-slate-950/80 border border-slate-850 rounded-lg space-y-2.5">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-xs text-slate-200">{cp.name}</span>
                                {cp.notes && (
                                  <p className="text-[10px] text-slate-400 mt-0.5">{cp.notes}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => openEditModal("collection_point", cp)}
                                  className="p-1 hover:text-yellow-400 transition-all text-slate-400"
                                  title="Edit Point"
                                >
                                  <Sliders className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => openDeleteModal("collection_point", cp)}
                                  className="p-1 hover:text-rose-400 transition-all text-slate-400"
                                  title="Delete Point"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Measurement Points */}
                            <div className="pt-2 border-t border-slate-900">
                              <span className="text-[9px] text-slate-500 uppercase font-mono block mb-1.5">Auto-Created Measurement Points</span>
                              <div className="grid grid-cols-3 gap-2">
                                {cp.measurement_points && cp.measurement_points.length > 0 ? (
                                  cp.measurement_points.map((mp: any) => (
                                    <div key={mp.id} className="bg-slate-950 border border-slate-900 p-2 rounded flex flex-col justify-between text-left">
                                      <span className="text-[10px] font-bold text-slate-300 font-mono">{mp.direction}</span>
                                      <div className="flex items-center justify-between mt-1 text-[9px] text-slate-500">
                                        <span>{mp.technology_type || "Vibration"}</span>
                                        <span className="font-mono text-yellow-500/80">{mp.units || "in/Sec"}</span>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-[10px] text-slate-500 italic col-span-3">No measurement points found.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 border border-dashed border-slate-850 rounded-lg">
                        <Info className="w-4 h-4 text-slate-600 mx-auto mb-1" />
                        <p className="text-slate-500 text-xs italic">No collection points defined.</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">Click the button above to register an analysis collection point.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-20">
              <Database className="w-12 h-12 text-slate-700 mb-3" />
              <h3 className="text-white font-semibold text-sm">No Asset Selected</h3>
              <p className="text-slate-500 text-xs max-w-xs mt-1 leading-normal">
                Click on any node in the plant tree to view its active components, technical specs, and diagnostic analysis history.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ======================================= */}
      {/* CRUD POPUP FORM MODAL                   */}
      {/* ======================================= */}
      {modalType && (modalType === "create" || modalType === "edit") && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[#0c1220] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-1.5 font-display">
              <Sliders className="w-5 h-5 text-yellow-400" />
              {modalType === "create" ? "Add New" : "Edit"} {modalTargetType?.toUpperCase()}
            </h3>

            <form onSubmit={handleModalSubmit} className="space-y-4 text-xs">
              {/* Field 1: Name */}
              <div className="space-y-1.5">
                <label className="text-slate-400 font-bold block uppercase font-mono">Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder={`e.g. ${
                    modalTargetType === "plant" ? "Houston Refining Facility" :
                    modalTargetType === "route" ? "Ammonia Reformer Area" :
                    modalTargetType === "equipment" ? "Boiler Feed Pump B" : "Non-Drive End Bearing"
                  }`}
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-yellow-400/50"
                />
              </div>

              {/* Plant Location */}
              {modalTargetType === "plant" && (
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-bold block uppercase font-mono">Location Address</label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={e => setFormLocation(e.target.value)}
                    placeholder="9701 Manchester St, Houston, TX"
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-yellow-400/50"
                  />
                </div>
              )}

              {/* Route Description */}
              {(modalTargetType === "route" || modalTargetType === "collection_point") && (
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-bold block uppercase font-mono">
                    {modalTargetType === "collection_point" ? "Notes / Location Details" : "Area Description"}
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    placeholder={modalTargetType === "collection_point" ? "e.g. Radial position on inboard housing." : "Primary centrifugal pumps and piping networks."}
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-yellow-400/50 resize-none"
                  />
                </div>
              )}

              {/* Equipment Fields */}
              {modalTargetType === "equipment" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-bold block uppercase font-mono">Equipment Type</label>
                      <select
                        value={formType}
                        onChange={e => setFormType(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-yellow-400/50"
                      >
                        <option value="Electric Motor">Electric Motor</option>
                        <option value="Centrifugal Pump">Centrifugal Pump</option>
                        <option value="Screw Compressor">Screw Compressor</option>
                        <option value="Exhaust Fan">Exhaust Fan</option>
                        <option value="Gearbox">Gearbox</option>
                        <option value="Generator">Generator</option>
                        <option value="Other">Other Asset</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-bold block uppercase font-mono">Criticality</label>
                      <select
                        value={formCriticality}
                        onChange={e => setFormCriticality(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-yellow-400/50"
                      >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-bold block uppercase font-mono">Manufacturer</label>
                      <input
                        type="text"
                        value={formManufacturer}
                        onChange={e => setFormManufacturer(e.target.value)}
                        placeholder="e.g. Ingersoll Rand"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-yellow-400/50"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-bold block uppercase font-mono">Model</label>
                      <input
                        type="text"
                        value={formModel}
                        onChange={e => setFormModel(e.target.value)}
                        placeholder="e.g. RS37i"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-yellow-400/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-bold block uppercase font-mono">Serial Number</label>
                      <input
                        type="text"
                        value={formSerialNumber}
                        onChange={e => setFormSerialNumber(e.target.value)}
                        placeholder="e.g. IR-2348A"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-yellow-400/50"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-bold block uppercase font-mono">Install Date</label>
                      <input
                        type="date"
                        value={formInstallDate}
                        onChange={e => setFormInstallDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-yellow-400/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-400 font-bold block uppercase font-mono">Status</label>
                    <select
                      value={formStatus}
                      onChange={e => setFormStatus(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-yellow-400/50"
                    >
                      <option value="Active">Active</option>
                      <option value="Under Repair">Under Repair</option>
                      <option value="Decommissioned">Decommissioned</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Component Fields */}
              {modalTargetType === "component" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-slate-400 font-bold block uppercase font-mono">Component Type</label>
                    <select
                      value={formType}
                      onChange={e => setFormType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-yellow-400/50"
                    >
                      <option value="Bearing">Bearing</option>
                      <option value="Seal">Seal</option>
                      <option value="Coupling">Coupling</option>
                      <option value="Gearbox">Gearbox</option>
                      <option value="Rotor">Rotor</option>
                      <option value="Stator">Stator</option>
                      <option value="Vanes/Blades">Vanes/Blades</option>
                      <option value="Other">Other Component</option>
                    </select>
                  </div>

                  {/* Component Custom Specifications (Key-Value Rows) */}
                  <div className="bg-slate-950/40 p-3.5 border border-slate-850 rounded-xl space-y-3">
                    <div className="flex justify-between items-center pb-1 border-b border-slate-900">
                      <span className="font-bold text-slate-300 font-mono">Specifications Parameters</span>
                      <button
                        type="button"
                        onClick={addSpecRow}
                        className="text-[11px] text-yellow-400 hover:underline flex items-center gap-1 font-bold"
                      >
                        <Plus className="w-3 h-3" /> Add Row
                      </button>
                    </div>

                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                      {formSpecs.map((spec, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={spec.key}
                            onChange={e => handleSpecChange(idx, "key", e.target.value)}
                            placeholder="Specification (e.g. Size)"
                            className="w-1/2 bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1.5 text-slate-300"
                          />
                          <input
                            type="text"
                            value={spec.value}
                            onChange={e => handleSpecChange(idx, "value", e.target.value)}
                            placeholder="Value (e.g. SKF 6210)"
                            className="w-1/2 bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1.5 text-slate-300"
                          />
                          <button
                            type="button"
                            onClick={() => removeSpecRow(idx)}
                            className="p-1 hover:text-rose-400"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Row */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 bg-slate-900 border border-slate-800 text-slate-300 font-bold rounded-lg hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-yellow-400 text-slate-950 font-bold rounded-lg hover:bg-yellow-500 shadow-md"
                >
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* DELETE CONFIRMATION MODAL               */}
      {/* ======================================= */}
      {modalType === "delete" && editingItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0c1220] border border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 relative">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-3 pt-2">
              <div className="w-12 h-12 bg-rose-500/15 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-md font-bold text-white font-display">Confirm Deletion</h3>
              <p className="text-xs text-slate-400 leading-normal">
                Are you absolutely sure you want to delete <strong className="text-white">"{editingItem.name}"</strong>? This will permanently remove this {modalTargetType} and all of its nested children. This action is irreversible.
              </p>
            </div>

            <div className="flex gap-2.5 mt-6 border-t border-slate-800/80 pt-4 text-xs font-semibold">
              <button
                onClick={() => setModalType(null)}
                className="flex-1 py-2 bg-slate-900 border border-slate-800 text-slate-300 rounded-lg hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSubmit}
                className="flex-1 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 shadow"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
