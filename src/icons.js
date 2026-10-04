// Inline SVG icon set (stroke style, currentColor). No emoji, no text glyphs.
const S = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  worker: S(`<path d="M4 16a8 8 0 0 1 5-6.2V7h6v2.8A8 8 0 0 1 20 16"/><path d="M2.5 16h19v2.5h-19z"/><path d="M12 7V5.5"/>`),
  soldier: S(`<circle cx="12" cy="7.5" r="3"/><path d="M6.5 20c.8-3.6 2.9-5.5 5.5-5.5s4.7 1.9 5.5 5.5"/><path d="M15.5 11.5L20 7"/>`),
  tank: S(`<rect x="2.5" y="11" width="13" height="6" rx="2"/><path d="M15.5 13.5H21"/><circle cx="7" cy="18.5" r="1.8"/><circle cx="12.5" cy="18.5" r="1.8"/>`),
  scout: S(`<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>`),
  artillery: S(`<circle cx="7" cy="17.5" r="3"/><circle cx="17.5" cy="17.5" r="2.4"/><path d="M9.5 15.5L15 6.5h4.5"/>`),
  brute: S(`<circle cx="10" cy="7" r="2.6"/><path d="M5.5 20c.7-3.4 2.4-5.4 4.5-5.4 1.2 0 2.2.4 3 1.1"/><path d="M13.5 11.5L19 7.5"/><path d="M17.2 4.2l3.4 3.4-2 2-3.4-3.4z"/>`),
  hunter: S(`<circle cx="9.5" cy="7" r="2.4"/><path d="M5 20c.6-3.2 2.3-5 4.5-5 1.1 0 2.1.4 2.9 1"/><path d="M3 17.5L20.5 5"/><path d="M17.5 3.5l3 3-1.6 1.6-3-3z"/>`),
  hq: S(`<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>`),
  barracks: S(`<path d="M3.5 20v-8.5L9 14V9.5l5.5 3V6.5H20V20z"/><path d="M3.5 20h17"/>`),
  turret: S(`<circle cx="12" cy="14.5" r="5"/><path d="M12 14.5V4"/><path d="M12 4h6"/><path d="M7.5 21h9"/>`),
  wall: S(`<path d="M4 9.5h16V19H4z"/><path d="M4 14h16M9 9.5V14M14.5 9.5V14M6.5 14v5M12 14v5M17.5 14v5"/>`),  move: S(`<path d="M12 3.5L19 20l-7-3.8L5 20z"/>`),
  attack: S(`<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>`),
  harvest: S(`<path d="M7.5 4h9L21 9.5 12 20 3 9.5z"/><path d="M3 9.5h18M12 20L8.5 9.5 12 4l3.5 5.5z"/>`),
  stop: S(`<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>`),
  flag: S(`<path d="M6 21.5V4"/><path d="M6 4.5h10.5L14 8.5l2.5 4H6"/>`),
  army: S(`<path d="M4 6.5l7.5 5.5L4 17.5M12.5 6.5L20 12l-7.5 5.5"/>`),
  home: S(`<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/>`),
  zin: S(`<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8L21 21M8.5 11h5M11 8.5v5"/>`),
  zout: S(`<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8L21 21M8.5 11h5"/>`),
  x: S(`<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`),
  clock: S(`<circle cx="12" cy="12" r="8"/><path d="M12 8v4.2l3 1.8"/>`),
  supply: S(`<circle cx="9" cy="8" r="3"/><path d="M3.5 20c.7-3.4 2.9-5.2 5.5-5.2s4.8 1.8 5.5 5.2"/><path d="M15.5 5.4a3 3 0 0 1 0 5.4M17.5 14.9c1.9.8 3 2.5 3 4.4"/>`),
  shield: S(`<path d="M12 3l7 2.8v5.7c0 4.4-2.9 7.3-7 9-4.1-1.7-7-4.6-7-9V5.8z"/>`),
  spear: S(`<circle cx="9" cy="8" r="2.6"/><path d="M4.5 20c.7-3.2 2.4-5 4.5-5 1 0 2 .3 2.8.9"/><path d="M4 16L19 4"/><path d="M16.5 3.5L20.5 7.5l-1.8 1.8-4-4z"/>`),
  archer: S(`<circle cx="9" cy="8" r="2.4"/><path d="M4.5 20c.6-3 2.2-4.8 4.5-4.8"/><path d="M14 4c3 2.5 3 11.5 0 16"/><path d="M14 4v16M14 12H5"/>`),
  knight: S(`<circle cx="12" cy="8" r="3"/><path d="M12 5V3.5M9.5 4L8 2.5M14.5 4L16 2.5"/><path d="M5.5 20c.8-3.6 3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M4 10.5h5"/>`),
  healer: S(`<circle cx="12" cy="7.5" r="2.8"/><path d="M6 20c.7-3.2 2.8-5 6-5s5.3 1.8 6 5"/><path d="M17.5 3.5v5M15 6h5"/>`),
  ram: S(`<rect x="3" y="9" width="12" height="6" rx="3"/><path d="M15 10.5L21 7v10l-6-3.5"/><circle cx="7.5" cy="18.5" r="1.8"/><circle cx="13" cy="18.5" r="1.8"/>`),
  farm: S(`<path d="M3.5 10L12 5.5 20.5 10"/><path d="M3.5 10h17"/><path d="M6 10v3.5h4V10M10 10v3.5h4V10M14 10v3.5h4V10M6 17h12"/>`),
  mill: S(`<path d="M8 20l1.5-9h5L16 20"/><path d="M7 20h10"/><path d="M12 11L4 5M12 11l8-6M12 11v9"/><circle cx="12" cy="11" r="1.2"/>`),
  quarry: S(`<path d="M4 18L9 9l4 5 3-3 4 7z"/><path d="M9 9l1.5-3L14 8"/>`),
  gold: S(`<circle cx="12" cy="12" r="7.5"/><path d="M12 7.5v9M9 9.5h3.5a2 2 0 0 1 0 4H9l4 3"/>`),
  crown: S(`<path d="M4 17L3 8l5.5 3.5L12 5l3.5 6.5L21 8l-1 9z"/><path d="M4 20h16"/>`),
};

export function icon(name, cls = '') {
  return `<span class="ic ${cls}">${ICONS[name] || ''}</span>`;
}
