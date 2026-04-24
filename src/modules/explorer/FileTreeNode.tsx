import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useCallback } from "react";
import { fileIconUrl, folderIconUrl } from "./lib/iconResolver";
import { InlineInput } from "./InlineInput";
import type { DirEntry, useFileTree } from "./lib/useFileTree";

type Tree = ReturnType<typeof useFileTree>;

type Props = {
  entry: DirEntry;
  parentPath: string;
  depth: number;
  tree: Tree;
  onOpenFile: (path: string) => void;
};

function FileTreeNodeImpl({
  entry,
  parentPath,
  depth,
  tree,
  onOpenFile,
}: Props) {
  const path = tree.joinPath(parentPath, entry.name);
  const isDir = entry.kind === "dir";
  const isExpanded = isDir && tree.expanded.has(path);
  const children = isExpanded ? tree.nodes[path] : undefined;
  const isRenaming = tree.renaming === path;

  const iconUrl = isDir
    ? folderIconUrl(entry.name, isExpanded)
    : fileIconUrl(entry.name);

  const handleClick = useCallback(() => {
    if (tree.renaming) return;
    if (isDir) tree.toggle(path);
    else onOpenFile(path);
  }, [isDir, path, tree, onOpenFile]);

  const pendingInThisDir =
    isDir &&
    isExpanded &&
    tree.pendingCreate?.parentPath === path
      ? tree.pendingCreate
      : null;

  // Context menu is placed on the row itself; for a directory, New File /
  // New Folder target that directory. For a file, they target its parent.
  const createTarget = isDir ? path : parentPath;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {isRenaming ? (
            <div
              className="flex w-full items-center gap-1.5 px-1.5 py-0.5 text-xs"
              style={{ paddingLeft: 6 + depth * 12 }}
            >
              <span className="size-3 shrink-0" />
              {iconUrl ? (
                <img src={iconUrl} alt="" className="size-4 shrink-0" />
              ) : (
                <span className="size-4 shrink-0" />
              )}
              <InlineInput
                initial={entry.name}
                onCommit={tree.commitRename}
                onCancel={tree.cancelRename}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={handleClick}
              onDoubleClick={() => !isDir && tree.beginRename(path)}
              className={cn(
                "group flex w-full items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-left text-xs text-foreground/85 transition-colors hover:bg-accent/70",
              )}
              style={{ paddingLeft: 6 + depth * 12 }}
            >
              <span className="flex size-3 shrink-0 items-center justify-center text-muted-foreground">
                {isDir ? (
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={10}
                    strokeWidth={2.25}
                    className={cn(
                      "transition-transform",
                      isExpanded && "rotate-90",
                    )}
                  />
                ) : null}
              </span>
              {iconUrl ? (
                <img src={iconUrl} alt="" className="size-4 shrink-0" />
              ) : (
                <span className="size-4 shrink-0" />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem
            onSelect={() => tree.beginCreate(createTarget, "file")}
          >
            New File
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => tree.beginCreate(createTarget, "dir")}
          >
            New Folder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => tree.beginRename(path)}>
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => {
              if (
                window.confirm(
                  `Delete "${entry.name}"${isDir ? " and all its contents" : ""}?`,
                )
              ) {
                void tree.deletePath(path);
              }
            }}
          >
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {pendingInThisDir && (
        <div
          className="flex w-full items-center gap-1.5 px-1.5 py-0.5 text-xs"
          style={{ paddingLeft: 6 + (depth + 1) * 12 }}
        >
          <span className="size-3 shrink-0" />
          <span className="size-4 shrink-0" />
          <InlineInput
            initial=""
            placeholder={
              pendingInThisDir.kind === "dir" ? "New folder" : "New file"
            }
            onCommit={tree.commitCreate}
            onCancel={tree.cancelCreate}
          />
        </div>
      )}

      {isDir && isExpanded && children?.status === "loading" && (
        <div
          className="px-2 py-0.5 text-[11px] text-muted-foreground"
          style={{ paddingLeft: 6 + (depth + 1) * 12 + 18 }}
        >
          Loading…
        </div>
      )}
      {isDir && isExpanded && children?.status === "error" && (
        <div
          className="px-2 py-0.5 text-[11px] text-destructive"
          style={{ paddingLeft: 6 + (depth + 1) * 12 + 18 }}
        >
          {children.message}
        </div>
      )}
      {isDir &&
        isExpanded &&
        children?.status === "loaded" &&
        children.entries.map((child) => (
          <FileTreeNode
            key={child.name}
            entry={child}
            parentPath={path}
            depth={depth + 1}
            tree={tree}
            onOpenFile={onOpenFile}
          />
        ))}
    </>
  );
}

export const FileTreeNode = memo(FileTreeNodeImpl);
