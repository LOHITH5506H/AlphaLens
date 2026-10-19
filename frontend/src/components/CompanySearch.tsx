"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { SearchSuggestion } from "@/types";
import { getFuzzySuggestions, resolveCompanyQuery } from "@/lib/searchUtils";
import { fetchSearchSuggestions } from "@/lib/api";

interface CompanySearchProps {
  onSelectTicker: (
    ticker: string,
    detail?: { name?: string; isCorrection?: boolean; reason?: string }
  ) => void;
  placeholder?: string;
  compact?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export const CompanySearch: React.FC<CompanySearchProps> = ({
  onSelectTicker,
  placeholder = "Search company or ticker (e.g., Apple, epp, NVDA)...",
  compact = false,
  className = "",
  autoFocus = false,
}) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Update suggestions on query change
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      setIsOpen(false);
      setSelectedIndex(-1);
      return;
    }

    // 1. Instant 0ms client-side fuzzy suggestions
    const clientSuggestions = getFuzzySuggestions(trimmed, 5);
    setSuggestions(clientSuggestions);
    setIsOpen(clientSuggestions.length > 0);
    setSelectedIndex(-1);

    // 2. Fetch backend suggestions as supplementary sync
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        const backendSuggestions = await fetchSearchSuggestions(trimmed);
        if (backendSuggestions && backendSuggestions.length > 0) {
          setSuggestions(backendSuggestions);
          setIsOpen(true);
        }
      } catch {
        // Keep client suggestions
      }
    }, 150);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  const handleSelect = useCallback(
    (item: SearchSuggestion) => {
      setIsOpen(false);
      setQuery("");
      setSelectedIndex(-1);

      if (item.isCorrection) {
        setFeedback(`✨ Corrected to ${item.name} (${item.symbol})`);
        setTimeout(() => setFeedback(null), 3500);
      }

      onSelectTicker(item.symbol, {
        name: item.name,
        isCorrection: item.isCorrection,
        reason: item.matchReason,
      });
    },
    [onSelectTicker]
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) return;

      setIsSearching(true);

      // If user highlighted a suggestion via arrow keys
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        handleSelect(suggestions[selectedIndex]);
        setIsSearching(false);
        return;
      }

      // If there are suggestions, pick the top one (e.g. 'epp' -> Apple)
      if (suggestions.length > 0) {
        handleSelect(suggestions[0]);
        setIsSearching(false);
        return;
      }

      // Fallback resolver
      const resolved = resolveCompanyQuery(trimmed);
      setIsOpen(false);
      setQuery("");
      setSelectedIndex(-1);

      if (resolved.isCorrection) {
        setFeedback(`✨ Corrected "${trimmed}" to ${resolved.name || resolved.ticker}`);
        setTimeout(() => setFeedback(null), 3500);
      }

      onSelectTicker(resolved.ticker, {
        name: resolved.name,
        isCorrection: resolved.isCorrection,
        reason: resolved.reason,
      });
      setIsSearching(false);
    },
    [query, selectedIndex, suggestions, handleSelect, onSelectTicker]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen && suggestions.length > 0) {
        setIsOpen(true);
      }
      setSelectedIndex((prev) =>
        suggestions.length > 0 ? (prev + 1) % suggestions.length : -1
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        suggestions.length > 0
          ? prev <= 0
            ? suggestions.length - 1
            : prev - 1
          : -1
      );
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setSelectedIndex(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Search Input Box */}
      <form
        onSubmit={handleSubmit}
        className={`flex items-center gap-2 rounded-xl transition-all duration-200 ${
          compact
            ? "bg-slate-900/90 border border-slate-700/80 px-2.5 py-1.5 focus-within:border-cyan-400 focus-within:shadow-[0_0_12px_rgba(6,182,212,0.25)]"
            : "bg-slate-950/80 backdrop-blur-xl border border-cyan-500/30 px-3.5 py-2 shadow-[0_0_20px_rgba(6,182,212,0.15)] focus-within:border-cyan-400 focus-within:shadow-[0_0_25px_rgba(6,182,212,0.3)]"
        }`}
      >
        <span className="text-cyan-400 text-sm shrink-0">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`flex-1 bg-transparent border-none text-white outline-none placeholder-slate-400 font-sans ${
            compact ? "text-xs" : "text-sm"
          }`}
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSuggestions([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="text-slate-400 hover:text-white text-xs px-1"
            title="Clear"
          >
            ✕
          </button>
        )}

        <button
          type="submit"
          disabled={isSearching}
          className={`shrink-0 font-bold font-mono transition-all rounded-lg ${
            compact
              ? "px-2 py-0.5 text-[10.5px] bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40"
              : "px-3 py-1 text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md font-semibold"
          }`}
        >
          {isSearching ? "..." : "Search"}
        </button>
      </form>

      {/* Auto-Correction Feedback Toast */}
      {feedback && (
        <div className="absolute top-full left-0 mt-1.5 w-full z-50 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs font-medium shadow-lg backdrop-blur-md">
            <span>🎯</span>
            <span>{feedback}</span>
          </div>
        </div>
      )}

      {/* Suggestion Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1.5 w-full z-50 rounded-xl bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/40 shadow-[0_12px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(6,182,212,0.2)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-1.5 border-b border-slate-800/80 flex items-center justify-between text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            <span>Suggested Companies</span>
            <span className="text-cyan-400/80 font-mono">
              ↑↓ to navigate · Enter to select
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60">
            {suggestions.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={`${item.symbol}-${idx}`}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-3 py-2.5 transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? "bg-cyan-500/20 border-l-2 border-cyan-400 pl-2.5 shadow-[inset_0_0_12px_rgba(6,182,212,0.15)]"
                      : "hover:bg-slate-900/80"
                  }`}
                >
                  {/* Left: Ticker & Details */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className="font-mono font-bold text-sm text-cyan-300">
                        {item.symbol}
                      </span>
                      {item.exchange && (
                        <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {item.exchange}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {item.name}
                      </div>
                      {item.sector && (
                        <div className="text-[10px] text-slate-400 truncate">
                          {item.sector}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Typo Correction Badge or Match Reason */}
                  <div className="shrink-0 text-right">
                    {item.isCorrection ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/60 text-amber-200 animate-pulse">
                        <span>🎯</span>
                        <span>{item.matchReason || `Typo match for "${query}"`}</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {item.matchReason}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
