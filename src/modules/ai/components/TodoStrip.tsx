import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { useTodosStore } from "../store/todoStore";
import type { Todo } from "../lib/todos";

type Props = { sessionId: string | null };

const EMPTY_TODOS: Todo[] = [];

export function TodoStrip({ sessionId }: Props) {
  const hydrate = useTodosStore((s) => s.hydrate);
  // Select the stored slot directly. Returning `s.bySession[id] ?? []` would
  // produce a fresh `[]` every render and loop useSyncExternalStore.
  const todos = useTodosStore((s) =>
    sessionId ? s.bySession[sessionId] : undefined,
  ) ?? EMPTY_TODOS;

  useEffect(() => {
    if (sessionId) void hydrate(sessionId);
  }, [sessionId, hydrate]);

  if (!sessionId || todos.length === 0) return null;

  const completed = todos.filter((t) => t.status === "completed").length;

  return (
    <div className="shrink-0 border-b border-border/60 bg-muted/20 px-2.5 py-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Plan
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {completed}/{todos.length}
        </span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {todos.map((t) => (
          <li
            key={t.id}
            className="flex items-start gap-2 rounded px-1 py-0.5 text-[11px]"
          >
            <span className="mt-[3px] inline-flex size-3 shrink-0 items-center justify-center">
              {t.status === "in_progress" ? (
                <Spinner className="size-3" />
              ) : (
                <span
                  className={cn(
                    "size-2 rounded-full border",
                    t.status === "completed"
                      ? "border-emerald-500/40 bg-emerald-500/40"
                      : "border-muted-foreground/40",
                  )}
                />
              )}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 leading-snug",
                t.status === "completed"
                  ? "text-muted-foreground/60 line-through"
                  : t.status === "in_progress"
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {t.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
