import catppuccinIcons from "@iconify-json/catppuccin/icons.json";
import manifest from "material-icon-theme/dist/material-icons.json";
import { EXT_TO_LANGUAGE_ID } from "./constants";

type Manifest = {
  iconDefinitions: Record<string, { iconPath: string }>;
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
  languageIds: Record<string, string>;
  file: string;
  folder: string;
  folderExpanded: string;
};

type IconifySet = {
  icons: Record<string, { body: string }>;
  aliases?: Record<string, { parent: string }>;
  width?: number;
  height?: number;
};

const m = manifest as unknown as Manifest;
const cat = catppuccinIcons as unknown as IconifySet;

// material-icon-theme uses some icon names that differ from catppuccin's slugs.
// Map them so common file types (tsx/jsx, shell scripts, mdx, etc.) resolve.
const MIT_TO_CAT: Record<string, string> = {
  react_ts: "typescript-react",
  react: "javascript-react",
  console: "bash",
  mdx: "markdown-mdx",
  tune: "env",
  document: "text",
  h: "c-header",
  hpp: "cpp-header",
  // Folder aliases — mit uses semantic groupings (folder-css, folder-class)
  // while catppuccin tends to name by folder name. Map the common divergences.
  "folder-src-tauri": "folder-tauri",
  "folder-src-tauri-open": "folder-tauri-open",
  "folder-css": "folder-styles",
  "folder-css-open": "folder-styles-open",
  "folder-class": "folder-types",
  "folder-class-open": "folder-types-open",
  "folder-controller": "folder-controllers",
  "folder-controller-open": "folder-controllers-open",
  "folder-helper": "folder-utils",
  "folder-helper-open": "folder-utils-open",
  "folder-i18n": "folder-locales",
  "folder-i18n-open": "folder-locales-open",
  "folder-font": "folder-fonts",
  "folder-font-open": "folder-fonts-open",
  "folder-hook": "folder-hooks",
  "folder-hook-open": "folder-hooks-open",
  "folder-test": "folder-tests",
  "folder-test-open": "folder-tests-open",
  "folder-resource": "folder-assets",
  "folder-resource-open": "folder-assets-open",
  "folder-plugin": "folder-plugins",
  "folder-plugin-open": "folder-plugins-open",
  "folder-interface": "folder-types",
  "folder-interface-open": "folder-types-open",
};

const CAT_W = cat.width ?? 16;
const CAT_H = cat.height ?? 16;

// material-icon-theme name → catppuccin icon body. Memoize the SVG data-URL so
// each icon is encoded once.
const dataUrlCache = new Map<string, string>();

function catBody(iconName: string): string | null {
  const mapped = MIT_TO_CAT[iconName] ?? iconName;
  const direct = cat.icons[mapped];
  if (direct) return direct.body;
  const alias = cat.aliases?.[mapped];
  if (alias) {
    const parent = cat.icons[alias.parent];
    if (parent) return parent.body;
  }
  return null;
}

function buildDataUrl(iconName: string): string | null {
  const cached = dataUrlCache.get(iconName);
  if (cached !== undefined) return cached;
  const body = catBody(iconName);
  if (!body) {
    dataUrlCache.set(iconName, "");
    return null;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CAT_W} ${CAT_H}">${body}</svg>`;
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  dataUrlCache.set(iconName, url);
  return url;
}

function resolveUrl(iconName: string | undefined): string | null {
  if (!iconName) return null;
  // material-icon-theme's iconDefinitions name (e.g. "typescript") matches the
  // catppuccin icon slug 1:1 in the vast majority of cases. Try that first; if
  // the name isn't in catppuccin, also try the file basename of iconPath as a
  // safety net (handles a few cases where mit aliases diverge from the file).
  const direct = buildDataUrl(iconName);
  if (direct) return direct;
  const def = m.iconDefinitions[iconName];
  if (!def) return null;
  const base = def.iconPath.slice(
    def.iconPath.lastIndexOf("/") + 1,
    -".svg".length,
  );
  return buildDataUrl(base);
}

function extOf(name: string): string {
  const lower = name.toLowerCase();
  // Handle compound extensions used by the manifest (e.g. ".test.ts" → "test.ts").
  const dot = lower.indexOf(".");
  if (dot === -1 || dot === lower.length - 1) return "";
  return lower.slice(dot + 1);
}

export function fileIconUrl(name: string): string {
  const lower = name.toLowerCase();

  const byName = m.fileNames[lower];
  if (byName) {
    const url = resolveUrl(byName);
    if (url) return url;
  }

  // Try progressively shorter extensions: "test.ts" → "ts".
  let ext = extOf(lower);
  while (ext) {
    const iconName = m.fileExtensions[ext];
    if (iconName) {
      const url = resolveUrl(iconName);
      if (url) return url;
    }
    // Fallback: ext → language id → icon (covers ts/js/html/etc.).
    const langId = EXT_TO_LANGUAGE_ID[ext];
    if (langId) {
      const iconByLang = m.languageIds[langId];
      if (iconByLang) {
        const url = resolveUrl(iconByLang);
        if (url) return url;
      }
    }
    const nextDot = ext.indexOf(".");
    if (nextDot === -1) break;
    ext = ext.slice(nextDot + 1);
  }

  return resolveUrl(m.file) ?? "";
}

export function folderIconUrl(name: string, expanded: boolean): string {
  const lower = name.toLowerCase();

  if (expanded) {
    const byName = m.folderNamesExpanded[lower];
    if (byName) {
      const url = resolveUrl(byName);
      if (url) return url;
    }
  } else {
    const byName = m.folderNames[lower];
    if (byName) {
      const url = resolveUrl(byName);
      if (url) return url;
    }
  }

  // Catppuccin often names folders by the folder name itself (folder-styles,
  // folder-hooks, folder-types). Fall back to that convention before defaulting.
  const direct = expanded
    ? buildDataUrl(`folder-${lower}-open`)
    : buildDataUrl(`folder-${lower}`);
  if (direct) return direct;

  return resolveUrl(expanded ? m.folderExpanded : m.folder) ?? "";
}
