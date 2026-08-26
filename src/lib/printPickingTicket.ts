/**
 * Stockroom picking ticket printing.
 *
 * Renders the ticket into a detached same-origin iframe and prints that, so the
 * output contains only the ticket. A popup window would be blocked by default
 * in most browsers, and printing the page itself would carry the whole
 * dashboard chrome onto the paper.
 */

export interface PickingTicketLine {
  partNumber: string;
  description: string;
  quantity: number;
  /** Null when the part number is not carried in inventory. */
  quantityInStock: number | null;
  stockStatus: string;
  supplierName: string | null;
  leadTimeDays: number | null;
}

export interface PickingTicketInput {
  assetTag: string;
  component: string;
  faultTitle: string | null;
  severity: string | null;
  lines: PickingTicketLine[];
  /** Defaults to now; injectable so the output is testable. */
  printedAt?: Date;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return escapeHtml(String(value));
}

export function buildPickingTicketHtml(input: PickingTicketInput): string {
  const printedAt = input.printedAt ?? new Date();
  const rows = input.lines
    .map(
      (line) => `
        <tr>
          <td class="mono">${cell(line.partNumber)}</td>
          <td>${cell(line.description)}</td>
          <td class="num">${cell(line.quantity)}</td>
          <td class="num">${cell(line.quantityInStock)}</td>
          <td>${cell(line.stockStatus)}</td>
          <td>${cell(line.supplierName)}</td>
          <td class="num">${line.leadTimeDays == null ? "—" : `${line.leadTimeDays} d`}</td>
          <td class="pick"></td>
        </tr>`
    )
    .join("");

  const shortfall = input.lines.filter(
    (l) => l.quantityInStock != null && l.quantityInStock < l.quantity
  );

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Stockroom Picking Ticket — ${cell(input.assetTag)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
             color: #000; margin: 0; padding: 24px; font-size: 12px; }
      h1 { font-size: 18px; margin: 0 0 2px; letter-spacing: 0.04em; }
      .sub { font-size: 11px; color: #444; margin: 0 0 16px; }
      dl { display: grid; grid-template-columns: max-content 1fr;
           gap: 2px 12px; margin: 0 0 18px; }
      dt { font-weight: 700; text-transform: uppercase; font-size: 10px;
           letter-spacing: 0.06em; color: #444; }
      dd { margin: 0; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 6px 8px; text-align: left;
               vertical-align: top; }
      th { background: #e2e8f0; font-size: 10px; text-transform: uppercase;
           letter-spacing: 0.05em; }
      .num { text-align: right; white-space: nowrap; }
      .mono { white-space: nowrap; }
      .pick { width: 64px; }
      .warn { margin-top: 14px; padding: 8px 10px; border: 1px solid #000;
              font-weight: 700; }
      .sign { margin-top: 28px; display: grid;
              grid-template-columns: 1fr 1fr; gap: 24px; }
      .sign div { border-top: 1px solid #000; padding-top: 4px; font-size: 10px;
                  text-transform: uppercase; letter-spacing: 0.06em; }
      @page { margin: 14mm; }
    </style>
  </head>
  <body>
    <h1>Stockroom Picking Ticket</h1>
    <p class="sub">Printed ${escapeHtml(printedAt.toLocaleString())}</p>
    <dl>
      <dt>Asset</dt><dd>${cell(input.assetTag)}</dd>
      <dt>Component</dt><dd>${cell(input.component)}</dd>
      <dt>Finding</dt><dd>${cell(input.faultTitle)}</dd>
      <dt>Severity</dt><dd>${cell(input.severity)}</dd>
    </dl>
    <table>
      <thead>
        <tr>
          <th>Part Number</th><th>Description</th><th>Qty Req</th>
          <th>On Hand</th><th>Status</th><th>Supplier</th><th>Lead</th>
          <th>Picked</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="8">No parts staged for this repair.</td></tr>'}</tbody>
    </table>
    ${
      shortfall.length > 0
        ? `<p class="warn">SHORTFALL — cannot fill from stock: ${shortfall
            .map((l) => escapeHtml(`${l.partNumber} (need ${l.quantity}, have ${l.quantityInStock})`))
            .join("; ")}</p>`
        : ""
    }
    <div class="sign">
      <div>Picked by / date</div>
      <div>Received by / date</div>
    </div>
  </body>
</html>`;
}

/** Opens the browser's native print dialog for the ticket. */
export function printPickingTicket(input: PickingTicketInput): void {
  if (typeof document === "undefined") return;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const doc = frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(buildPickingTicketHtml(input));
  doc.close();

  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Give the dialog time to take its snapshot before detaching the frame.
    window.setTimeout(() => frame.remove(), 1000);
  };

  if (doc.readyState === "complete") run();
  else frame.addEventListener("load", run, { once: true });
}
