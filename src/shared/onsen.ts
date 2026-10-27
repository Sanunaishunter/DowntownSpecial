/** Stage ids: the Tokaido (waves, ends with the general), then 溫泉關 (one man holds the pass against fifty elites), then round again. */
export const STAGE_TOKAIDO = 0;
export const STAGE_ONSEN = 1;

/**
 * 溫泉關: the camera is locked on one screen, and the sand path the heroes may walk on is only `groundMax - groundMin` deep.
 * It opens with a short scene (phase 0) in which an envoy offers surrender and is kicked into the hot spring, then the
 * fight (phase 1): elites keep coming from the right, `cap` (+1 per lap) at a time, until `total` have fallen; the last of
 * them is the traitor who walks in from the left after `traitorAt` kills. Phase 2 is the short pause after the pass is held.
 */
export const ONSEN = {
  groundMin: 112,
  groundMax: 140,
  total: 50,
  cap: 5,
  spawnGap: 45,
  traitorAt: 35,
  /** elites: health and attack against the plain enemy of the same kind (the lap scaling comes on top) */
  hp: 1.5,
  dmg: 1.3,
  traitorHp: 3,
  mix: [['bushi', 0.5], ['ninja', 0.25], ['saburo', 0.25]] as [string, number][],
  clearDelay: 260,
  /** the opening scene, in ticks since it began */
  intro: { start: 20, speed: 1.4, gap: 26, say1: [165, 255], say2: [270, 350], kick: 360, end: 430, fly: { vz: 3, vx: 1.1, vy: 2.5 } },
  /** banners shown over the fight: code -> ticks */
  banner: { title: 1, titleT: 170, cleared: 2, clearedT: 220, traitor: 3, traitorT: 150 },
};
