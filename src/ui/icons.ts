/**
 * UIで使う線画アイコン。すべて currentColor で描き、viewBox 指定でスケーラブル。
 * 装飾目的なので aria-hidden を付け、ボタン側のラベルで意味を伝える。
 */

const ICON_BODIES = {
  refresh:
    '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 16M4 20v-4h4"/>',
  undo: '<path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-2"/>',
  redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h2"/>',
  pencil:
    '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 6.5l3 3"/>',
  eraser:
    '<path d="M8 20H5l-2-2a2 2 0 0 1 0-3l9-9a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3l-8 8H8z"/><path d="M8 20l-4-4"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
  share:
    '<circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.1 11l7.8-4M8.1 13l7.8 4"/>',
  pause: '<rect x="7" y="5" width="3.4" height="14" rx="1"/><rect x="13.6" y="5" width="3.4" height="14" rx="1"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
} as const;

export type IconName = keyof typeof ICON_BODIES;

export function icon(name: IconName): string {
  return (
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${ICON_BODIES[name]}</svg>`
  );
}
