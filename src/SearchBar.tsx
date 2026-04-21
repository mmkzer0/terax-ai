import type { SearchAddon } from "@xterm/addon-search";
import { useEffect, useRef, useState } from "react";
import { Input } from "./components/ui/input";

const DECORATIONS = {
  matchBackground: "#515c6a",
  activeMatchBackground: "#d18616",
  matchOverviewRuler: "#d18616",
  activeMatchColorOverviewRuler: "#d18616",
};

type Props = {
  addon: SearchAddon | null;
  open: boolean;
  onClose: () => void;
};

export function SearchBar({ addon, open, onClose }: Props) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const find = (forward: boolean) => {
    if (!addon || !q) return;
    const opts = { decorations: DECORATIONS };
    if (forward) addon.findNext(q, opts);
    else addon.findPrevious(q, opts);
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 10,
        background: "#1a1f2e",
        padding: 6,
        borderRadius: 6,
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <Input
        ref={inputRef}
        value={q}
        placeholder="Find"
        className="h-8 w-56"
        onChange={(e) => {
          const next = e.target.value;
          setQ(next);
          if (addon && next) {
            addon.findNext(next, {
              incremental: true,
              decorations: DECORATIONS,
            });
          } else {
            addon?.clearDecorations();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            find(!e.shiftKey);
          } else if (e.key === "Escape") {
            e.preventDefault();
            addon?.clearDecorations();
            onClose();
          }
        }}
      />
    </div>
  );
}
