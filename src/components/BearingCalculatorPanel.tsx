import React, { useEffect, useMemo, useState } from "react";
import {
  calculateBearingFrequencies,
  formatBearingFrequency,
  validateBearingCalcInput,
  validateBearingGeometry,
  type BearingFaultFrequencies
} from "../lib/bearingCalc";
import { canCurrent } from "../lib/roles";

/**
 * UI-only shape handed to the existing spectrum chart. Frequencies are null
 * unless every input validates, so the chart can never draw a guessed marker.
 */
export interface BearingOverlayState {
  enabled: boolean;
  showHarmonics: boolean;
  frequencies: BearingFaultFrequencies | null;
  referenceLabel: string | null;
}

export const EMPTY_BEARING_OVERLAY: BearingOverlayState = {
  enabled: false,
  showHarmonics: false,
  frequencies: null,
  referenceLabel: null
};

interface BearingCalculatorPanelProps {
  /** Real server component id; null means nothing savable is open. */
  componentId: number | null;
  defaultRpm: number | null;
  suggestedLabel?: string | null;
  onOverlayChange: (state: BearingOverlayState) => void;
}

interface BearingSpecRow {
  id: number;
  z: number;
  bd: number;
  pd: number;
  contact_angle: number;
  unit: string;
  reference_label: string | null;
}

const inputClass =
  "w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 tabular-nums focus:outline-none focus:ring-1 focus:ring-[#FFC700]";
const labelClass =
  "block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1";

