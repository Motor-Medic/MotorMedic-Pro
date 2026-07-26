import React, { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in MotorMedic Pro:", error, errorInfo);
  }

  private handleReset = () => {
    (this as any).setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if ((this as any).state.hasError) {
      return (
        <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center p-6 text-slate-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-rose-400" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-bold font-display text-white">Something went wrong</h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                MotorMedic Pro encountered an unexpected execution error. Please try refreshing the application.
              </p>
            </div>

            {(this as any).state.error && (
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 text-[10px] font-mono text-rose-400 text-left overflow-auto max-h-32 select-all">
                {(this as any).state.error.toString()}
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full py-3 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-black text-xs rounded-xl tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Application</span>
            </button>
            
            <p className="text-[10px] text-slate-500 font-mono">
              If the problem persists, please contact reliability support.
            </p>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
