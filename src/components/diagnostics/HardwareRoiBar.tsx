export default function HardwareRoiBar() {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 hover:border-amber-500/30 transition-all">
      <span className="font-bold uppercase tracking-wider text-[#FFC700] shrink-0">
        Hardware ROI
      </span>
      <span className="text-slate-600 hidden sm:inline">|</span>
      <span>
        Legacy quote{" "}
        <span className="text-red-400/80 line-through">-$24k</span>
      </span>
      <span className="text-slate-600">→</span>
      <span>
        Spectra sensor{" "}
        <span className="text-emerald-400 font-semibold">$600</span>
      </span>
      <span className="text-slate-600 hidden sm:inline">|</span>
      <span className="text-amber-400/90 font-medium">
        +$23,400 CapEx retained
      </span>
    </div>
  );
}
