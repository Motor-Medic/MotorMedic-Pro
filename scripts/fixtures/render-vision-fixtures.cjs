/**
 * Renders the two live-probe fixtures as PNGs (no dependency on a real upload):
 *  - oil-report.png        oil lab-report table (values from oilFixtures good row)
 *  - mca-grouped-bar.png   MCA grouped-bar chart (values from MCA_BAR_CHART_TRUTH)
 *
 * These are PROBE inputs, not production data. The values printed on each image
 * are exactly the values asserted by the corresponding fixture module.
 */
const fs = require("node:fs");
const path = require("node:path");
const { createCanvas } = require("@napi-rs/canvas");

const OUT = path.join(__dirname);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawOilReport() {
  const W = 1300;
  const H = 1500;
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 44px Arial";
  ctx.fillText("OIL ANALYSIS REPORT", 70, 90);
  ctx.font = "24px Arial";
  ctx.fillStyle = "#334155";
  ctx.fillText("Blackstone Laboratories - ICP Spectroscopy (ASTM D5185)", 70, 130);
  ctx.fillText("Lab Name: Blackstone Laboratories", 70, 190);
  ctx.fillText("Report Number: BL-2026-0115-M101", 70, 225);
  ctx.fillText("Sample Date: 2026-01-15", 70, 260);
  ctx.fillText("Unit ID: M-101", 70, 295);
  ctx.fillText("Lubricant: Mobil SHC 630 ISO VG 220", 70, 330);

  const rows = [
    ["Iron (Fe)", "10", "ppm", "100"],
    ["Copper (Cu)", "5", "ppm", "50"],
    ["Chromium (Cr)", "1", "ppm", "15"],
    ["Lead (Pb)", "2", "ppm", "25"],
    ["Aluminum (Al)", "3", "ppm", "30"],
    ["Silicon (Si)", "8", "ppm", "25"],
    ["Tin (Sn)", "1", "ppm", "10"],
    ["Viscosity @ 40 C", "46", "cSt", "44-48"],
    ["Acid Number (TAN)", "1.20", "mg KOH/g", "0.0-2.0"],
    ["Oxidation", "0.11", "Abs/cm", "0.30"],
    ["Water", "0.02", "%", "0.10"]
  ];

  const x = 60;
  const y = 380;
  const widths = [360, 200, 220, 220];
  const rowH = 62;
  const headers = ["Test", "Result", "Unit", "Limit"];

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(x, y, widths.reduce((a, b) => a + b, 0), rowH);
  ctx.font = "bold 26px Arial";
  ctx.fillStyle = "#ffffff";
  let cx = x + 20;
  headers.forEach((h, i) => {
    ctx.fillText(h, cx, y + 41);
    cx += widths[i];
  });

  rows.forEach((row, r) => {
    const ry = y + rowH * (r + 1);
    ctx.fillStyle = r % 2 === 0 ? "#f8fafc" : "#eef2f7";
    ctx.fillRect(x, ry, widths.reduce((a, b) => a + b, 0), rowH);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, ry, widths.reduce((a, b) => a + b, 0), rowH);
    ctx.fillStyle = "#0f172a";
    ctx.font = "26px Arial";
    let px = x + 20;
    row.forEach((cell, i) => {
      ctx.fillText(cell, px, ry + 41);
      px += widths[i];
    });
  });

  const footerY = y + rowH * (rows.length + 1) + 40;
  ctx.fillStyle = "#334155";
  ctx.font = "22px Arial";
  ctx.fillText("Wear metals are reported in ppm. Viscosity is kinematic at 40 C.", 60, footerY);
  ctx.fillText("Sump capacity: 8 qt", 60, footerY + 34);
  ctx.fillText("Hours on oil: 120 h", 60, footerY + 68);

  fs.writeFileSync(path.join(OUT, "oil-report.png"), c.toBuffer("image/png"));
}

