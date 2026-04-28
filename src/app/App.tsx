import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AgentRunBridge,
  AiInputBar,
  AiMiniWindow,
  SelectionAskAi,
  useChatStore,
} from "@/modules/ai";
import { AiComposerProvider } from "@/modules/ai/lib/composer";
import { ApiKeyDialog } from "@/modules/ai/components/ApiKeyDialog";
import { AiInputBarConnect } from "@/modules/ai/components/AiInputBar";
import { getOpenAiKey } from "@/modules/ai/lib/keyring";
import { EditorStack, type EditorPaneHandle } from "@/modules/editor";
import { FileExplorer } from "@/modules/explorer";
import {
  Header,
  type SearchInlineHandle,
  type SearchTarget,
} from "@/modules/header";
import {
  ShortcutsDialog,
  useGlobalShortcuts,
  type ShortcutHandlers,
} from "@/modules/shortcuts";
import { StatusBar } from "@/modules/statusbar";
import { useTabs, useWorkspaceCwd } from "@/modules/tabs";
import {
  TerminalStack,
  type TerminalPaneHandle,
} from "@/modules/terminal";
import { ThemeProvider } from "@/modules/theme";
import { homeDir } from "@tauri-apps/api/path";
import type { SearchAddon } from "@xterm/addon-search";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";

