import React, { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, Calendar, ChevronDown, Clock,
  Filter, Plus, Trash2, Wrench, X
} from "lucide-react";
import { useToast } from "./Toast";

interface MaintenanceCalendarProps {
  selectedCompanyId?: number;
}

// ===== Date helpers (local time throughout to avoid UTC drift) =====

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const fromIso = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date: Date, amount: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
};

const addMonths = (date: Date, amount: number) => {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + amount);
  return copy;
};

const startOfWeek = (date: Date) => addDays(startOfDay(date), -date.getDay());

const isSameDay = (a: Date, b: Date) => toIso(a) === toIso(b);

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${String(minutes).padStart(2, "0")} ${period}`;
};

const TODAY = startOfDay(new Date());
const rel = (offset: number) => toIso(addDays(TODAY, offset));

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ===== Domain =====

type EventType = "emergency" | "pm" | "downtime";
type Priority = "Critical" | "High" | "Medium" | "Low";
type WorkOrderStatus = "Pending" | "In Progress" | "Completed";

interface CalendarEvent {
  id: number;
  title: string;
  assetName: string;
  assetType: string;
  type: EventType;
  date: string;
  time: string;
  technician: string;
  priority: Priority;
  status: WorkOrderStatus;
}

const EVENT_TYPES: Record<EventType, { label: string; block: string; dot: string }> = {
  emergency: {
    label: "Emergency Work Order",
    block: "bg-red-500/15 border-red-500/40 text-red-300 hover:bg-red-500/25",
    dot: "bg-red-500"
  },
  pm: {
    label: "Preventative Maintenance",
    block: "bg-yellow-400/15 border-yellow-400/40 text-yellow-200 hover:bg-yellow-400/25",
    dot: "bg-yellow-400"
  },
  downtime: {
    label: "Scheduled Downtime",
    block: "bg-blue-500/15 border-blue-500/40 text-blue-300 hover:bg-blue-500/25",
    dot: "bg-blue-500"
  }
};

const PRIORITY_BADGES: Record<Priority, string> = {
  Critical: "bg-red-500/10 text-red-400 border-red-500/25",
  High: "bg-orange-500/10 text-orange-400 border-orange-500/25",
  Medium: "bg-yellow-400/10 text-yellow-400 border-yellow-400/25",
  Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
};

const STATUS_BADGES: Record<WorkOrderStatus, string> = {
  Pending: "bg-slate-700/20 text-slate-400 border-slate-700",
  "In Progress": "bg-yellow-400/10 text-yellow-400 border-yellow-400/25",
  Completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
};

const TECHNICIANS = ["M. Delgado", "R. Chen", "T. Okafor", "J. Whitfield", "S. Barrett"];
const ASSET_TYPES = ["Pump", "Motor", "Fan", "Compressor", "Gearbox", "Line", "Electrical", "Route"];
const STATUSES: WorkOrderStatus[] = ["Pending", "In Progress", "Completed"];
const PRIORITIES: Priority[] = ["Critical", "High", "Medium", "Low"];

// Anchored to the current date so the grid and the 7-day panel are never empty.
const INITIAL_EVENTS: CalendarEvent[] = [
  { id: 1, title: "Monthly Vibration Route", assetName: "Plant A — Route 1", assetType: "Route", type: "pm", date: rel(-3), time: "06:00", technician: "M. Delgado", priority: "Medium", status: "Completed" },
  { id: 2, title: "Pump B Bearing Replacement", assetName: "Boiler Feed Pump B", assetType: "Pump", type: "emergency", date: rel(-1), time: "08:00", technician: "J. Whitfield", priority: "Critical", status: "Completed" },
  { id: 3, title: "Monthly Vibration Route", assetName: "Plant A — Route 2", assetType: "Route", type: "pm", date: rel(0), time: "07:00", technician: "M. Delgado", priority: "Medium", status: "In Progress" },
  { id: 4, title: "Gearbox Oil Sample", assetName: "Conveyor Gearbox 3", assetType: "Gearbox", type: "pm", date: rel(0), time: "13:30", technician: "R. Chen", priority: "Low", status: "Pending" },
  { id: 5, title: "Plant Shutdown — Line 4", assetName: "Production Line 4", assetType: "Line", type: "downtime", date: rel(1), time: "09:00", technician: "S. Barrett", priority: "High", status: "Pending" },
  { id: 6, title: "Motor Alignment Check", assetName: "Primary Induction Motor", assetType: "Motor", type: "pm", date: rel(2), time: "07:30", technician: "T. Okafor", priority: "Medium", status: "Pending" },
  { id: 7, title: "Emergency Seal Repair", assetName: "Cooling Water Pump A", assetType: "Pump", type: "emergency", date: rel(3), time: "22:00", technician: "J. Whitfield", priority: "Critical", status: "Pending" },
  { id: 8, title: "Fan Balance Correction", assetName: "Cooling Tower Fan 4", assetType: "Fan", type: "pm", date: rel(4), time: "08:00", technician: "R. Chen", priority: "Medium", status: "Pending" },
  { id: 9, title: "Compressor Overhaul Window", assetName: "Screw Compressor RS37i", assetType: "Compressor", type: "downtime", date: rel(5), time: "06:00", technician: "S. Barrett", priority: "High", status: "Pending" },
  { id: 10, title: "Quarterly Thermography Survey", assetName: "Substation 2", assetType: "Electrical", type: "pm", date: rel(6), time: "10:00", technician: "T. Okafor", priority: "Low", status: "Pending" },
  { id: 11, title: "Impeller Inspection", assetName: "Boiler Feed Pump B", assetType: "Pump", type: "pm", date: rel(8), time: "14:00", technician: "M. Delgado", priority: "Medium", status: "Pending" },
  { id: 12, title: "Emergency Coupling Replacement", assetName: "Conveyor Drive 2", assetType: "Motor", type: "emergency", date: rel(11), time: "08:00", technician: "J. Whitfield", priority: "High", status: "Pending" }
];

const inputClass =
  "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-yellow-400/60";

const selectClass =
  "appearance-none bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-8 py-2 text-[11px] font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-400/60";

type CalendarView = "month" | "week" | "day" | "list";

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
  { id: "list", label: "List" }
];

// ===== Schedule modal =====

function ScheduleModal({
  defaultDate,
  onCreate,
  onClose
}: {
  defaultDate: string;
  onCreate: (event: Omit<CalendarEvent, "id">) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState(ASSET_TYPES[0]);
  const [type, setType] = useState<EventType>("pm");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("08:00");
  const [technician, setTechnician] = useState(TECHNICIANS[0]);
  const [priority, setPriority] = useState<Priority>("Medium");
  const [status, setStatus] = useState<WorkOrderStatus>("Pending");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !assetName.trim()) {
      toast("Task title and asset name are required.", "error");
      return;
    }
    onCreate({
      title: title.trim(),
      assetName: assetName.trim(),
      assetType,
      type,
      date,
      time,
      technician,
      priority,
      status
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Calendar className="h-4 w-4 text-yellow-400" />
              <span>Schedule Maintenance</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Adds the task to the planner calendar and the upcoming queue.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close schedule form"
            className="text-slate-500 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Task Title<span className="text-yellow-400 ml-0.5">*</span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Monthly Vibration Route"
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Asset Name<span className="text-yellow-400 ml-0.5">*</span>
              </span>
              <input
                type="text"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="Boiler Feed Pump B"
                className={inputClass}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Asset Type
              </span>
              <div className="relative">
                <select
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value)}
                  className={`${inputClass} appearance-none pr-9 cursor-pointer`}
                >
                  {ASSET_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Work Type
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(EVENT_TYPES) as EventType[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setType(key)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                    type === key
                      ? EVENT_TYPES[key].block
                      : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 ${EVENT_TYPES[key].dot}`} />
                  <span className="truncate">{EVENT_TYPES[key].label}</span>
                </button>
              ))}
            </div>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Start Time
              </span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Technician
              </span>
              <div className="relative">
                <select
                  value={technician}
                  onChange={(e) => setTechnician(e.target.value)}
                  className={`${inputClass} appearance-none pr-9 cursor-pointer`}
                >
                  {TECHNICIANS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Priority
              </span>
              <div className="relative">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className={`${inputClass} appearance-none pr-9 cursor-pointer`}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Status
              </span>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as WorkOrderStatus)}
                  className={`${inputClass} appearance-none pr-9 cursor-pointer`}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-lg cursor-pointer transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Schedule Task</span>
          </button>
        </div>
      </form>
    </div>
  );
}

