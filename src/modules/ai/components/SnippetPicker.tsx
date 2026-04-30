import { PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Snippet } from "../lib/snippets";

type Props = {
  snippets: readonly Snippet[];
  activeIndex: number;
  onPick: (snippet: Snippet) => void;
  onHover: (index: number) => void;
};

/**
 * Body of the snippet picker. Render inside a `<Popover open={…}>` whose
 * anchor wraps the textarea — that way it portals out of any clipped
 * (overflow-hidden) ancestor and sits above the input.
 */
export function SnippetPickerContent({
  snippets,
  activeIndex,
  onPick,
  onHover,
}: Props) {
  return (
    <PopoverContent
      side="top"
      align="start"
      sideOffset={6}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      className="w-72 overflow-hidden rounded-lg border border-border/60 bg-popover/95 p-0 shadow-xl backdrop-blur-xl"
    >
      {snippets.length === 0 ? (
        <div className="px-3 py-2.5 text-[11px] text-muted-foreground">
          No matching snippets. Add some in Settings → Agents.
        </div>
      ) : (
        <ul className="max-h-56 overflow-y-auto py-1">
          {snippets.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(s)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left text-[12px]",
                  i === activeIndex ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className="font-mono text-muted-foreground">
                    #{s.handle}
                  </span>
                  <span className="font-medium">{s.name}</span>
                </span>
                {s.description ? (
                  <span className="line-clamp-1 text-[10.5px] text-muted-foreground">
                    {s.description}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </PopoverContent>
  );
}
