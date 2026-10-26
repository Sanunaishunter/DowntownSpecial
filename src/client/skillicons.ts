// Icons for the six special buttons, indexed by special id. Drawn on a 24x24 grid.
const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

export const SKILL_ICONS: string[] = [
  // 龜甲砲: a charged orb firing a wide beam
  svg(
    '<rect x="9" y="8.5" width="14" height="7" rx="3.5" fill="#bff6ff"/><rect x="9" y="10.5" width="14" height="3" rx="1.5" fill="#fff"/>' +
      '<circle cx="7" cy="12" r="5.5" fill="#37c8ff" stroke="#fff" stroke-width="1.5"/><circle cx="7" cy="12" r="2.4" fill="#fff"/>' +
      '<path d="M2 4l2.5 2.5M2 20l2.5-2.5M7 1.5v2.5M7 22.5V20" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>',
  ),
  // 連拳彈: a row of fist-shaped bullets with speed lines
  svg(
    '<path d="M1 7h5M0 12h6M1 17h5" stroke="#ffe2b0" stroke-width="1.6" stroke-linecap="round"/>' +
      '<circle cx="9" cy="12" r="3" fill="#ff9a3c" stroke="#fff" stroke-width="1.2"/><circle cx="15" cy="12" r="3.6" fill="#ffb347" stroke="#fff" stroke-width="1.2"/>' +
      '<circle cx="20.5" cy="12" r="3.2" fill="#ffd27a" stroke="#fff" stroke-width="1.2"/>' +
      '<path d="M18.6 10.4v3.2M20.5 10v4M22.2 10.4v3.2" stroke="#b5651d" stroke-width="0.9" stroke-linecap="round"/>',
  ),
  // 光環: a halo with light pouring down, and a heal cross
  svg(
    '<path d="M6 7h12l3 16H3z" fill="#fff6b0" opacity="0.55"/><ellipse cx="12" cy="5" rx="7" ry="2.6" fill="none" stroke="#ffe14a" stroke-width="2.4"/>' +
      '<path d="M12 11v9M7.5 15.5h9" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><path d="M12 11v9M7.5 15.5h9" stroke="#ff5a6a" stroke-width="1.4" stroke-linecap="round"/>',
  ),
  // 爆氣: a flame
  svg(
    '<path d="M12 1.5c1 4-3.5 5.8-3.5 10 0 1.4.5 2.3 1.2 3-2.6-.6-5.2-3-4.6-7C3.4 9 2 11.5 2 14.5 2 19.2 6.4 23 12 23s10-3.8 10-8.5c0-5-3.6-7.3-5-10.5-.8 1.7-1.7 2.7-3 3.2C14.2 5.7 14.3 3.5 12 1.5z" fill="#ffb300" stroke="#fff3b0" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M12 11.5c.6 2.6-2.4 3.6-2.4 6.2 0 1.8 1.2 3 2.4 3s2.4-1.2 2.4-3c0-2.2-1.2-2.8-2.4-6.2z" fill="#fff5c2"/>',
  ),
  // 聖盾: a Roman scutum with a boss and a cross
  svg(
    '<path d="M12 1.5l9 3v8.2c0 5-3.7 8.6-9 10.3C6.7 21.3 3 17.7 3 12.7V4.5z" fill="#6aa8ff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M12 4.5v15M6 11h12" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="11" r="2.8" fill="#ffd23a" stroke="#fff" stroke-width="1"/>',
  ),
  // 主角威能: a burst star
  svg(
    '<path d="M12 1l2.6 6.4 6.9-.9-4.2 5.5 4.2 5.5-6.9-.9L12 23l-2.6-6.4-6.9.9 4.2-5.5L2.5 6.5l6.9.9z" fill="#ff6bd6" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<circle cx="12" cy="12" r="4" fill="#fff"/><circle cx="12" cy="12" r="2" fill="#ffd23a"/>',
  ),
];