function drawPanel(ctx, opts) {
  const {
    x,
    y,
    w,
    h,
    title,
    unit,
    min,
    max,
    major,
    minor,
    values,
    decimals
  } = opts;
  const padL = 90;
  const padB = 70;
  const padT = 70;
  const plotX = x + padL;
  const plotY = y + padT;
  const plotW = w - padL - 30;
  const plotH = h - padT - padB;

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 26px Arial";
  ctx.fillText(`${title} (${unit})`, x + 16, y + 40);

  const steps = Math.round((max - min) / minor);
  for (let i = 0; i <= steps; i++) {
    const v = min + i * minor;
    const py = plotY + plotH - ((v - min) / (max - min)) * plotH;
    const isMajor = Math.abs((v - min) % major) < 1e-9;
    ctx.strokeStyle = isMajor ? "#cbd5e1" : "#e2e8f0";
    ctx.lineWidth = isMajor ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(plotX, py);
    ctx.lineTo(plotX + plotW, py);
    ctx.stroke();
    if (isMajor) {
      ctx.fillStyle = "#334155";
      ctx.font = "20px Arial";
      ctx.textAlign = "right";
      ctx.fillText(v.toFixed(decimals), plotX - 12, py + 7);
      ctx.textAlign = "left";
    }
  }

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plotX, plotY);
  ctx.lineTo(plotX, plotY + plotH);
  ctx.lineTo(plotX + plotW, plotY + plotH);
  ctx.stroke();

  const groupW = plotW / 3;
  const barW = groupW * 0.28;
  const phases = ["A", "B", "C"];
  phases.forEach((phase, pi) => {
    const gx = plotX + groupW * pi;
    [0, 90].forEach((rotor, ri) => {
      const v = values[rotor][pi];
      const bh = ((v - min) / (max - min)) * plotH;
      const bx = gx + groupW * 0.12 + ri * (barW + 10);
      const by = plotY + plotH - bh;
      ctx.fillStyle = rotor === 0 ? "#2563eb" : "#f59e0b";
      roundRect(ctx, bx, by, barW, bh, 4);
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1;
      roundRect(ctx, bx, by, barW, bh, 4);
      ctx.stroke();
    });
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.fillText(phase, gx + groupW / 2, plotY + plotH + 36);
    ctx.textAlign = "left";
  });
}

function drawMca() {
  const W = 1500;
  const H = 1800;
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 44px Arial";
  ctx.fillText("MOTOR CIRCUIT ANALYSIS - MCA GROUPED BAR REPORT", 60, 80);
  ctx.font = "24px Arial";
  ctx.fillStyle = "#334155";
  ctx.fillText("Motor: M-101   Test: ALL-TEST PRO 6   Rotor positions: 0 deg and 90 deg", 60, 120);

  // Legend
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(60, 145, 28, 20);
  ctx.fillStyle = "#0f172a";
  ctx.font = "22px Arial";
  ctx.fillText("Rotor 0 deg", 98, 163);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(260, 145, 28, 20);
  ctx.fillStyle = "#0f172a";
  ctx.fillText("Rotor 90 deg", 298, 163);

  const panelW = 660;
  const panelH = 720;
  drawPanel(ctx, {
    x: 60,
    y: 210,
    w: panelW,
    h: panelH,
    title: "Impedance Z",
    unit: "ohm",
    min: 0,
    max: 5,
    major: 1,
    minor: 0.5,
    decimals: 1,
    values: {
      0: [4.17, 4.0, 4.0],
      90: [4.0, 4.17, 4.0]
    }
  });
  drawPanel(ctx, {
    x: 780,
    y: 210,
    w: panelW,
    h: panelH,
    title: "Inductance L",
    unit: "mH",
    min: 0,
    max: 2,
    major: 0.5,
    minor: 0.1,
    decimals: 1,
    values: {
      0: [1.67, 1.59, 1.59],
      90: [1.59, 1.67, 1.59]
    }
  });
  drawPanel(ctx, {
    x: 60,
    y: 960,
    w: panelW,
    h: panelH,
    title: "Phase Angle",
    unit: "deg",
    min: 60,
    max: 90,
    major: 10,
    minor: 2,
    decimals: 0,
    values: {
      0: [84, 83, 83],
      90: [83, 84, 83]
    }
  });
  drawPanel(ctx, {
    x: 780,
    y: 960,
    w: panelW,
    h: panelH,
    title: "Relative Capacitance C",
    unit: "rel",
    min: 0,
    max: 1,
    major: 0.25,
    minor: 0.05,
    decimals: 2,
    values: {
      0: [0.51, 0.5, 0.5],
      90: [0.5, 0.51, 0.5]
    }
  });

  fs.writeFileSync(path.join(OUT, "mca-grouped-bar.png"), c.toBuffer("image/png"));
}

drawOilReport();
drawMca();
console.log("wrote", path.join(OUT, "oil-report.png"));
console.log("wrote", path.join(OUT, "mca-grouped-bar.png"));
