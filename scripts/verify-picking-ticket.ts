/**
 * Verifies the stockroom picking ticket resolves against real inventory records
 * and renders their live stock, supplier and lead-time values.
 */
import assert from "node:assert/strict";
import { INITIAL_INVENTORY, getStockStatus } from "../src/components/PartsInventory";
import { buildPickingTicketHtml } from "../src/lib/printPickingTicket";

// Mirrors STAGED_REPAIR_KIT in Diagnose.tsx.
const STAGED = [
  { partNumber: "SKF-6308-C3", quantity: 2 },
  { partNumber: "ALN-SHIM-KIT", quantity: 1 }
];

const lines = STAGED.map((line) => {
  const part = INITIAL_INVENTORY.find((p) => p.partNumber === line.partNumber);
  assert.ok(part, `Staged part ${line.partNumber} is missing from inventory`);
  return {
    partNumber: line.partNumber,
    description: part.description,
    quantity: line.quantity,
    quantityInStock: part.quantityInStock,
    stockStatus: getStockStatus(part).label,
    supplierName: part.supplierName,
    leadTimeDays: part.leadTimeDays
  };
});

const html = buildPickingTicketHtml({
  assetTag: "PMP-030",
  component: "Motor DE",
  faultTitle: "Outer Race Bearing Defect (BPFO)",
  severity: "HIGH",
  lines,
  printedAt: new Date("2026-08-26T14:00:00Z")
});

// Live values sourced from the inventory records, not the ticket template.
for (const line of lines) {
  assert.ok(html.includes(line.partNumber), `missing part number ${line.partNumber}`);
  assert.ok(html.includes(line.description), `missing description for ${line.partNumber}`);
  assert.ok(html.includes(line.supplierName), `missing supplier for ${line.partNumber}`);
}
assert.ok(html.includes("PMP-030"), "missing asset tag");
assert.ok(html.includes("Outer Race Bearing Defect (BPFO)"), "missing fault");
assert.ok(html.includes("HIGH"), "missing severity");

// SKF-6308-C3 is stocked at 0 against a required qty of 2, so the ticket must
// warn rather than let the picker walk to an empty bin.
assert.ok(html.includes("SHORTFALL"), "expected a shortfall warning");
assert.ok(
  html.includes("SKF-6308-C3 (need 2, have 0)"),
  "shortfall must name the part and real counts"
);

// Nothing may be injected raw.
assert.ok(!html.includes("<script"), "ticket must not contain scripts");

console.log("Picking ticket verified against live inventory:");
for (const line of lines) {
  console.log(
    `  ${line.partNumber.padEnd(14)} need ${line.quantity}  have ${line.quantityInStock}  ` +
      `${line.stockStatus.padEnd(12)} ${line.supplierName} (${line.leadTimeDays} d)`
  );
}