export default function BearingCalculatorPanel({
  componentId,
  defaultRpm,
  suggestedLabel,
  onOverlayChange
}: BearingCalculatorPanelProps) {
  const [rpm, setRpm] = useState("");
  const [z, setZ] = useState("");
  const [bd, setBd] = useState("");
  const [pd, setPd] = useState("");
  const [angle, setAngle] = useState("0");
  const [unit, setUnit] = useState<"mm" | "in">("mm");
  const [referenceLabel, setReferenceLabel] = useState("");
  const [savedSpecId, setSavedSpecId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [showHarmonics, setShowHarmonics] = useState(false);
  const maySaveSpec = canCurrent("bearing.write");

  const geometryValidation = useMemo(
    () => validateBearingGeometry({ z, bd, pd, contactAngle: angle }),
    [z, bd, pd, angle]
  );
  const inputValidation = useMemo(
    () => validateBearingCalcInput({ z, bd, pd, contactAngle: angle, rpm }),
    [z, bd, pd, angle, rpm]
  );
  const frequencies = useMemo(
    () =>
      inputValidation.ok
        ? calculateBearingFrequencies(inputValidation.value)
        : null,
    [inputValidation]
  );
  const fieldErrors = inputValidation.errors;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setNotice(null);
    setSavedSpecId(null);
    setOverlayEnabled(false);
    setShowHarmonics(false);
    setLoading(false);
    setRpm(defaultRpm != null && defaultRpm > 0 ? String(Math.round(defaultRpm)) : "");

    if (componentId == null) {
      setZ("");
      setBd("");
      setPd("");
      setAngle("0");
      setUnit("mm");
      setReferenceLabel(suggestedLabel ?? "");
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    fetch(`/api/bearing-specs/component/${componentId}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || "Failed to load the bearing spec.");
        }
        return body as { spec?: BearingSpecRow | null };
      })
      .then((body) => {
        if (cancelled) return;
        const spec = body.spec ?? null;
        if (spec) {
          setSavedSpecId(spec.id);
          setZ(String(spec.z));
          setBd(String(spec.bd));
          setPd(String(spec.pd));
          setAngle(String(spec.contact_angle));
          setUnit(spec.unit === "in" ? "in" : "mm");
          setReferenceLabel(
            typeof spec.reference_label === "string" ? spec.reference_label : ""
          );
          setNotice("Loaded the saved bearing spec for this component.");
        } else {
          setZ("");
          setBd("");
          setPd("");
          setAngle("0");
          setUnit("mm");
          setReferenceLabel(suggestedLabel ?? "");
          setNotice(
            "No bearing spec saved for this component yet. Enter its geometry to calculate."
          );
        }
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load the bearing spec."
        );
        setZ("");
        setBd("");
        setPd("");
        setAngle("0");
        setUnit("mm");
        setReferenceLabel(suggestedLabel ?? "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [componentId]);

  useEffect(() => {
    if (defaultRpm == null || defaultRpm <= 0) return;
    setRpm((current) =>
      current.trim() === "" ? String(Math.round(defaultRpm)) : current
    );
  }, [defaultRpm]);

  useEffect(() => {
    onOverlayChange({
      enabled: overlayEnabled && frequencies != null,
      showHarmonics: showHarmonics && frequencies != null,
      frequencies,
      referenceLabel: referenceLabel.trim() === "" ? null : referenceLabel
    });
  }, [
    frequencies,
    overlayEnabled,
    showHarmonics,
    referenceLabel,
    onOverlayChange
  ]);

  const saveSpec = async () => {
    setError(null);
    setNotice(null);
    if (componentId == null) {
      setError("Select a saved component before saving a bearing spec.");
      return;
    }
    if (!geometryValidation.ok) {
      const first = Object.values(geometryValidation.errors).find(
        (message): message is string => typeof message === "string" && message.length > 0
      );
      setError(first ?? "Fix the geometry fields before saving.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        savedSpecId == null
          ? "/api/bearing-specs"
          : `/api/bearing-specs/${savedSpecId}`,
        {
          method: savedSpecId == null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            component_id: componentId,
            z: geometryValidation.value.z,
            bd: geometryValidation.value.bd,
            pd: geometryValidation.value.pd,
            contact_angle: geometryValidation.value.contactAngle,
            unit,
            // Stored verbatim; no lookup table or normalization behind it.
            reference_label: referenceLabel
          })
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || "Failed to save the bearing spec.");
      }
      const spec = body?.spec as BearingSpecRow | undefined;
      if (spec) setSavedSpecId(spec.id);
      setNotice("Bearing spec saved to this component.");
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save the bearing spec."
      );
    } finally {
      setSaving(false);
    }
  };

  const rows: { label: string; value: string }[] = [
    {
      label: "Shaft",
      value: formatBearingFrequency(frequencies?.shaftHz)
    },
    { label: "BPFO", value: formatBearingFrequency(frequencies?.bpfo) },
    { label: "BPFI", value: formatBearingFrequency(frequencies?.bpfi) },
    { label: "BSF", value: formatBearingFrequency(frequencies?.bsf) },
    { label: "FTF", value: formatBearingFrequency(frequencies?.ftf) }
  ];

  return (
    <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Bearing fault-frequency calculator
        </h4>
        <span className="text-[10px] font-mono text-slate-500">
          {loading
            ? "loading component spec..."
            : savedSpecId != null
              ? `saved spec #${savedSpecId}`
              : "unsaved"}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Enter the bearing geometry. No manufacturer part-number catalog is used;
        the reference label is stored verbatim and never looked up.
      </p>
      {componentId == null && (
        <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3">
          No saved component is open, so this spec cannot be stored here. You can
          still calculate frequencies and overlay them on the chart.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelClass} htmlFor="bearing-rpm">
            RPM
          </label>
          <input
            id="bearing-rpm"
            type="number"
            min="0"
            step="1"
            value={rpm}
            onChange={(event) => setRpm(event.target.value)}
            className={inputClass}
            placeholder="shaft RPM"
          />
          {fieldErrors.rpm && (
            <p className="mt-1 text-[10px] text-red-400">{fieldErrors.rpm}</p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="bearing-z">
            Ball count (Z)
          </label>
          <input
            id="bearing-z"
            type="number"
            min="3"
            step="1"
            value={z}
            onChange={(event) => setZ(event.target.value)}
            className={inputClass}
            placeholder="e.g. 9"
          />
          {fieldErrors.z && (
            <p className="mt-1 text-[10px] text-red-400">{fieldErrors.z}</p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="bearing-bd">
            Ball dia. (Bd)
          </label>
          <input
            id="bearing-bd"
            type="number"
            min="0"
            step="any"
            value={bd}
            onChange={(event) => setBd(event.target.value)}
            className={inputClass}
            placeholder="same unit as Pd"
          />
          {fieldErrors.bd && (
            <p className="mt-1 text-[10px] text-red-400">{fieldErrors.bd}</p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="bearing-pd">
            Pitch dia. (Pd)
          </label>
          <input
            id="bearing-pd"
            type="number"
            min="0"
            step="any"
            value={pd}
            onChange={(event) => setPd(event.target.value)}
            className={inputClass}
            placeholder="same unit as Bd"
          />
          {fieldErrors.pd && (
            <p className="mt-1 text-[10px] text-red-400">{fieldErrors.pd}</p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="bearing-angle">
            Contact angle (deg)
          </label>
          <input
            id="bearing-angle"
            type="number"
            min="0"
            max="45"
            step="any"
            value={angle}
            onChange={(event) => setAngle(event.target.value)}
            className={inputClass}
          />
          {fieldErrors.contactAngle && (
            <p className="mt-1 text-[10px] text-red-400">
              {fieldErrors.contactAngle}
            </p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="bearing-unit">
            Geometry unit
          </label>
          <select
            id="bearing-unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value === "in" ? "in" : "mm")}
            className={inputClass}
          >
            <option value="mm">mm</option>
            <option value="in">in</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelClass} htmlFor="bearing-reference">
            Reference / part label (stored verbatim)
          </label>
          <input
            id="bearing-reference"
            type="text"
            value={referenceLabel}
            onChange={(event) => setReferenceLabel(event.target.value)}
            className={inputClass}
            placeholder="free text, no lookup"
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="mt-3 text-xs text-slate-300 bg-slate-950/70 border border-slate-700 rounded-lg px-3 py-2">
          {notice}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label
          className={`flex items-center gap-2 text-sm ${frequencies ? "text-slate-200 cursor-pointer" : "text-slate-500 opacity-60"}`}
        >
          <input
            type="checkbox"
            checked={overlayEnabled}
            disabled={!frequencies}
            onChange={() => setOverlayEnabled((value) => !value)}
            className="h-4 w-4 rounded border-slate-700 accent-[#FFC700]"
          />
          Overlay on spectrum
        </label>
        <label
          className={`flex items-center gap-2 text-sm ${frequencies ? "text-slate-200 cursor-pointer" : "text-slate-500 opacity-60"}`}
        >
          <input
            type="checkbox"
            checked={showHarmonics}
            disabled={!frequencies}
            onChange={() => setShowHarmonics((value) => !value)}
            className="h-4 w-4 rounded border-slate-700 accent-[#FFC700]"
          />
          2x / 3x harmonics
        </label>
        {maySaveSpec ? (
          <button
            type="button"
            onClick={saveSpec}
            disabled={saving || componentId == null || !geometryValidation.ok}
            className="ml-auto px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#FFC700] text-slate-950 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving
              ? "Saving..."
              : savedSpecId == null
                ? "Save spec to component"
                : "Update saved spec"}
          </button>
        ) : (
          <span className="ml-auto text-[11px] text-slate-500">
            Read-only bearing calculator for your role.
          </span>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-700/80">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-950/80 text-left text-[10px] uppercase tracking-widest text-slate-400">
              <th className="px-3 py-2 font-bold">Characteristic</th>
              <th className="px-3 py-2 font-bold">Frequency (Hz)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-700/80">
                <td className="px-3 py-2 text-slate-300">{row.label}</td>
                <td className="px-3 py-2 font-mono text-[#FFC700] tabular-nums">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Frequencies are computed from the entered geometry only. Bd and Pd must
        share one unit (mm or in); the ratio cancels the unit.
      </p>
    </div>
  );
}
