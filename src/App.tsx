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

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchAddon, setSearchAddon] = useState<SearchAddon | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const term = new Terminal({
      fontFamily: "SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      theme: { background: "#101420", foreground: "#e6e6e6" },
      cursorBlink: true,
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

    // WebGL must load after open(). Falls back gracefully on context loss.
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    try {
      term.loadAddon(webgl);
    } catch (e) {
      console.warn("WebGL renderer unavailable, falling back to DOM:", e);
    }

    setSearchAddon(search);

    let pty: PtySession | null = null;
    let disposed = false;

    (async () => {
      const session = await openPty(term.cols, term.rows, {
        onData: (bytes) => term.write(bytes),
        onExit: (code) => {
          term.write(`\r\n\x1b[2m[process exited: ${code}]\x1b[0m\r\n`);
          term.options.disableStdin = true;
        },
      });
      if (disposed) {
        session.close();
        return;
      }
      pty = session;
      term.onData((data) => pty?.write(data));
      term.onResize(({ cols, rows }) => pty?.resize(cols, rows));
    })();

    const onWinResize = () => fit.fit();
    window.addEventListener("resize", onWinResize);

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onWinResize);
      window.removeEventListener("keydown", onKey);
      pty?.close();
      term.dispose();
      setSearchAddon(null);
    };
  }, []);

  return (
    <ThemeProvider>
      <TooltipProvider>
        <div
          style={{
            position: "relative",
            height: "100vh",
            padding: 8,
            background: "#101420",
            boxSizing: "border-box",
          }}
        >
          <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
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
