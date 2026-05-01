import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Cancel01Icon,
  FileEditIcon,
  FolderAddIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { usePlanStore, type QueuedEdit } from "../store/planStore";

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

function diffStats(original: string, proposed: string): { added: number; removed: number } {
  const a = original.split("\n");
  const b = proposed.split("\n");
  const setA = new Set(a);
  const setB = new Set(b);
  let added = 0;
  let removed = 0;
  for (const line of b) if (!setA.has(line)) added++;
  for (const line of a) if (!setB.has(line)) removed++;
  return { added, removed };
}

export function PlanDiffReview() {
  const queue = usePlanStore((s) => s.queue);
  const removeOne = usePlanStore((s) => s.removeOne);
  const clear = usePlanStore((s) => s.clear);
  const applyAll = usePlanStore((s) => s.applyAll);
  const [busy, setBusy] = useState(false);

  if (queue.length === 0) return null;

  const onApply = async () => {
    setBusy(true);
    try {
      const results = await applyAll();
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        console.error("plan apply failures:", failed);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-card/98 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide">
          Plan review · {queue.length} change{queue.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => clear()}
            disabled={busy}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            Discard all
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1.5 text-[11px]"
            onClick={onApply}
            disabled={busy}
          >
            <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
            Apply all
          </Button>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-1.5 overflow-auto p-3">
        {queue.map((q) => (
          <PlanRow key={q.id} item={q} onReject={() => removeOne(q.id)} />
        ))}
      </ul>
    </div>
  );
}

function PlanRow({
  item,
  onReject,
}: {
  item: QueuedEdit;
  onReject: () => void;
}) {
  const isDir = item.kind === "create_directory";
  const stats = isDir
    ? null
    : diffStats(item.originalContent, item.proposedContent);

  return (
    <li className="rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5">
      <div className="flex items-start gap-2">
        <HugeiconsIcon
          icon={isDir ? FolderAddIcon : FileEditIcon}
          size={14}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] truncate">
            {basename(item.path)}
            {item.isNewFile && !isDir ? (
              <span className="ml-1 text-[10px] text-emerald-500">(new)</span>
            ) : null}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            {item.path}
          </div>
          {stats ? (
            <div className="mt-0.5 flex gap-2 text-[10px] tabular-nums">
              <span className="text-emerald-500">+{stats.added}</span>
              <span className="text-red-500">−{stats.removed}</span>
              <span className="text-muted-foreground">
                {item.kind === "multi_edit" ? "multi-edit" : item.kind}
              </span>
            </div>
          ) : (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {item.description ?? "create directory"}
            </div>
          )}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn("size-5 shrink-0")}
          onClick={onReject}
          aria-label="Reject"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={1.75} />
        </Button>
      </div>
    </li>
  );
}
