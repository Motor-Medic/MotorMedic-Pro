import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Factory, Compass, Wrench, CheckCircle2, Sparkles, 
  ArrowRight, ArrowLeft, Loader2, MapPin, FileText
} from "lucide-react";
import { useToast } from "./Toast";

interface OnboardingWizardProps {
  onClose: () => void;
  companyId: number;
  onSetupComplete: () => void;
}

export default function OnboardingWizard({ onClose, companyId, onSetupComplete }: OnboardingWizardProps) {
  const { showToast } = useToast();
  const [step, setStep] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [plantName, setPlantName] = useState<string>("");
  const [plantLocation, setPlantLocation] = useState<string>("");
  const [routeName, setRouteName] = useState<string>("");
  const [routeDescription, setRouteDescription] = useState<string>("");
  const [assetName, setAssetName] = useState<string>("");
  const [assetType, setAssetType] = useState<string>("Pump");

  // Created IDs saved across steps
  const [createdPlantId, setCreatedPlantId] = useState<number | null>(null);
  const [createdRouteId, setCreatedRouteId] = useState<number | null>(null);

  const handleSkip = () => {
    localStorage.setItem("motor_medic_onboarding_skipped", "true");
    showToast("Onboarding bypassed. You can set up equipment manually anytime.", "info");
    onClose();
  };

  const handleNextStep = async () => {
    setErrorMsg(null);

    if (step === 1) {
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!plantName.trim()) {
        setErrorMsg("Plant Name is required.");
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch("/api/plants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: plantName.trim(),
            location: plantLocation.trim() || undefined,
            company_id: companyId,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create plant.");
        }

        const plant = await res.json();
        setCreatedPlantId(plant.id);
        showToast(`Plant "${plant.name}" created successfully!`, "success");
        setStep(3);
      } catch (err: any) {
        console.error("Onboarding - Create plant failed:", err);
        setErrorMsg(err.message || "Unable to save plant. Please try again.");
        showToast("Failed to create plant.", "error");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (step === 3) {
      if (!routeName.trim()) {
        setErrorMsg("Route/Area Name is required.");
        return;
      }
      if (!createdPlantId) {
        setErrorMsg("No active plant context. Please go back.");
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch("/api/routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plant_id: createdPlantId,
            name: routeName.trim(),
            description: routeDescription.trim() || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create route.");
        }

        const route = await res.json();
        setCreatedRouteId(route.id);
        showToast(`Route "${route.name}" created successfully!`, "success");
        setStep(4);
      } catch (err: any) {
        console.error("Onboarding - Create route failed:", err);
        setErrorMsg(err.message || "Unable to save route. Please try again.");
        showToast("Failed to create route/area.", "error");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (step === 4) {
      if (!assetName.trim()) {
        setErrorMsg("Asset Name is required.");
        return;
      }
      if (!createdRouteId) {
        setErrorMsg("No active route context. Please go back.");
        return;
      }
      setIsLoading(true);
      try {
        // 1. Create Asset
        const assetRes = await fetch("/api/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            route_id: createdRouteId,
            name: assetName.trim(),
            type: assetType,
            criticality: "Medium",
            status: "Active",
            description: `Auto-generated during onboarding setup.`,
          }),
        });

        if (!assetRes.ok) {
          const data = await assetRes.json();
          throw new Error(data.error || "Failed to create asset.");
        }

        const asset = await assetRes.json();

        // 2. Auto-generate a default Component under this Asset so it's fully ready to use
        const componentRes = await fetch("/api/components", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset_id: asset.id,
            name: "Main Drive Bearing",
            type: "Bearing",
            notes: "Default monitoring component created during facility onboarding.",
            specifications: { part_number: "SKF 6210", lubrication: "Grease" }
          }),
        });

        if (!componentRes.ok) {
          console.warn("Failed to create default component, proceeding anyway...");
        }

        showToast(`Asset "${asset.name}" and component setup successfully!`, "success");
        setStep(5);
      } catch (err: any) {
        console.error("Onboarding - Create asset failed:", err);
        setErrorMsg(err.message || "Unable to save asset. Please try again.");
        showToast("Failed to save asset.", "error");
      } finally {
        setIsLoading(false);
      }
      return;
    }
  };

  const handlePrevStep = () => {
    setErrorMsg(null);
    if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        className="w-full max-w-lg overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col relative"
      >
        {/* Skip Button (Steps 1 to 4) */}
        {step < 5 && (
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 z-10 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-lg transition-colors cursor-pointer"
          >
            Skip for now
          </button>
        )}

        {/* Progress Bar */}
        {step > 1 && step < 5 && (
          <div className="w-full h-1 bg-slate-800">
            <div 
              className="h-full bg-yellow-400 transition-all duration-300"
              style={{ width: `${((step - 1) / 3) * 100}%` }}
            />
          </div>
        )}

        {/* Content Box */}
        <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between min-h-[380px]">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6 text-center py-4 flex flex-col items-center"
              >
                <div className="w-16 h-16 bg-yellow-400/10 rounded-full flex items-center justify-center border border-yellow-400/20 text-yellow-400 animate-bounce">
                  <Sparkles className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight">
                    Welcome to MotorMedic Pro!
                  </h2>
                  <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                    Let's get your facility set up in less than a minute. We'll create your first plant location, routing zone, and rotating asset.
                  </p>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 border border-blue-500/20">
                    <Factory className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider">Step 1 of 3</span>
                    <h3 className="text-lg font-bold text-slate-200">Create Your First Plant</h3>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Plants are your physical locations or factories (e.g. Galveston Refinery, Chicago Assembly Site).
                </p>

                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Plant Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={plantName}
                      onChange={(e) => setPlantName(e.target.value)}
                      placeholder="e.g. Faustina Facility"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-yellow-400/50 transition-colors"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Location / Address
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={plantLocation}
                        onChange={(e) => setPlantLocation(e.target.value)}
                        placeholder="e.g. Houston, TX"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-yellow-400/50 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider">Step 2 of 3</span>
                    <h3 className="text-lg font-bold text-slate-200">Create Your First Route/Area</h3>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Routes represent logical maintenance sectors, monitoring paths, or process areas (e.g. Ammonia Line, Cooling Towers).
                </p>

                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Route/Area Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={routeName}
                      onChange={(e) => setRouteName(e.target.value)}
                      placeholder="e.g. Ammonia Area"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-yellow-400/50 transition-colors"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Description <span className="text-[10px] text-slate-500 font-normal">(Optional)</span>
                    </label>
                    <textarea
                      value={routeDescription}
                      onChange={(e) => setRouteDescription(e.target.value)}
                      placeholder="Brief notes about this process line..."
                      rows={3}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-yellow-400/50 transition-colors resize-none"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                    <Wrench className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider">Step 3 of 3</span>
                    <h3 className="text-lg font-bold text-slate-200">Add Your First Asset</h3>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Assets are your heavy equipment machines (e.g. feed water pump, cooling fan, intake blower).
                </p>

                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Asset Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={assetName}
                      onChange={(e) => setAssetName(e.target.value)}
                      placeholder="e.g. Pump P-101"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-yellow-400/50 transition-colors"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Asset Type
                    </label>
                    <select
                      value={assetType}
                      onChange={(e) => setAssetType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-yellow-400/50 transition-colors cursor-pointer"
                    >
                      <option value="Pump">Pump</option>
                      <option value="Motor">Motor</option>
                      <option value="Fan">Fan</option>
                      <option value="Gearbox">Gearbox</option>
                      <option value="Compressor">Compressor</option>
                      <option value="Generator">Generator</option>
                      <option value="Blower">Blower</option>
                      <option value="Turbine">Turbine</option>
                    </select>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-6 text-center py-6 flex flex-col items-center"
              >
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 text-emerald-400 animate-pulse">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight">
                    You're all set!
                  </h2>
                  <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                    Your first plant, route, asset, and diagnostics components have been initialized! You are now ready to run diagnostic workflows, view live history, and log fault trends.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error messages if any */}
          {errorMsg && (
            <motion.p 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="text-xs font-semibold text-rose-500 mt-4 text-center bg-rose-500/10 border border-rose-500/20 py-2.5 rounded-xl"
            >
              ⚠️ {errorMsg}
            </motion.p>
          )}

          {/* Action buttons footer */}
          <div className="flex items-center justify-between gap-4 mt-8 border-t border-slate-800/60 pt-6">
            {step > 1 && step < 5 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={isLoading}
                className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <div /> // Spacer
            )}

            {step === 5 ? (
              <button
                type="button"
                onClick={() => {
                  onSetupComplete();
                  onClose();
                }}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold py-3 px-6 rounded-xl shadow-lg transition-colors text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNextStep}
                disabled={isLoading}
                className="bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold py-3 px-6 rounded-xl shadow-lg transition-colors text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>{step === 1 ? "Get Started" : step === 4 ? "Finish Setup" : "Next"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