// ===== Event block =====

function EventBlock({ event, onRemove }: { event: CalendarEvent; onRemove?: () => void }) {
  return (
    <div
      className={`group w-full text-left rounded-md border px-1.5 py-1 transition-colors ${EVENT_TYPES[event.type].block}`}
      title={`${formatTime(event.time)} · ${event.title} · ${event.assetName}`}
    >
      <div className="flex items-start gap-1">
        <span className="flex-1 min-w-0">
          <span className="block text-[9px] font-bold font-mono opacity-80">
            {formatTime(event.time)}
          </span>
          <span className="block text-[10px] font-bold leading-tight truncate">
            {event.title}
          </span>
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove ${event.title}`}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-current hover:text-red-400 shrink-0"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ===== Page =====

export default function MaintenanceCalendar({ selectedCompanyId }: MaintenanceCalendarProps) {
  const { toast } = useToast();
  const [events, setEvents] = useState<CalendarEvent[]>(INITIAL_EVENTS);
  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState<Date>(TODAY);
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        if (technicianFilter !== "all" && event.technician !== technicianFilter) return false;
        if (assetTypeFilter !== "all" && event.assetType !== assetTypeFilter) return false;
        if (statusFilter !== "all" && event.status !== statusFilter) return false;
        return true;
      }),
    [events, technicianFilter, assetTypeFilter, statusFilter]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((event) => {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    });
    map.forEach((list) => list.sort((a, b) => a.time.localeCompare(b.time)));
    return map;
  }, [filteredEvents]);

  const monthCells = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(firstOfMonth);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const weekCells = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const monthEvents = useMemo(
    () =>
      filteredEvents
        .filter((event) => {
          const date = fromIso(event.date);
          return (
            date.getFullYear() === cursor.getFullYear() && date.getMonth() === cursor.getMonth()
          );
        })
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [filteredEvents, cursor]
  );

  const upcoming = useMemo(() => {
    const horizon = toIso(addDays(TODAY, 7));
    const todayIso = toIso(TODAY);
    return filteredEvents
      .filter((event) => event.date >= todayIso && event.date <= horizon)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }, [filteredEvents]);

  const filtersActive =
    technicianFilter !== "all" || assetTypeFilter !== "all" || statusFilter !== "all";

  // --- Navigation steps by the unit the active view represents ---
  const shift = (direction: 1 | -1) => {
    if (view === "month" || view === "list") setCursor((prev) => addMonths(prev, direction));
    else if (view === "week") setCursor((prev) => addDays(prev, 7 * direction));
    else setCursor((prev) => addDays(prev, direction));
  };

  const headingLabel = useMemo(() => {
    if (view === "day") {
      return cursor.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    }
    if (view === "week") {
      const start = startOfWeek(cursor);
      const end = addDays(start, 6);
      const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endLabel = end.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
      return `${startLabel} – ${endLabel}`;
    }
    return cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [cursor, view]);

  const removeEvent = (id: number) => setEvents((prev) => prev.filter((e) => e.id !== id));

  const createEvent = (draft: Omit<CalendarEvent, "id">) => {
    const nextId = events.reduce((max, e) => Math.max(max, e.id), 0) + 1;
    setEvents((prev) => [...prev, { ...draft, id: nextId }]);
    setCursor(fromIso(draft.date));
    setShowModal(false);
    toast(`${draft.title} scheduled for ${fromIso(draft.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`, "success");
  };

  const openDay = (date: Date) => {
    setCursor(date);
    setView("day");
  };

  const renderDayCell = (date: Date, options: { compact: boolean }) => {
    const iso = toIso(date);
    const dayEvents = eventsByDate.get(iso) ?? [];
    const inCurrentMonth = date.getMonth() === cursor.getMonth();
    const isToday = isSameDay(date, TODAY);
    const visible = options.compact ? dayEvents.slice(0, 3) : dayEvents;

    return (
      <div
        key={iso}
        onClick={() => openDay(date)}
        className={`${options.compact ? "min-h-[104px]" : "min-h-[220px]"} bg-slate-800/40 border rounded-lg p-1.5 space-y-1 cursor-pointer transition-colors hover:border-slate-600 ${
          isToday ? "border-yellow-400/60" : "border-slate-800"
        } ${inCurrentMonth || !options.compact ? "" : "opacity-40"}`}
      >
        <div className="flex items-center justify-between px-0.5">
          <span
            className={`text-[11px] font-bold font-mono ${
              isToday ? "text-yellow-400" : "text-slate-400"
            }`}
          >
            {date.getDate()}
          </span>
          {dayEvents.length > 0 && (
            <span className="text-[9px] font-bold text-slate-500 font-mono">
              {dayEvents.length}
            </span>
          )}
        </div>

        {visible.map((event) => (
          <EventBlock key={event.id} event={event} onRemove={() => removeEvent(event.id)} />
        ))}

        {options.compact && dayEvents.length > visible.length && (
          <span className="block text-[9px] font-bold text-slate-500 px-0.5">
            +{dayEvents.length - visible.length} more
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">

      {/* ===== Section A: Controls ===== */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-4 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">

          {/* Month navigation */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label="Previous period"
              className="p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg cursor-pointer transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <h3 className="text-sm font-bold text-white min-w-[190px] text-center">
              {headingLabel}
            </h3>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label="Next period"
              className="p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg cursor-pointer transition-colors"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCursor(TODAY)}
              className="ml-1 px-3 py-2 bg-slate-950 border border-slate-800 hover:border-yellow-400/50 hover:text-yellow-400 text-slate-400 text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
            >
              Today
            </button>
          </div>

          {/* View toggles */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
            {VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                  view === option.id
                    ? "bg-yellow-400 text-slate-950"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-xl cursor-pointer transition-colors shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Schedule Maintenance</span>
          </button>
        </div>

        {/* Filters + legend */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Filter className="h-3 w-3 text-yellow-400" />
              <span>Filters</span>
            </span>

            <div className="relative">
              <select
                value={technicianFilter}
                onChange={(e) => setTechnicianFilter(e.target.value)}
                aria-label="Filter by technician"
                className={selectClass}
              >
                <option value="all">All Technicians</option>
                {TECHNICIANS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown className="h-3 w-3 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={assetTypeFilter}
                onChange={(e) => setAssetTypeFilter(e.target.value)}
                aria-label="Filter by asset type"
                className={selectClass}
              >
                <option value="all">All Asset Types</option>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown className="h-3 w-3 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by work order status"
                className={selectClass}
              >
                <option value="all">All Statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown className="h-3 w-3 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setTechnicianFilter("all");
                  setAssetTypeFilter("all");
                  setStatusFilter("all");
                }}
                className="px-2.5 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {(Object.keys(EVENT_TYPES) as EventType[]).map((key) => (
              <span key={key} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                <span className={`h-2 w-2 rounded-full ${EVENT_TYPES[key].dot}`} />
                {EVENT_TYPES[key].label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Sections B + C ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

        {/* Section B: Calendar */}
        <section className="xl:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-4">
          {view === "month" && (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                  {WEEKDAYS.map((day) => (
                    <div
                      key={day}
                      className="text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest py-1"
                    >
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {monthCells.map((date) => renderDayCell(date, { compact: true }))}
                </div>
              </div>
            </div>
          )}

          {view === "week" && (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                  {weekCells.map((date) => (
                    <div key={toIso(date)} className="text-center py-1">
                      <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        {WEEKDAYS[date.getDay()]}
                      </span>
                      <span
                        className={`block text-[11px] font-bold font-mono ${
                          isSameDay(date, TODAY) ? "text-yellow-400" : "text-slate-400"
                        }`}
                      >
                        {date.getDate()}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {weekCells.map((date) => renderDayCell(date, { compact: false }))}
                </div>
              </div>
            </div>
          )}

          {view === "day" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-yellow-400" />
                  <span>{headingLabel}</span>
                </h4>
                <span className="text-[10px] font-bold text-slate-500 font-mono">
                  {(eventsByDate.get(toIso(cursor)) ?? []).length} scheduled
                </span>
              </div>

              {(eventsByDate.get(toIso(cursor)) ?? []).length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Calendar className="h-8 w-8 text-slate-700 mx-auto" />
                  <p className="text-xs font-bold text-slate-400">Nothing scheduled</p>
                  <p className="text-[11px] text-slate-500">
                    This day is clear for the current filters.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {(eventsByDate.get(toIso(cursor)) ?? []).map((event) => (
                    <li
                      key={event.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-950/40 border border-slate-800 rounded-xl p-3.5"
                    >
                      <span className="text-xs font-bold text-yellow-400 font-mono w-24 shrink-0">
                        {formatTime(event.time)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${EVENT_TYPES[event.type].dot}`} />
                          <span className="text-xs font-bold text-slate-100">{event.title}</span>
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${PRIORITY_BADGES[event.priority]}`}>
                            {event.priority}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${STATUS_BADGES[event.status]}`}>
                            {event.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {event.assetName} · {event.technician}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEvent(event.id)}
                        aria-label={`Remove ${event.title}`}
                        className="text-slate-600 hover:text-red-400 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {view === "list" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-yellow-400" />
                  <span>{headingLabel} Schedule</span>
                </h4>
                <span className="text-[10px] font-bold text-slate-500 font-mono">
                  {monthEvents.length} tasks
                </span>
              </div>

              {monthEvents.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Calendar className="h-8 w-8 text-slate-700 mx-auto" />
                  <p className="text-xs font-bold text-slate-400">No tasks this month</p>
                  <p className="text-[11px] text-slate-500">
                    Adjust the filters or schedule new maintenance.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800">
                        {["Date", "Time", "Task", "Asset", "Technician", "Priority", "Status"].map((heading) => (
                          <th
                            key={heading}
                            className="text-left pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthEvents.map((event) => (
                        <tr
                          key={event.id}
                          onClick={() => openDay(fromIso(event.date))}
                          className="border-b border-slate-800/60 last:border-0 hover:bg-slate-950/40 cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 pr-3 text-[11px] text-slate-300 font-mono whitespace-nowrap">
                            {fromIso(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </td>
                          <td className="py-2.5 pr-3 text-[11px] text-slate-400 font-mono whitespace-nowrap">
                            {formatTime(event.time)}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className="flex items-center gap-1.5">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${EVENT_TYPES[event.type].dot}`} />
                              <span className="text-[11px] font-bold text-slate-200">{event.title}</span>
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-[11px] text-slate-400">{event.assetName}</td>
                          <td className="py-2.5 pr-3 text-[11px] text-slate-400 whitespace-nowrap">{event.technician}</td>
                          <td className="py-2.5 pr-3">
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${PRIORITY_BADGES[event.priority]}`}>
                              {event.priority}
                            </span>
                          </td>
                          <td className="py-2.5">
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${STATUS_BADGES[event.status]}`}>
                              {event.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Section C: Upcoming */}
        <aside className="xl:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-5 space-y-4 self-start">
          <div className="pb-3 border-b border-slate-800">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-yellow-400" />
              <span>Upcoming Tasks</span>
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Next 7 days · {upcoming.length} scheduled
            </p>
          </div>

          {upcoming.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <AlertTriangle className="h-7 w-7 text-slate-700 mx-auto" />
              <p className="text-xs font-bold text-slate-400">Nothing upcoming</p>
              <p className="text-[11px] text-slate-500">No tasks match the current filters.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((event) => (
                <li
                  key={event.id}
                  onClick={() => openDay(fromIso(event.date))}
                  className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 space-y-1.5 hover:border-slate-700 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-yellow-400 font-mono">
                      {fromIso(event.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {" · "}
                      {formatTime(event.time)}
                    </span>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${EVENT_TYPES[event.type].dot}`} />
                  </div>

                  <p className="text-xs font-bold text-slate-100 leading-snug">{event.title}</p>
                  <p className="text-[11px] text-slate-400 truncate">{event.assetName}</p>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 min-w-0">
                      <Wrench className="h-3 w-3 shrink-0" />
                      <span className="truncate">{event.technician}</span>
                    </span>
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold shrink-0 ${PRIORITY_BADGES[event.priority]}`}>
                      {event.priority}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {showModal && (
        <ScheduleModal
          defaultDate={toIso(cursor)}
          onCreate={createEvent}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
