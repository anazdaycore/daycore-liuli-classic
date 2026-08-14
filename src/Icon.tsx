// 琉璃初版's icons — the prototype's 24px stroke set (design-ui/liuli-classic/
// app/icons.js + icons-ext.js), same paths, same 1.8px round stroke, as a React
// component. Icons are part of the visual contract; emoji read as placeholders
// next to them.
//
// ⚠️ Each `d` is the prototype's '|'-separated segment list and is split back into
// SEPARATE <path> elements: segments that start with a relative command (m6 6)
// must not inherit the previous segment's current point, which is exactly the
// bug a naive join-with-space would introduce (the X icon would shoot to (24,36)).

interface Extra { tag: 'circle' | 'rect' | 'line'; attrs: Record<string, string | number>; }
const C = (cx: number, cy: number, r: number): Extra => ({ tag: 'circle', attrs: { cx, cy, r } });
const R = (x: number, y: number, w: number, h: number, rx = 0): Extra => ({ tag: 'rect', attrs: { x, y, width: w, height: h, rx } });

interface IconDef { d: string; extra?: Extra[]; }

const DEFS: Record<string, IconDef> = {
  sun: { d: 'M12 2v2|M12 20v2|M4.9 4.9l1.4 1.4|M17.7 17.7l1.4 1.4|M2 12h2|M20 12h2|M6.3 17.7l-1.4 1.4|M19.1 4.9l-1.4 1.4', extra: [C(12, 12, 4)] },
  layers: { d: 'M12 2 2 7l10 5 10-5-10-5z|M2 17l10 5 10-5|M2 12l10 5 10-5' },
  chat: { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z|M12 7.5c.8-1.5 3.2-1.3 3.6.5.3 1.5-1.6 3-3.6 4.3-2-1.3-3.9-2.8-3.6-4.3.4-1.8 2.8-2 3.6-.5z' },
  smile: { d: 'M8 14s1.5 2 4 2 4-2 4-2|M9 9h.01|M15 9h.01', extra: [C(12, 12, 10)] },
  settings: { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', extra: [C(12, 12, 3)] },
  sparkles: { d: 'M9.9 2.9 11.5 7l4.1 1.6-4.1 1.6-1.6 4.1-1.6-4.1L4.2 8.6l4.1-1.6 1.6-4.1z|M19 12l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3z|M6.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z' },
  plus: { d: 'M12 5v14|M5 12h14' },
  chevronLeft: { d: 'm15 18-6-6 6-6' },
  chevronRight: { d: 'm9 18 6-6-6-6' },
  chevronDown: { d: 'm6 9 6 6 6-6' },
  arrowUp: { d: 'm5 12 7-7 7 7|M12 19V5' },
  x: { d: 'M18 6 6 18|m6 6 12 12' },
  check: { d: 'M20 6 9 17l-5-5' },
  checkCircle: { d: 'M22 11.1V12a10 10 0 1 1-5.93-9.14|M22 4 12 14.01l-3-3' },
  clock: { d: 'M12 6v6l4 2', extra: [C(12, 12, 10)] },
  trash: { d: 'M3 6h18|M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6|M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2|M10 11v6|M14 11v6' },
  eyeOff: { d: 'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68|M6.61 6.61A13.526 13.526 0 0 0 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61|m2 2 20 20|M14.12 14.12a3 3 0 1 1-4.24-4.24' },
  calendarDays: { d: 'M8 2v4|M16 2v4|M3 10h18|M8 14h.01|M12 14h.01|M16 14h.01|M8 18h.01|M12 18h.01|M16 18h.01', extra: [R(3, 4, 18, 18, 2)] },
  calendarPlus: { d: 'M8 2v4|M16 2v4|M3 10h18|M12 14v6|M9 17h6', extra: [R(3, 4, 18, 18, 2)] },
  repeat: { d: 'm17 2 4 4-4 4|M3 11v-1a4 4 0 0 1 4-4h14|m7 22-4-4 4-4|M21 13v1a4 4 0 0 1-4 4H3' },
  heart: { d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z' },
  moon: { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z' },
  palette: { d: 'M12 22a10 10 0 1 1 10-10c0 2.5-2 3-3.5 3H16a2 2 0 0 0-1 3.75A1.3 1.3 0 0 1 12 22z', extra: [C(13.5, 6.5, 0.8), C(17.5, 10.5, 0.8), C(8.5, 7.5, 0.8), C(6.5, 12.5, 0.8)] },
  globe: { d: 'M2 12h20|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z', extra: [C(12, 12, 10)] },
  bell: { d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9|M10.3 21a1.94 1.94 0 0 0 3.4 0' },
  zap: { d: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z' },
  refreshCw: { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8|M21 3v5h-5|M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16|M8 16H3v5' },
  brain: { d: 'M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18z|M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18z|M12 5v13' },
  messageCircle: { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22z' },
  messagesSquare: { d: 'M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z|M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1' },
  search: { d: 'm21 21-4.3-4.3', extra: [C(11, 11, 7)] },
  listChecks: { d: 'm3 17 2 2 4-4|m3 7 2 2 4-4|M13 6h8|M13 12h8|M13 18h8' },
  undo: { d: 'M9 14 4 9l5-5|M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11' },
  wand: { d: 'm21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72z|m14 7 3 3|M5 6v4|M19 14v4|M10 2v2|M7 8H3|M21 16h-4|M11 3H9' },
  pencil: { d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z|m15 5 4 4' },
  user: { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', extra: [C(12, 7, 4)] },
  inbox: { d: 'M22 12h-6l-2 3h-4l-2-3H2|M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z' },
  key: { d: 'm21 2-9.6 9.6|M15.5 7.5l3 3L22 7l-3-3', extra: [C(7.5, 15.5, 5.5)] }, // 管理控制台卡（原型 page-settings.jsx IC.Key）
  // 资料类别（后端 materialCategories().icon 的取值，逐个映射）
  notebookPen: { d: 'M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.6|M2 6h4|M2 10h4|M2 14h4|M2 18h4|M18.4 2.6a2.17 2.17 0 0 1 3 3L16 11l-4 1 1-4z' },
  utensils: { d: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2|M7 2v20|M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7' },
  heartPulse: { d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z|M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27' },
  graduationCap: { d: 'M21.42 10.92a1 1 0 0 0 0-1.84l-8.58-3.91a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0z|M22 10v6|M6 12.5V16a6 3 0 0 0 12 0v-3.5' },
  plane: { d: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z' },
  wallet: { d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2|M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' },
  dumbbell: { d: 'm6.5 6.5 11 11|m21 21-1-1|m3 3 1 1|m18 22 4-4|m2 6 4-4|m3 10 7-7|m14 21 7-7' },
  lightbulb: { d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5|M9 18h6|M10 22h4' },
  shoppingBag: { d: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z|M3 6h18|M16 10a4 4 0 0 1-8 0' },
  film: { d: 'M7 3v18|M17 3v18|M3 7.5h4|M3 16.5h4|M17 7.5h4|M17 16.5h4|M3 12h18', extra: [R(3, 3, 18, 18, 2)] },
  bookOpen: { d: 'M12 7v14|M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' },
  externalLink: { d: 'M15 3h6v6|M10 14 21 3|M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' },
  camera: { d: 'M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5L14.5 4z', extra: [C(12, 13, 3)] },
  logout: { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|m16 17 5-5-5-5|M21 12H9' },
};

function buildHtml(def: IconDef): string {
  const paths = def.d.split('|').filter(Boolean).map((d) => `<path d='${d}'/>`).join('');
  const extras = (def.extra ?? []).map((e) => {
    const attrs = Object.entries(e.attrs).map(([k, v]) => `${k}='${v}'`).join(' ');
    return `<${e.tag} ${attrs}/>`;
  }).join('');
  return extras + paths;
}

const HTML: Record<string, string> = {};
for (const k of Object.keys(DEFS)) HTML[k] = buildHtml(DEFS[k]!);

export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      pointerEvents="none"
      className={className}
      dangerouslySetInnerHTML={{ __html: HTML[name] ?? '' }}
    />
  );
}
