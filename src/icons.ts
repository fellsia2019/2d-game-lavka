const paths: Record<string, string> = {
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/>',
  back: '<path d="m14 5-7 7 7 7M7 12h14"/>',
  camera: '<rect x="3" y="6" width="18" height="15" rx="3"/><path d="m8 6 2-3h4l2 3"/><circle cx="12" cy="13" r="4"/>',
  store: '<path d="M4 10v11h16V10M3 3h18l1 7a3 3 0 0 1-5 2 3 3 0 0 1-5 0 3 3 0 0 1-5 0 3 3 0 0 1-5-2zM9 21v-7h6v7"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 1-4 2 2 0 0 1 1-4h2c4 0 3-10-6-10z"/><circle cx="7" cy="9" r="1"/><circle cx="11" cy="6" r="1"/><circle cx="16" cy="7" r="1"/>',
  layers: '<path d="m3 7 9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4"/>',
  hand: '<path d="M9 13V4a2 2 0 0 1 4 0v6l1-1 3 2h2l2 3-2 7H9l-5-6a2 2 0 0 1 3-3z"/>',
  home: '<path d="m3 11 9-8 9 8M5 9v12h5v-7h4v7h5V9"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
  repair: '<path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><rect x="2" y="7" width="20" height="14" rx="3"/><path d="M2 12h20M9 11v4h6v-4"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14 7h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3m2-10v12"/>',
  hint: '<path d="M8 17c0-3-3-3-3-8a7 7 0 0 1 14 0c0 5-3 5-3 8zM9 21h6M10 17v-5m4 5v-5"/>',
  mix: '<path d="M3 7h4l10 10h4m-4-4 4 4-4 4M3 17h4l10-10h4m-4-4 4 4-4 4"/>',
  reserve: '<path d="m3 7 9-4 9 4v13H3zM3 7l9 4 9-4M12 11v9M8 14H5m13 0h-3"/>',
  undo: '<path d="M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14"/>',
  restart: '<path d="M3 4v6h6M3 10a9 9 0 1 1 1 8"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m4 12 5 5 11-11"/>',
  shell:
    '<path d="M12 21 3 13C-2 2 8-1 12 6 16-1 26 2 21 13zM12 6v15M5 8l7 13M19 8l-7 13"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 1 1 5 3c-2 1-2 2-2 3m0 3h.01"/>',
  wave: '<path d="M2 9c4-5 6 5 10 0s6 5 10 0M2 16c4-5 6 5 10 0s6 5 10 0"/>',
  sound:
    '<path d="M3 9h4l5-5v16l-5-5H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  music:
    '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
};
export const icon = (name: string, className = "") =>
  `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.shell}</svg>`;
