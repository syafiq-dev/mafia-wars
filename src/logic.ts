// Pure game rules ported from the Construct 2 event sheet, kept separate so they can be tested.

export const WORLD_W = 1280;
export const WORLD_H = 1024;
export const MAX_HP = 10;

// Car behaviour settings of the player car in the original.
export const CAR = { maxSpeed: 350, accel: 200, decel: 300, steer: 225, driftRecover: 185 };

export type Car = { x: number; y: number; angle: number; moveAngle: number; speed: number }; // angles in degrees
export type Keys = { up: boolean; down: boolean; left: boolean; right: boolean };

const RAD = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/** One step of a top-down car: throttle/brake, steering, a little drift, kept inside the map. */
export function stepCar(c: Car, k: Keys, dt: number): Car {
  let speed = c.speed;
  if (k.up) speed = Math.min(CAR.maxSpeed, speed + CAR.accel * dt);
  else if (k.down) speed = Math.max(-CAR.maxSpeed / 2, speed - CAR.decel * dt);
  else speed = speed > 0 ? Math.max(0, speed - CAR.decel * dt) : Math.min(0, speed + CAR.decel * dt);

  const turn = (k.right ? 1 : 0) - (k.left ? 1 : 0);
  const angle = c.angle + turn * CAR.steer * dt * (speed < 0 ? -1 : 1); // reversing steers the other way

  // Drift: the direction of travel catches up with where the car points.
  const lag = wrap180(angle - c.moveAngle);
  const moveAngle = c.moveAngle + clamp(lag, -CAR.driftRecover * dt, CAR.driftRecover * dt);

  return {
    x: clamp(c.x + Math.cos(moveAngle * RAD) * speed * dt, 0, WORLD_W),
    y: clamp(c.y + Math.sin(moveAngle * RAD) * speed * dt, 0, WORLD_H),
    angle, moveAngle, speed,
  };
}

/** Width of the red health bar (220px when full). */
export const barWidth = (hp: number) => Math.max(0, hp) * 220 / MAX_HP;

/** A heart gives +5 health, never above the max. */
export const heal = (hp: number) => Math.min(MAX_HP, hp + 5);

/** Returns the new best score, given whatever is in storage (string or null). */
export function bestScore(score: number, stored: string | null): number {
  return Math.max(score, Number(stored) || 0);
}
