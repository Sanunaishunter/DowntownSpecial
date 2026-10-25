export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
export const SCREEN_W = 256;
export const SCREEN_H = 224;
export const STAGE_W = 1280;
export const GROUND_MIN = 140;
export const GROUND_MAX = 208;
export const MAX_PLAYERS = 2;
export const SNAPSHOT_EVERY = 2;
export const GRAVITY = 0.2;
export const JUMP_V = 3.4;

export const Btn = {
  Up: 1,
  Down: 2,
  Left: 4,
  Right: 8,
  A: 16,
  B: 32,
  S1: 64,
  S2: 128,
  S3: 256,
  S4: 512,
  S5: 1024,
  S6: 2048,
} as const;
export const SPECIAL_BITS = [Btn.S1, Btn.S2, Btn.S3, Btn.S4, Btn.S5, Btn.S6];
export const SPECIAL_MASK = Btn.S1 | Btn.S2 | Btn.S3 | Btn.S4 | Btn.S5 | Btn.S6;
export const BTN_ALL = 4095;
