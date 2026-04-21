import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import "./App.css";
import { ThemeProvider } from "./components/theme-provider";
import { TooltipProvider } from "./components/ui/tooltip";
import { openPty, type PtySession } from "./pty";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);

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
    term.open(containerRef.current!);
    fit.fit();
    term.focus();

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

    return () => {
      disposed = true;
      window.removeEventListener("resize", onWinResize);
      pty?.close();
      term.dispose();
    };
  }, []);

  return (
    <ThemeProvider>
      <TooltipProvider>
        <div
          style={{
            height: "100vh",
            padding: 8,
            background: "#101420",
            boxSizing: "border-box",
          }}
        >
          <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
