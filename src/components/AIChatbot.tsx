import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, X, Trash2, Sparkles, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

const STORAGE_KEY = "motormedic_chat_history_v6";

export default function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load chat history from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setMessages(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    } else {
      // Seed with initial welcome message
      const welcomeMessage: Message = {
        id: "welcome-msg",
        role: "assistant",
        content: "Welcome to MotorMedic Pro Support! I am your AI assistant, specializing in vibration analysis, condition monitoring, and machine reliability. How can I help you today?",
        timestamp: Date.now()
      };
      setMessages([welcomeMessage]);
    }
  }, []);

  // Save chat history to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  // Scroll to bottom on updates
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setError(null);
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const chatHistory = messages
        .concat(userMessage)
        .map(msg => ({
          role: msg.role === "assistant" ? "model" : msg.role,
          content: msg.content
        }));

      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatHistory })
      });

      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage: Message = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.response || "No response received.",
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error("Error communicating with chatbot API:", err);
      setError("Failed to get response. Please verify connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear your chat history?")) {
      const welcomeMessage: Message = {
        id: "welcome-msg",
        role: "assistant",
        content: "Welcome to MotorMedic Pro Support! I am your AI assistant, specializing in vibration analysis, condition monitoring, and machine reliability. How can I help you today?",
        timestamp: Date.now()
      };
      setMessages([welcomeMessage]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([welcomeMessage]));
      setError(null);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans" id="ai-chatbot-root">
      <AnimatePresence>
        {/* Toggle Button */}
        {!isOpen && (
          <motion.button
            key="chat-button"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(true)}
            className="flex items-center justify-center w-14 h-14 bg-amber-500 text-slate-950 rounded-full shadow-2xl cursor-pointer hover:bg-amber-400 border border-amber-400/40 relative group"
            id="ai-chatbot-toggle-open"
          >
            <MessageSquare className="w-6 h-6" />
            <span className="absolute -top-2 -right-1 bg-rose-500 w-3 h-3 rounded-full animate-ping"></span>
            <span className="absolute -top-2 -right-1 bg-rose-500 w-3 h-3 rounded-full border border-slate-950"></span>
            
            {/* Tooltip */}
            <span className="absolute right-16 bg-[#0b1329] text-amber-400 text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl border border-slate-800">
              Chat with MotorMedic AI
            </span>
          </motion.button>
        )}

        {/* Chat Panel */}
        {isOpen && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="flex flex-col w-[380px] sm:w-[420px] h-[550px] bg-[#0b1329] border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden"
            id="ai-chatbot-panel"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 bg-[#0a0f1d] border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    MotorMedic Assistant
                  </h3>
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-[10px] font-mono text-slate-400">Online & ready</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleClearHistory}
                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-900 transition-all cursor-pointer"
                  title="Clear Conversation History"
                  id="ai-chatbot-clear-history"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 transition-all cursor-pointer"
                  id="ai-chatbot-toggle-close"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Message Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800" id="ai-chatbot-messages">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed max-w-[85%] ${
                      msg.role === "user"
                        ? "bg-amber-500 text-slate-950 font-medium rounded-tr-none shadow-md"
                        : "bg-slate-900/80 text-slate-200 border border-slate-800/60 rounded-tl-none shadow"
                    }`}
                  >
                    <p className="whitespace-pre-line">{msg.content}</p>
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono mt-1 px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}

              {/* Loading Indicator */}
              {isLoading && (
                <div className="flex flex-col items-start">
                  <div className="px-3.5 py-3 rounded-2xl rounded-tl-none bg-slate-900/80 text-slate-400 border border-slate-800/60 flex items-center gap-1 shadow">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce"></span>
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Footer */}
            <form
              onSubmit={handleSend}
              className="p-3 bg-[#0a0f1d] border-t border-slate-800/80 flex items-center gap-2"
              id="ai-chatbot-form"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about bearing defects, specs, or features..."
                className="flex-1 bg-slate-950 text-xs font-medium text-slate-200 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2.5 outline-none transition-all placeholder:text-slate-500"
                disabled={isLoading}
                id="ai-chatbot-input-field"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 rounded-xl transition-all shadow cursor-pointer shrink-0"
                id="ai-chatbot-send-btn"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
