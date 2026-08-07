import React, { useState, useEffect } from "react";
import { Sparkles, Activity, CheckCircle2, Loader2, Cpu, Brain, FileText } from "lucide-react";

interface ResultsLoadingSkeletonProps {
  progress: number;
  message: string;
}

export default function ResultsLoadingSkeleton({ progress, message }: ResultsLoadingSkeletonProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 0.1);
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // Time thresholds
  const step1Time = 4.5; // Step 1 extraction completes at 4.5s
  const step2Time = 9.0; // Step 2 analysis completes at 9.0s

  // Step 1: Vision Extraction
  const s1Active = elapsed < step1Time;
  const s1Completed = elapsed >= step1Time;
  const s1Progress = Math.min(100, Math.round((elapsed / step1Time) * 100));

  // Step 2: ISO & Category IV Analysis
  const s2Active = elapsed >= step1Time && elapsed < step2Time;
  const s2Completed = elapsed >= step2Time;
  const s2Progress = elapsed < step1Time ? 0 : Math.min(100, Math.round(((elapsed - step1Time) / (step2Time - step1Time)) * 100));

  return (
    <div className="space-y-6 pt-6 border-t border-slate-800 animate-fade-in text-left">
      {/* AI Consensus Engine Active Dashboard Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        {/* Background ambient accent glows */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl -mr-20 -mt-20 animate-pulse pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -ml-20 -mb-20 animate-pulse pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
              </span>
              <h3 className="font-mono font-black text-xs text-white uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-spin" />
                Category IV Analyst Pipeline Active
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              Deploying sequential dual-stage diagnostic pipeline for deep vibration spectral extraction and analytical reasoning.
            </p>
          </div>
          <div className="px-3 py-1 bg-slate-950 border border-slate-800 rounded-lg shrink-0">
            <span className="text-[10px] text-slate-400 font-mono">Pipeline Status: </span>
            <span className="text-[10px] text-yellow-400 font-mono font-bold animate-pulse">RUNNING</span>
          </div>
        </div>

        {/* 2 Sequential AI Team Progress Bars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
          
          {/* Step 1: Vision Extraction */}
          <div className={`p-4 rounded-xl border transition-all duration-300 ${
            s1Completed 
              ? "bg-emerald-950/10 border-emerald-500/20" 
              : s1Active 
                ? "bg-slate-850 border-slate-700 shadow-md" 
                : "bg-slate-950/40 border-slate-900 opacity-50"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Cpu className={`w-4 h-4 ${s1Completed ? "text-emerald-400" : s1Active ? "text-yellow-400" : "text-slate-500"}`} />
                <span className="text-[11px] font-mono font-bold text-white">Stage 1: Vision Feature Extractor</span>
              </div>
              {s1Completed ? (
                <span className="text-emerald-400 text-xs font-bold font-mono">✅</span>
              ) : s1Active ? (
                <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin shrink-0" />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-sans mb-3 h-7 leading-relaxed">
              Step 1: Extracting spectrum features via vision analysis...
            </p>
            <div className="space-y-1">
              <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-850">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    s1Completed ? "bg-emerald-500" : "bg-yellow-500 animate-pulse"
                  }`}
                  style={{ width: `${s1Progress}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[9px] font-mono text-slate-500">
                <span>Vision Scan</span>
                <span>{s1Progress}%</span>
              </div>
            </div>
          </div>

          {/* Step 2: Category IV Analyst */}
          <div className={`p-4 rounded-xl border transition-all duration-300 ${
            s2Completed 
              ? "bg-emerald-950/10 border-emerald-500/20" 
              : s2Active 
                ? "bg-slate-850 border-slate-700 shadow-md" 
                : "bg-slate-950/40 border-slate-900 opacity-50"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Brain className={`w-4 h-4 ${s2Completed ? "text-emerald-400" : s2Active ? "text-yellow-400" : "text-slate-500"}`} />
                <span className="text-[11px] font-mono font-bold text-white">Stage 2: Category IV Analytical Core</span>
              </div>
              {s2Completed ? (
                <span className="text-emerald-400 text-xs font-bold font-mono">✅</span>
              ) : s2Active ? (
                <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin shrink-0" />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-sans mb-3 h-7 leading-relaxed">
              Step 2: Processing via ISO-10816 ISO and Category IV analyst...
            </p>
            <div className="space-y-1">
              <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-850">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    s2Completed ? "bg-emerald-500" : s2Active ? "bg-yellow-500 animate-pulse" : "bg-slate-800"
                  }`}
                  style={{ width: `${s2Progress}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[9px] font-mono text-slate-500">
                <span>ISO Rules & Engineering Reasoning</span>
                <span>{s2Progress}%</span>
              </div>
            </div>
          </div>

        </div>

        {/* Global Progress Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 w-full md:max-w-md">
            <Activity className="w-4 h-4 text-slate-400 animate-pulse shrink-0" />
            <p className="text-[11px] text-slate-300 font-mono italic animate-pulse truncate">
              Dispatcher Log: {message}
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-end">
            <div className="w-40 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-850 relative">
              <div 
                className="h-full bg-gradient-to-r from-yellow-500 to-amber-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-300 font-mono font-bold w-8 text-right">
              {progress}%
            </span>
          </div>
        </div>
      </div>

      {/* ISO Threshold Table Skeleton */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="h-4 bg-slate-800 rounded w-1/4 animate-pulse" />
          <div className="h-3 bg-slate-800 rounded w-1/6 animate-pulse" />
        </div>
        
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-slate-850/20">
              <div className="h-4 bg-slate-800 rounded w-1/3 animate-pulse" />
              <div className="h-4 bg-slate-800 rounded w-1/12 animate-pulse" />
              <div className="h-4 bg-slate-800 rounded w-1/6 animate-pulse" />
              <div className="h-4 bg-slate-800 rounded w-1/12 animate-pulse" />
              <div className="h-4 bg-slate-800 rounded w-1/8 animate-pulse text-right" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
