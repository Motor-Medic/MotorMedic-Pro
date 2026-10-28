/**
 * Starter failure-mode taxonomy for the guided assessment wizard.
 *
 * SOURCE: ISO 14224:2016 (3rd edition) - "Petroleum, petrochemical and natural
 * gas industries - Collection and exchange of reliability and maintenance data
 * for equipment". The vibration branch follows the failure-mode / condition
 * parameter groupings used for rotating machinery in that standard; the
 * rolling-element bearing sub-modes (BPFO / BPFI / BSF / FTF) are the standard
 * bearing fault frequencies derived from bearing geometry. The oil branch
 * follows ISO 14224 lubricant condition parameters and common oil-analysis
 * practice (ASTM D4378).
 *
 * This is deliberately a STARTER list, not an exhaustive ISO 14224 export.
 * It is hardcoded for this slice because there is no admin taxonomy editor;
 * extend the FAILURE_MODES array and the tests when a new mode is needed.
 */

export type FailureModeFamily = "vibration" | "oil";

export interface FailureModeNode {
  key: string;
  label: string;
  description: string;
  family: FailureModeFamily;
  children?: readonly FailureModeNode[];
}

export const FAILURE_MODE_FAMILY_LABELS: Record<FailureModeFamily, string> = {
  vibration: "Vibration",
  oil: "Oil Analysis"
};

export const FAILURE_MODES: readonly FailureModeNode[] = [
  {
    key: "unbalance",
    label: "Unbalance",
    description:
      "Mass imbalance produces a dominant 1x running-speed radial peak that stays stable with load.",
    family: "vibration"
  },
  {
    key: "misalignment",
    label: "Misalignment",
    description:
      "Coupling or shaft misalignment typically shows strong 1x and 2x axial/radial components with a phase relationship across the coupling.",
    family: "vibration"
  },
  {
    key: "looseness",
    label: "Looseness",
    description:
      "Mechanical looseness generates harmonics (often 3x-10x) and a raised noise floor from mounting or foundation play.",
    family: "vibration"
  },
  {
    key: "bearing_defect",
    label: "Bearing Defect",
    description:
      "Rolling-element bearing damage appears at the characteristic bearing fault frequencies and their harmonics.",
    family: "vibration",
    children: [
      {
        key: "bearing_defect_bpfo",
        label: "BPFO - Outer Race",
        description:
          "Ball pass frequency, outer race - impacts once per rolling element pass on a stationary outer ring.",
        family: "vibration"
      },
      {
        key: "bearing_defect_bpfi",
        label: "BPFI - Inner Race",
        description:
          "Ball pass frequency, inner race - impacts once per rolling element pass on the rotating inner ring.",
        family: "vibration"
      },
      {
        key: "bearing_defect_bsf",
        label: "BSF - Rolling Element",
        description:
          "Ball spin frequency - a defect on a rolling element itself, often modulated by cage speed.",
        family: "vibration"
      },
      {
        key: "bearing_defect_ftf",
        label: "FTF - Cage",
        description:
          "Fundamental train frequency - cage damage or cage-to-element contact at the cage rotational rate.",
        family: "vibration"
      }
    ]
  },
  {
    key: "gear_mesh",
    label: "Gear Mesh",
    description:
      "Gear tooth problems raise the gear mesh frequency (tooth count x shaft speed) with sidebands around it.",
    family: "vibration"
  },
  {
    key: "resonance",
    label: "Resonance",
    description:
      "A structural or component natural frequency is being excited, producing an amplified response at a fixed frequency.",
    family: "vibration"
  },
  {
    key: "electrical",
    label: "Electrical",
    description:
      "Motor electrical faults show at line-frequency multiples or rotor-bar pass frequencies.",
    family: "vibration",
    children: [
      {
        key: "electrical_line_frequency",
        label: "Line Frequency",
        description:
          "Line-frequency (50/60 Hz or 2x) vibration points to electrical supply or stator issues.",
        family: "vibration"
      },
      {
        key: "electrical_rotor_bar",
        label: "Rotor Bar",
        description:
          "Rotor-bar pass frequency and pole-pass sidebands indicate rotor bar or end-ring degradation.",
        family: "vibration"
      }
    ]
  },
  {
    key: "other_vibration",
    label: "Other (Vibration)",
    description:
      "A vibration failure mode not covered by the starter taxonomy - describe it in the assessment notes.",
    family: "vibration"
  },
  {
    key: "wear_metals",
    label: "Wear Metals",
    description:
      "Elevated iron, copper, chromium or other wear elements indicate active component wear.",
    family: "oil"
  },
  {
    key: "viscosity_degradation",
    label: "Viscosity Degradation",
    description:
      "Viscosity outside the grade window can indicate oxidation, shear-down, or incorrect oil make-up.",
    family: "oil"
  },
  {
    key: "contamination",
    label: "Contamination",
    description:
      "Water, dirt, fuel, coolant or high ISO 4406 particle counts indicate ingression or filtration problems.",
    family: "oil"
  },
  {
    key: "additive_depletion",
    label: "Additive Depletion",
    description:
      "Depleted anti-wear, antioxidant or dispersant additives reduce the oil's remaining protective life.",
    family: "oil"
  },
  {
    key: "other_oil",
    label: "Other (Oil)",
    description:
      "An oil-analysis failure mode not covered by the starter taxonomy - describe it in the assessment notes.",
    family: "oil"
  }
];

const FAILURE_MODE_INDEX = new Map<string, FailureModeNode>();
for (const node of FAILURE_MODES) {
  FAILURE_MODE_INDEX.set(node.key, node);
  for (const child of node.children ?? []) {
    FAILURE_MODE_INDEX.set(child.key, child);
  }
}

/** Every selectable key, parents and sub-options included. */
export const FAILURE_MODE_KEYS: readonly string[] = Array.from(
  FAILURE_MODE_INDEX.keys()
);

export function isFailureModeKey(value: unknown): value is string {
  return typeof value === "string" && FAILURE_MODE_INDEX.has(value);
}

export function getFailureMode(key: unknown): FailureModeNode | null {
  return typeof key === "string" ? FAILURE_MODE_INDEX.get(key) ?? null : null;
}

export function failureModeLabel(key: unknown): string {
  return getFailureMode(key)?.label ?? "Unclassified";
}

export function failureModesForFamily(
  family: FailureModeFamily
): readonly FailureModeNode[] {
  return FAILURE_MODES.filter((node) => node.family === family);
}
