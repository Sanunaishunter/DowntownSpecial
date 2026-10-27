/** 爆擊: a hero's blow is a critical hit now and then, and does `mult` times the damage. (Decided from the tick and the two fighters, so it replays the same.) */
export const CRIT = { chance: 0.1, mult: 2 };

/** 攻擊N: the hit counter keeps running while the hero lands a blow at least every `keep` ticks, and starts over when they are hurt. */
export const COMBO = { keep: 80 };

/** The hero shouts the name of a special move for `dur` ticks, in a speech bubble. Codes: 1-4 moves, 10 + id for the six specials. */
export const CRY = { dur: 75, barrage: 1, tatsu: 2, whirl: 3, upper: 4, special: 10, traitor: 20, traitorDur: 130 };

export const CRY_TEXT: Record<number, string> = {
  [CRY.barrage]: '百裂拳！',
  [CRY.tatsu]: '龍捲風腳！',
  [CRY.whirl]: '炫風斬！',
  [CRY.upper]: '昇龍拳！',
  [CRY.special + 0]: '龜甲砲！',
  [CRY.special + 1]: '連拳彈！',
  [CRY.special + 2]: '光環！',
  [CRY.special + 3]: '爆氣！',
  [CRY.special + 4]: '聖盾！',
  [CRY.special + 5]: '天雷萬鈞！',
  [CRY.traitor]: '讓他下課！',
};

/** Event kinds for the damage numbers: the 5th element of the event is the damage. */
export const EV_DAMAGE = 6;
export const EV_CRIT = 7;
