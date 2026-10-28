/** Stage id of 健康素食保衛戰: the stage after 溫泉關, then round again. */
export const STAGE_STREET = 2;

/**
 * 健康素食保衛戰: a mountain street with one shop on it. The camera is locked on one screen, the heroes may walk as deep as
 * on the Tokaido. It opens with a scene (phase 0): the heroes walk up to the owner, who gives them a black banana, which the
 * heroes eat (+1 UP for everyone). Then (phase 1) the bandits with their torches pour in from both sides, `cap` (+1 per lap)
 * at a time, until `total` of them have fallen; their chief walks in after `bossAt` kills. Phase 2 is the pause once it is over.
 * Positions are on the middle 256 pixels of the picture, whatever the screen width.
 */
export const STREET = {
  total: 100,
  cap: 8,
  spawnGap: 36,
  bossAt: 90,
  /** how many bandits rush in together as the fight starts, at each side */
  rush: 3,
  /** chance that a bandit shouts the war cry as it comes in */
  cryChance: 0.06,
  clearDelay: 330,
  /** where the shop owner stands */
  owner: { x: 206, y: 152 },
  /** the heroes stop this far in front of him (the second one further back) */
  stopGap: 30,
  stopStep: 22,
  /** the opening scene, in ticks since it began */
  intro: { start: 20, say1: [160, 300], give: 305, say2: [320, 395], eat: 420, end: 590 },
  /** after the fight: the owner thanks them */
  thanks: [30, 230],
  /** banners shown over the fight: code -> ticks */
  banner: { title: 1, titleT: 190, cleared: 2, clearedT: 230, chief: 3, chiefT: 150, power: 4, powerT: 160 },
};
