import {
  DIAGNOSE_NOT_RECORDED,
  DIAGNOSE_ROI_SOURCE
} from "../../lib/maintenance/prescriptiveDictionary";

export interface RoiBlockProps {
  roiPercent: number | null;
  downtimeFigure: string;
  downtimeLabel: string;
}

export default function RoiBlock({
  roiPercent,
  downtimeFigure,
  downtimeLabel
}: RoiBlockProps) {
  return (
    <>
      <p className="text-sm text-slate-400 mt-3 leading-relaxed">
        <span className="text-yellow-400 font-bold">
          ROI:{" "}
          {roiPercent != null
            ? `${roiPercent.toLocaleString()}%`
            : DIAGNOSE_NOT_RECORDED}
        </span>
        {" "}
        <span className="text-slate-600">|</span>
        {" "}
        Production Downtime Loss:{" "}
        <span className="text-white font-semibold">
          {downtimeFigure}
        </span>{" "}
        <span className="text-[10px] text-slate-500">{downtimeLabel}</span>
      </p>
      <p className="text-[10px] text-slate-500 leading-snug">
        {DIAGNOSE_ROI_SOURCE}
      </p>
    </>
  );
}
