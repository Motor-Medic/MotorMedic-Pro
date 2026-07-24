/**
 * McMaster-Carr search URL generator based on diagnostic faults and equipment specifications
 */
export function generateMcMasterQuery(faultName: string, equipmentType: string, specs?: any): { label: string; url: string }[] {
  const normFault = (faultName || "").toLowerCase();
  const normEquip = (equipmentType || "").toLowerCase();

  const parts: { label: string; url: string }[] = [];

  if (normFault.includes("bearing") || normFault.includes("bpfo") || normFault.includes("bpfi") || normFault.includes("bsf") || normFault.includes("ftf")) {
    // Bearing defect: Search McMaster-Carr for specific bearing type and size
    let speedStr = "";
    if (specs) {
      const rpmVal = parseInt(specs.specRpm || specs.rpm);
      if (!isNaN(rpmVal) && rpmVal > 0) {
        if (rpmVal > 3000) {
          speedStr = "high speed ";
        } else if (rpmVal < 600) {
          speedStr = "low speed ";
        }
      }
    }
    
    parts.push({
      label: `Precision ${speedStr}Ball Bearings`,
      url: `https://www.mcmaster.com/${encodeURIComponent(speedStr + "ball bearings")}`
    });
    parts.push({
      label: "Pillow Block / Mounted Bearings",
      url: `https://www.mcmaster.com/${encodeURIComponent("mounted bearings")}`
    });
    parts.push({
      label: "Synthetic Bearing Grease & Lubricants",
      url: `https://www.mcmaster.com/${encodeURIComponent("bearing grease")}`
    });
  } else if (normFault.includes("unbalance") || normFault.includes("imbalance")) {
    // Unbalance
    parts.push({
      label: "Shaft Balancing Collar Weights",
      url: `https://www.mcmaster.com/${encodeURIComponent("shaft collars balancing")}`
    });
    parts.push({
      label: "Clamp-on Shaft Collars",
      url: `https://www.mcmaster.com/${encodeURIComponent("shaft collars")}`
    });
  } else if (normFault.includes("misalignment") || normFault.includes("coupling")) {
    // Misalignment
    parts.push({
      label: "Precision Motor Alignment Shims",
      url: `https://www.mcmaster.com/${encodeURIComponent("alignment shims")}`
    });
    parts.push({
      label: "Flexible Machinery Shaft Couplings",
      url: `https://www.mcmaster.com/${encodeURIComponent("flexible couplings")}`
    });
    parts.push({
      label: "Replacement Coupling Inserts / Spiders",
      url: `https://www.mcmaster.com/${encodeURIComponent("coupling spider")}`
    });
    parts.push({
      label: "Shaft Key Stock",
      url: `https://www.mcmaster.com/${encodeURIComponent("key stock")}`
    });
  } else if (normFault.includes("looseness") || normFault.includes("loose")) {
    // Looseness
    parts.push({
      label: "High-Strength Structural Threadlocker",
      url: `https://www.mcmaster.com/${encodeURIComponent("threadlocker")}`
    });
    parts.push({
      label: "Vibration-Damping Mounts & Pads",
      url: `https://www.mcmaster.com/${encodeURIComponent("vibration damping mounts")}`
    });
    parts.push({
      label: "Grade 8 Zinc-Plated Steel Bolts",
      url: `https://www.mcmaster.com/${encodeURIComponent("grade 8 bolts")}`
    });
    parts.push({
      label: "Lock Washers & Vibration-Resistant Nuts",
      url: `https://www.mcmaster.com/${encodeURIComponent("lock washers")}`
    });
  } else {
    // Generic or equipment specific faults (seals, couplings, gaskets, etc.)
    if (normEquip.includes("pump")) {
      parts.push({
        label: "Centrifugal Pump Mechanical Shaft Seals",
        url: `https://www.mcmaster.com/${encodeURIComponent("pump mechanical seals")}`
      });
      parts.push({
        label: "Machinery Gaskets & Sheet Material",
        url: `https://www.mcmaster.com/${encodeURIComponent("flange gaskets")}`
      });
    } else if (normEquip.includes("fan")) {
      parts.push({
        label: "High-Capacity Machinery V-Belts",
        url: `https://www.mcmaster.com/${encodeURIComponent("v-belts")}`
      });
      parts.push({
        label: "Adjustable Shaft Pulleys & Sheaves",
        url: `https://www.mcmaster.com/${encodeURIComponent("shaft pulleys")}`
      });
    } else if (normEquip.includes("gearbox")) {
      parts.push({
        label: "Gearbox High-Temp Oil Seals",
        url: `https://www.mcmaster.com/${encodeURIComponent("oil seals")}`
      });
      parts.push({
        label: "Synthetic Gear Lubricating Oil",
        url: `https://www.mcmaster.com/${encodeURIComponent("gear lube")}`
      });
    } else {
      parts.push({
        label: "Replacement Shaft Seals & O-Rings",
        url: `https://www.mcmaster.com/${encodeURIComponent("rotary shaft seals")}`
      });
      parts.push({
        label: "Precision Hardware Coupling Kit",
        url: `https://www.mcmaster.com/${encodeURIComponent("shaft coupling")}`
      });
    }
  }

  return parts;
}
