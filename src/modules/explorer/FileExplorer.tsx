import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Cancel01Icon,
  FileAddIcon,
  Folder01Icon,
  FolderAddIcon,
  Refresh01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { FileTreeNode } from "./FileTreeNode";
import { InlineInput } from "./InlineInput";
import { copyToClipboard, revealInFinder } from "./lib/contextActions";
import { fileIconUrl, folderIconUrl } from "./lib/iconResolver";
import { COMPACT_CONTENT, COMPACT_ITEM } from "./lib/menuItemClass";
import { useFileTree } from "./lib/useFileTree";

type SearchHit = {
  path: string;
  rel: string;
  name: string;
  is_dir: boolean;
};

type Props = {
  rootPath: string | null;
  onOpenFile: (path: string) => void;
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAttachToAgent?: (path: string) => void;
};

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

export function FileExplorer({
  rootPath,
  onOpenFile,
  onPathRenamed,
  onPathDeleted,
  onRevealInTerminal,
  onAttachToAgent,
}: Props) {
  const tree = useFileTree(rootPath, { onPathRenamed, onPathDeleted });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!rootPath) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let alive = true;
    const handle = setTimeout(async () => {
      try {
        const hits = await invoke<SearchHit[]>("fs_search", {
          root: rootPath,
          query: q,
          limit: 200,
        });
        if (alive) setResults(hits);
      } catch (e) {
        if (alive) {
          console.error("fs_search failed:", e);
          setResults([]);
        }
      } finally {
        if (alive) setSearching(false);
      }
    }, 120);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [query, rootPath]);

  if (!rootPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <HugeiconsIcon
          icon={Folder01Icon}
          size={24}
          strokeWidth={1.5}
          className="text-muted-foreground"
        />
        <div className="text-xs text-muted-foreground">
          No current directory
        </div>
      </div>
    );
  }

  const root = tree.nodes[rootPath];
  const pendingAtRoot =
    tree.pendingCreate?.parentPath === rootPath ? tree.pendingCreate : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 px-2">
        <span
          className="flex-1 flex truncate text-xs font-medium text-foreground/80"
          title={rootPath}
        >
          <img
            src={folderIconUrl(basename(rootPath), false)}
            alt=""
            height={15}
            width={15}
            className="mx-1.5"
          />
          {basename(rootPath)}
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() => setIsSearchOpen(!isSearchOpen)}
          title="New file"
        >
          <HugeiconsIcon icon={Search01Icon} size={13} strokeWidth={2} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() => tree.beginCreate(rootPath, "file")}
          title="New file"
        >
          <HugeiconsIcon icon={FileAddIcon} size={13} strokeWidth={2} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() => tree.beginCreate(rootPath, "dir")}
          title="New folder"
        >
          <HugeiconsIcon icon={FolderAddIcon} size={13} strokeWidth={2} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() => tree.refresh(rootPath)}
          title="Refresh"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={12} strokeWidth={2} />
        </Button>
      </div>

      {isSearchOpen && (
        <motion.div
          className="relative shrink-0 px-2 py-1.5"
          initial={{ opacity: 0, transform: "translateY(-15px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
        >
          <HugeiconsIcon
            icon={Search01Icon}
            size={13}
            strokeWidth={2}
            className="absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files…"
            className="h-7 pr-7 pl-6.5 text-xs"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-3.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
            </button>
          ) : null}
        </motion.div>
      )}

      {query.trim() ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="py-1">
            {searching && results.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                No matches
              </div>
            ) : (
              results.map((hit) => {
                const url = hit.is_dir ? null : fileIconUrl(hit.name);
                return (
                  <button
                    key={hit.path}
                    type="button"
                    onClick={() => {
                      if (!hit.is_dir) onOpenFile(hit.path);
                    }}
                    className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-accent"
                    title={hit.path}
                  >
                    {url ? (
                      <img src={url} alt="" className="size-3.5 shrink-0" />
                    ) : (
                      <HugeiconsIcon
                        icon={Folder01Icon}
                        size={13}
                        strokeWidth={1.75}
                        className="shrink-0 text-muted-foreground"
                      />
                    )}
                    <span className="truncate">{hit.name}</span>
                    <span className="ml-auto truncate text-[10px] text-muted-foreground">
                      {hit.rel}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <ScrollArea className="min-h-0 flex-1">
              <div className="py-1">
                {pendingAtRoot && (
                  <div
                    className="flex w-full items-center gap-1.5 px-1.5 py-0.5 text-xs"
                    style={{ paddingLeft: 6 }}
                  >
                    <span className="size-3 shrink-0" />
                    <span className="size-4 shrink-0" />
                    <InlineInput
                      initial=""
                      placeholder={
                        pendingAtRoot.kind === "dir" ? "New folder" : "New file"
                      }
                      onCommit={tree.commitCreate}
                      onCancel={tree.cancelCreate}
                    />
                  </div>
                )}
                {root?.status === "loading" && (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground">
                    Loading…
                  </div>
                )}
                {root?.status === "error" && (
                  <div className="px-3 py-2 text-[11px] text-destructive">
                    {root.message}
                  </div>
                )}
                {root?.status === "loaded" &&
                  root.entries.map((entry) => (
                    <FileTreeNode
                      key={entry.name}
                      entry={entry}
                      parentPath={rootPath}
                      rootPath={rootPath}
                      depth={0}
                      tree={tree}
                      onOpenFile={onOpenFile}
                      onRevealInTerminal={onRevealInTerminal}
                      onAttachToAgent={onAttachToAgent}
                    />
                  ))}
              </div>
            </ScrollArea>
          </ContextMenuTrigger>
          <ContextMenuContent className={COMPACT_CONTENT}>
            {onRevealInTerminal && (
              <ContextMenuItem
                className={COMPACT_ITEM}
                onSelect={() => onRevealInTerminal(rootPath)}
              >
                Open in Terminal
              </ContextMenuItem>
            )}
            <ContextMenuItem
              className={COMPACT_ITEM}
              onSelect={() => void revealInFinder(rootPath)}
            >
              Reveal in Finder
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className={COMPACT_ITEM}
              onSelect={() => tree.beginCreate(rootPath, "file")}
            >
              New File
            </ContextMenuItem>
            <ContextMenuItem
              className={COMPACT_ITEM}
              onSelect={() => tree.beginCreate(rootPath, "dir")}
            >
              New Folder
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className={COMPACT_ITEM}
              onSelect={() => void copyToClipboard(rootPath)}
            >
              Copy Path
            </ContextMenuItem>
            <ContextMenuItem
              className={COMPACT_ITEM}
              onSelect={() => tree.refresh(rootPath)}
            >
              Refresh
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
    </div>
  );
}