export default function App() {
  const {
    tabs,
    activeId,
    setActiveId,
    newTab,
    openFileTab,
    closeTab,
    updateTab,
    selectByIndex,
  } = useTabs();

  const searchAddons = useRef<Map<number, SearchAddon>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] =
    useState<SearchAddon | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const terminalRefs = useRef<Map<number, TerminalPaneHandle>>(new Map());
  const editorRefs = useRef<Map<number, EditorPaneHandle>>(new Map());
  const [activeEditorHandle, setActiveEditorHandle] =
    useState<EditorPaneHandle | null>(null);
  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (p.getSize().asPercentage <= 0) p.expand();
    else p.collapse();
  }, []);

  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    homeDir()
      .then(setHome)
      .catch(() => setHome(null));
  }, []);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const miniOpen = useChatStore((s) => s.mini.open);
  const openMini = useChatStore((s) => s.openMini);
  const focusInput = useChatStore((s) => s.focusInput);
  const openPanel = useChatStore((s) => s.openPanel);
  const panelOpen = useChatStore((s) => s.panelOpen);
  const apiKey = useChatStore((s) => s.apiKey);
  const setApiKey = useChatStore((s) => s.setApiKey);
  const setLive = useChatStore((s) => s.setLive);

  const [keyLoaded, setKeyLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    getOpenAiKey().then((k) => {
      if (!alive) return;
      setApiKey(k);
      setKeyLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [setApiKey]);

  const hydrateSessions = useChatStore((s) => s.hydrateSessions);
  useEffect(() => {
    void hydrateSessions();
  }, [hydrateSessions]);

  const activeTab = tabs.find((t) => t.id === activeId);
  const isTerminalTab = activeTab?.kind === "terminal";
  const isEditorTab = activeTab?.kind === "editor";

  const { explorerRoot, inheritedCwdForNewTab } = useWorkspaceCwd(
    activeTab,
    tabs,
    home,
  );

  useEffect(() => {
    setActiveSearchAddon(searchAddons.current.get(activeId) ?? null);
    setActiveEditorHandle(editorRefs.current.get(activeId) ?? null);
  }, [activeId]);

  const handleSearchReady = useCallback(
    (id: number, addon: SearchAddon) => {
      searchAddons.current.set(id, addon);
      if (id === activeId) setActiveSearchAddon(addon);
    },
    [activeId],
  );

  const disposeTab = useCallback(
    (id: number) => {
      searchAddons.current.delete(id);
      terminalRefs.current.delete(id);
      editorRefs.current.delete(id);
      closeTab(id);
    },
    [closeTab],
  );

  const handleClose = useCallback(
    (id: number) => {
      const t = tabs.find((x) => x.id === id);
      if (t?.kind === "editor" && t.dirty) {
        const ok = window.confirm(
          `"${t.title}" has unsaved changes. Close anyway?`,
        );
        if (!ok) return;
      }
      disposeTab(id);
    },
    [tabs, disposeTab],
  );

  const cycleTab = useCallback(
    (delta: 1 | -1) => {
      if (tabs.length < 2) return;
      const idx = tabs.findIndex((t) => t.id === activeId);
      const nextIdx = (idx + delta + tabs.length) % tabs.length;
      setActiveId(tabs[nextIdx].id);
    },
    [tabs, activeId, setActiveId],
  );

  const captureActiveSelection = useCallback((): string | null => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t) return null;
    if (t.kind === "terminal") {
      return terminalRefs.current.get(activeId)?.getSelection() ?? null;
    }
    if (t.kind === "editor") {
      return editorRefs.current.get(activeId)?.getSelection() ?? null;
    }
    return null;
  }, [tabs, activeId]);

  const togglePanelAndFocus = useCallback(() => {
    if (!apiKey) {
      setApiKeyDialogOpen(true);
      return;
    }
    if (panelOpen) {
      useChatStore.getState().closePanel();
    } else {
      openPanel();
      focusInput(null);
    }
  }, [apiKey, panelOpen, openPanel, focusInput]);

  const attachSelection = useChatStore((s) => s.attachSelection);

  const askFromSelection = useCallback(() => {
    if (!apiKey) {
      setApiKeyDialogOpen(true);
      return;
    }
    const selection = captureActiveSelection();
    if (!selection || !selection.trim()) {
      focusInput(null);
      return;
    }
    const source: "terminal" | "editor" =
      activeTab?.kind === "editor" ? "editor" : "terminal";
    attachSelection(selection, source);
  }, [apiKey, captureActiveSelection, focusInput, attachSelection, activeTab]);

  const [askPopup, setAskPopup] = useState<{ x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    let pressed = false;
    let lastX = 0;
    let lastY = 0;

    const isInsideAi = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      return !!(
        el.closest("[data-selection-ask-ai]") ||
        el.closest("[data-ai-input-bar]") ||
        el.closest("[data-ai-mini-window]")
      );
    };

    const refreshPopup = (x: number, y: number) => {
      const text = captureActiveSelection();
      if (text && text.trim().length > 0) {
        setAskPopup({ x, y });
      } else {
        setAskPopup(null);
      }
    };

    const onDown = (e: MouseEvent) => {
      if (isInsideAi(e.target)) return;
      pressed = true;
      lastX = e.clientX;
      lastY = e.clientY;
      setAskPopup(null);
    };
    const onMove = (e: MouseEvent) => {
      if (!pressed) return;
      lastX = e.clientX;
      lastY = e.clientY;
      // Cheap: defer to next frame so xterm/CodeMirror have already
      // committed the selection before we read it back.
      requestAnimationFrame(() => refreshPopup(lastX, lastY));
    };
    const onUp = (e: MouseEvent) => {
      pressed = false;
      if (isInsideAi(e.target)) return;
      setTimeout(() => refreshPopup(e.clientX, e.clientY), 0);
    };
    const onSelChange = () => {
      if (!pressed) return;
      requestAnimationFrame(() => refreshPopup(lastX, lastY));
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("selectionchange", onSelChange);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("selectionchange", onSelChange);
    };
  }, [captureActiveSelection]);

  const onAskFromSelection = useCallback(() => {
    askFromSelection();
    setAskPopup(null);
  }, [askFromSelection]);

  const openNewTab = useCallback(() => {
    newTab(inheritedCwdForNewTab());
  }, [newTab, inheritedCwdForNewTab]);

  const sendCd = useCallback(
    (path: string) => {
      const term = terminalRefs.current.get(activeId);
      if (!term) return;
      const quoted = path.includes(" ")
        ? `'${path.replace(/'/g, `'\\''`)}'`
        : path;
      term.write(`cd ${quoted}\n`);
      term.focus();
    },
    [activeId],
  );

  const cdInNewTab = useCallback(
    (path: string) => {
      const id = newTab(path);
      // After mount, send cd so the prompt reflects the directory immediately
      // even if the shell init didn't pick up the spawn cwd cleanly.
      setTimeout(() => {
        const t = terminalRefs.current.get(id);
        if (!t) return;
        const quoted = path.includes(" ")
          ? `'${path.replace(/'/g, `'\\''`)}'`
          : path;
        t.write(`cd ${quoted}\n`);
        t.focus();
      }, 80);
    },
    [newTab],
  );

  const handleOpenFile = useCallback(
    (path: string) => {
      openFileTab(path);
    },
    [openFileTab],
  );

  const handlePathRenamed = useCallback(
    (from: string, to: string) => {
      for (const t of tabs) {
        if (t.kind !== "editor") continue;
        if (t.path === from) {
          const i = to.lastIndexOf("/");
          updateTab(t.id, { path: to, title: i === -1 ? to : to.slice(i + 1) });
        } else if (t.path.startsWith(`${from}/`)) {
          const suffix = t.path.slice(from.length);
          const newPath = `${to}${suffix}`;
          const i = newPath.lastIndexOf("/");
          updateTab(t.id, {
            path: newPath,
            title: i === -1 ? newPath : newPath.slice(i + 1),
          });
        }
      }
    },
    [tabs, updateTab],
  );

  const handlePathDeleted = useCallback(
    (path: string) => {
      for (const t of tabs) {
        if (t.kind !== "editor") continue;
        if (t.path === path || t.path.startsWith(`${path}/`)) {
          disposeTab(t.id);
        }
      }
    },
    [tabs, disposeTab],
  );

  const activeFilePath =
    activeTab?.kind === "editor" ? activeTab.path : null;

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "tab.new": openNewTab,
      "tab.close": () => handleClose(activeId),
      "tab.next": () => cycleTab(1),
      "tab.prev": () => cycleTab(-1),
      "tab.selectByIndex": (e) => selectByIndex(parseInt(e.key, 10) - 1),
      "search.focus": () => searchInlineRef.current?.focus(),
      "ai.toggle": togglePanelAndFocus,
      "ai.askSelection": askFromSelection,
      "shortcuts.open": () => setShortcutsOpen((v) => !v),
      "sidebar.toggle": toggleSidebar,
    }),
    [
      activeId,
      cycleTab,
      handleClose,
      openNewTab,
      selectByIndex,
      togglePanelAndFocus,
      askFromSelection,
      toggleSidebar,
    ],
  );

  useGlobalShortcuts(shortcutHandlers);

  const registerTerminalHandle = useCallback(
    (id: number, h: TerminalPaneHandle | null) => {
      if (h) terminalRefs.current.set(id, h);
      else terminalRefs.current.delete(id);
    },
    [],
  );

  const registerEditorHandle = useCallback(
    (id: number, h: EditorPaneHandle | null) => {
      if (h) editorRefs.current.set(id, h);
      else editorRefs.current.delete(id);
      if (id === activeId) setActiveEditorHandle(h);
    },
    [activeId],
  );

  const handleTerminalCwd = useCallback(
    (id: number, cwd: string) => updateTab(id, { cwd }),
    [updateTab],
  );

  const handleEditorDirty = useCallback(
    (id: number, dirty: boolean) => updateTab(id, { dirty }),
    [updateTab],
  );

  const searchTarget = useMemo<SearchTarget>(() => {
    if (isTerminalTab && activeSearchAddon)
      return { kind: "terminal", addon: activeSearchAddon };
    if (isEditorTab && activeEditorHandle)
      return { kind: "editor", handle: activeEditorHandle };
    return null;
  }, [isTerminalTab, isEditorTab, activeSearchAddon, activeEditorHandle]);

  const activeCwd =
    activeTab?.kind === "terminal" ? (activeTab.cwd ?? null) : null;

  useEffect(() => {
    const findCwd = () => {
      const active = tabs.find((x) => x.id === activeId);
      if (active?.kind === "terminal" && active.cwd) return active.cwd;
      // Fall back to the most-recently-active terminal tab's cwd, then the
      // workspace root, then the home dir. This keeps `run_command` anchored
      // when the user is on an editor tab or a terminal that hasn't reported
      // a cwd yet, instead of letting Rust default to the app's own dir.
      for (let i = tabs.length - 1; i >= 0; i--) {
        const t = tabs[i];
        if (t.kind === "terminal" && t.cwd) return t.cwd;
      }
      return explorerRoot ?? home ?? null;
    };

    setLive({
      getCwd: findCwd,
      getTerminalContext: () => {
        const t = tabs.find((x) => x.id === activeId);
        if (t?.kind !== "terminal") return null;
        return terminalRefs.current.get(activeId)?.getBuffer(300) ?? null;
      },
      injectIntoActivePty: (text) => {
        const t = tabs.find((x) => x.id === activeId);
        if (t?.kind !== "terminal") return false;
        const term = terminalRefs.current.get(activeId);
        if (!term) return false;
        term.write(text);
        term.focus();
        return true;
      },
      getWorkspaceRoot: () => explorerRoot ?? home ?? null,
      getActiveFile: () => {
        const t = tabs.find((x) => x.id === activeId);
        return t?.kind === "editor" ? t.path : null;
      },
    });
  }, [setLive, activeId, tabs, explorerRoot, home]);

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
          <Header
            tabs={tabs}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={openNewTab}
            onClose={handleClose}
            onToggleSidebar={toggleSidebar}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenSettings={() => {}}
            searchTarget={searchTarget}
            searchRef={searchInlineRef}
          />

          <main className="flex min-h-0 flex-1 flex-col">
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1"
            >
              <ResizablePanel
                id="sidebar"
                panelRef={sidebarRef}
                defaultSize="22%"
                minSize="14%"
                maxSize="40%"
                collapsible
                collapsedSize={0}
              >
                <div className="h-full border-r border-border/60 bg-card">
                  <FileExplorer
                    rootPath={explorerRoot}
                    onOpenFile={handleOpenFile}
                    onPathRenamed={handlePathRenamed}
                    onPathDeleted={handlePathDeleted}
                    onRevealInTerminal={cdInNewTab}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="workspace"
                defaultSize="78%"
                minSize="30%"
              >
                <div className="flex h-full min-h-0 flex-col">
                  <div className="relative min-h-0 flex-1">
                    <div
                      className={cn(
                        "absolute inset-0 px-3 pt-2 pb-2",
                        !isTerminalTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isTerminalTab}
                    >
                      <TerminalStack
                        tabs={tabs}
                        activeId={activeId}
                        registerHandle={registerTerminalHandle}
                        onSearchReady={handleSearchReady}
                        onCwd={handleTerminalCwd}
                      />
                    </div>
                    <div
                      className={cn(
                        "absolute inset-0 px-3 pt-2 pb-2",
                        !isEditorTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isEditorTab}
                    >
                      <EditorStack
                        tabs={tabs}
                        activeId={activeId}
                        registerHandle={registerEditorHandle}
                        onDirtyChange={handleEditorDirty}
                      />
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {panelOpen && keyLoaded ? (
                      <motion.div
                        key="ai-panel"
                        data-ai-input-bar
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        {apiKey ? (
                          <AiInputBar />
                        ) : (
                          <AiInputBarConnect
                            onAdd={() => setApiKeyDialogOpen(true)}
                          />
                        )}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </main>

          <StatusBar
            cwd={activeCwd}
            filePath={activeFilePath}
            home={home}
            onCd={sendCd}
            onOpenMini={openMini}
            hasComposer={!!apiKey}
          />

          {apiKey ? <AgentRunBridge apiKey={apiKey} /> : null}

          <AnimatePresence>
            {miniOpen && apiKey ? (
              <AiMiniWindow key="ai-mini" apiKey={apiKey} />
            ) : null}
            {askPopup ? (
              <SelectionAskAi
                key="ask-ai-popup"
                x={askPopup.x}
                y={askPopup.y}
                onAsk={onAskFromSelection}
                onDismiss={() => setAskPopup(null)}
              />
            ) : null}
          </AnimatePresence>

          <ShortcutsDialog
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
          />

          <ApiKeyDialog
            open={apiKeyDialogOpen}
            onOpenChange={setApiKeyDialogOpen}
            onSaved={(k) => {
              setApiKey(k);
              openPanel();
            }}
          />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );

  // Mount the composer provider whenever an API key exists — independent of
  // panelOpen — so toggling the panel never re-mounts terminals/editors.
  if (apiKey) {
    return <AiComposerProvider apiKey={apiKey}>{shell}</AiComposerProvider>;
  }
  return shell;
}
