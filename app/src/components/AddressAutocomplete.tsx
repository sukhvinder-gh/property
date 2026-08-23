"use client";

import { useEffect, useRef, useState } from "react";

interface Suggestion {
  placeId: string;
  text: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onSubmit,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const sessionTokenRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // crypto.randomUUID needs a browser context — generate the first session
  // token on mount rather than at module/render time.
  useEffect(() => {
    sessionTokenRef.current = crypto.randomUUID();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function fetchSuggestions(input: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (input.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/places-autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, sessionToken: sessionTokenRef.current }),
          signal: controller.signal,
        });
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
        setOpen(true);
        setActiveIndex(-1);
      } catch {
        // aborted (superseded by a newer keystroke) or network error — leave suggestions as-is
      }
    }, 300);
  }

  function select(s: Suggestion) {
    onChange(s.text);
    setSuggestions([]);
    setOpen(false);
    sessionTokenRef.current = crypto.randomUUID(); // new billing session after a completed pick
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          fetchSuggestions(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) {
            if (e.key === "Enter") onSubmit?.();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (activeIndex >= 0) select(suggestions[activeIndex]);
            else onSubmit?.();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border bg-white text-sm shadow">
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              className={`cursor-pointer px-3 py-2 ${i === activeIndex ? "bg-neutral-100" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                select(s);
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
