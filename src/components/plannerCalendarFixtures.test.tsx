/**
 * SWEEP-2 fixture branches (rendered with react-dom/server — no jsdom in this repo):
 * 1. PlannerGrid keep-cards: differing buckets render 5 modality cards, never the collapse sentence.
 * 2. DayCell dense day: at most 1 chip + "+N more" pill; hidden events listed in the pill title.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlannerGrid } from "./planning/RouteCadenceSection";
import { DayCell } from "./MaintenanceCalendar";

describe("PlannerGrid keep-cards branch", () => {
  it("renders five modality cards when buckets differ - not the collapse sentence", () => {
    const html = renderToStaticMarkup(
      <PlannerGrid
        rows={[
          {
            id: "route-boiler-feed",
            name: "Boiler Feed System",
            frequency: "Monthly",
            freqDays: 30,
            analyst: null,
            buckets: [
              { modality: "vibration", label: "Vibration", lastDate: "2020-01-01T10:00:00.000Z" },
              { modality: "thermography", label: "Thermography", lastDate: null },
              { modality: "ultrasound", label: "Ultrasound", lastDate: "2020-06-15T10:00:00.000Z" },
              { modality: "mca", label: "MCA", lastDate: null },
              { modality: "oil", label: "Oil", lastDate: null }
            ],
            lastAny: "2020-06-15T10:00:00.000Z"
          }
        ]}
      />
    );
    const cardLabels = html.match(/uppercase tracking-wider text-slate-500/g) ?? [];
    expect(cardLabels.length).toBe(5);
    expect(html).not.toContain("for vibration, thermography");
    expect(html).toContain("overdue — guidance flag, not a diagnosis");
    expect(html).toContain("no collection recorded - due date cannot be computed");
  });
});

describe("DayCell dense-day branch", () => {
  it("shows one chip plus a +N more pill; hidden events listed in the pill title", () => {
    const events = [1, 2, 3, 4, 5].map((n) => ({
      id: `ev-${n}`,
      title: `Synthetic event ${n}`,
      time: "10:00 AM",
      when: new Date(2026, 8, 7, 10, 0),
      kind: "alert" as const,
      assetId: "asset-1",
      tech: "—",
      tools: "—",
      parts: "—",
      vibration: "—"
    }));
    const html = renderToStaticMarkup(
      <DayCell day={7} events={events} onSelect={() => undefined} />
    );
    expect((html.match(/<button/g) ?? []).length).toBe(1);
    expect(html).toContain("+4 more");
    expect(html).toContain("Synthetic event 1");
    expect(html).toContain(
      'title="10:00 AM — Synthetic event 2\n10:00 AM — Synthetic event 3\n10:00 AM — Synthetic event 4\n10:00 AM — Synthetic event 5"'
    );
    for (const n of [2, 3, 4, 5]) {
      const chipTextCount = (html.split(`Synthetic event ${n}`).length - 1);
      expect(chipTextCount).toBe(1);
    }
  });
});
