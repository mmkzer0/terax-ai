import { keymap } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef } from "react";
import {
  buildSharedExtensions,
  languageCompartment,
} from "./lib/extensions";
import { resolveLanguage } from "./lib/languageResolver";
import { buildEditorTheme } from "./lib/theme";
import { useDocument } from "./lib/useDocument";

type Props = {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function EditorPane({ path, onDirtyChange, onSaved }: Props) {
  const { doc, onChange, save } = useDocument({ path, onDirtyChange });
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  // Stabilize save + onSaved via refs so the extensions array never changes
  // identity. A new identity triggers @uiw/react-codemirror to dispatch
  // StateEffect.reconfigure, which wipes compartment contents — including
  // the language pack we swapped in, causing syntax to disappear.
  const saveRef = useRef(save);
  saveRef.current = save;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const theme = useMemo(() => buildEditorTheme(), []);

  const extensions = useMemo(
    () => [
      ...buildSharedExtensions(),
      languageCompartment.of([]),
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            void (async () => {
              await saveRef.current();
              onSavedRef.current?.();
            })();
            return true;
          },
        },
      ]),
    ],
    [],
  );

  // Lazy-load and apply the language pack whenever the path changes.
  useEffect(() => {
    let cancelled = false;
    resolveLanguage(path).then((ext) => {
      if (cancelled) return;
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: languageCompartment.reconfigure(ext ?? []),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [path, doc.status]);

  if (doc.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (doc.status === "error") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
        {doc.message}
      </div>
    );
  }
  if (doc.status === "binary") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <div className="text-sm text-foreground">Binary file</div>
        <div className="text-xs text-muted-foreground">
          {formatBytes(doc.size)} · preview not supported
        </div>
      </div>
    );
  }
  if (doc.status === "toolarge") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <div className="text-sm text-foreground">File too large</div>
        <div className="text-xs text-muted-foreground">
          {formatBytes(doc.size)} exceeds the {formatBytes(doc.limit)} limit.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CodeMirror
        ref={cmRef}
        value={doc.content}
        onChange={onChange}
        theme={theme}
        extensions={extensions}
        height="100%"
        className="flex-1 min-h-0 overflow-hidden"
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          foldGutter: false,
          bracketMatching: false,
          closeBrackets: false,
          autocompletion: false,
          highlightActiveLine: false,
          highlightSelectionMatches: false,
          searchKeymap: true,
        }}
      />
    </div>
  );
}
