import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";

import { openUrl } from "@tauri-apps/plugin-opener";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import "./App.css";
import { SearchBar } from "./SearchBar";
import { ThemeProvider } from "./components/theme-provider";
import { TooltipProvider } from "./components/ui/tooltip";
import { openPty, type PtySession } from "./pty";
import { nord } from "./themes";

const ACTIVE_THEME = nord;
const FONT_FAMILY = '"JetBrains Mono", SFMono-Regular, Menlo, monospace';
const FONT_SIZE = 13;

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchAddon, setSearchAddon] = useState<SearchAddon | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    let pty: PtySession | null = null;
    let disposed = false;
    let term: Terminal | null = null;
    const cleanups: Array<() => void> = [];

    (async () => {
      // Wait for the web font to be loaded — otherwise xterm/WebGL caches glyph
      // metrics from the fallback font and characters render misaligned.
      await document.fonts.load(`${FONT_SIZE}px "JetBrains Mono"`);
      if (disposed) return;

      term = new Terminal({
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: 1.25,
        letterSpacing: 0,
        theme: ACTIVE_THEME,
        cursorBlink: true,
        cursorStyle: "bar",
        cursorInactiveStyle: "outline",
        scrollback: 10_000,
        smoothScrollDuration: 80,
        allowProposedApi: true,
      });

      const fit = new FitAddon();
      term.loadAddon(fit);

      const search = new SearchAddon();
      term.loadAddon(search);

      const webLinks = new WebLinksAddon((_event, uri) => {
        openUrl(uri).catch(console.error);
      });
      term.loadAddon(webLinks);

      term.open(containerRef.current!);
      fit.fit();
      term.focus();

      // WebGL must load after open(). Fall back to DOM on context loss.
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      try {
        term.loadAddon(webgl);
      } catch (e) {
        console.warn("WebGL renderer unavailable, falling back to DOM:", e);
      }

      setSearchAddon(search);

      const session = await openPty(term.cols, term.rows, {
        onData: (bytes) => term?.write(bytes),
        onExit: (code) => {
          term?.write(`\r\n\x1b[2m[process exited: ${code}]\x1b[0m\r\n`);
          if (term) term.options.disableStdin = true;
        },
      });
      if (disposed) {
        session.close();
        return;
      }
      pty = session;
      term.onData((data) => pty?.write(data));
      term.onResize(({ cols, rows }) => pty?.resize(cols, rows));

      const onWinResize = () => fit.fit();
      window.addEventListener("resize", onWinResize);
      cleanups.push(() => window.removeEventListener("resize", onWinResize));
    })();

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    cleanups.push(() => window.removeEventListener("keydown", onKey));

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
      pty?.close();
      term?.dispose();
      setSearchAddon(null);
    };
  }, []);

  return (
    <ThemeProvider>
      <TooltipProvider>
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            background: ACTIVE_THEME.background,
            overflow: "hidden",
          }}
        >
          {/* Drag strip below traffic lights — leaves room for native window controls */}
          <div
            data-tauri-drag-region
            style={{ height: 32, flexShrink: 0 }}
          />
          <div
            ref={containerRef}
            style={{
              flex: 1,
              minHeight: 0,
              padding: "0 16px 12px",
              boxSizing: "border-box",
            }}
          />
          <SearchBar
            addon={searchAddon}
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
          />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
