import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepCar, barWidth, heal, bestScore, CAR, WORLD_W } from './logic.ts';

const idle = { up: false, down: false, left: false, right: false };
const car = { x: 100, y: 100, angle: 0, moveAngle: 0, speed: 0 };

test('throttle speeds up to the max, then coasts to a stop', () => {
  let c = car;
  for (let i = 0; i < 100; i++) c = stepCar(c, { ...idle, up: true }, 0.1);
  assert.equal(c.speed, CAR.maxSpeed);
  for (let i = 0; i < 100; i++) c = stepCar(c, idle, 0.1);
  assert.equal(c.speed, 0);
});

test('brake turns into a slower reverse', () => {
  let c = car;
  for (let i = 0; i < 100; i++) c = stepCar(c, { ...idle, down: true }, 0.1);
  assert.equal(c.speed, -CAR.maxSpeed / 2);
  assert.ok(c.x < car.x);
});

test('steering turns the car, travel direction lags behind (drift)', () => {
  const c = stepCar({ ...car, speed: 300 }, { ...idle, right: true }, 0.1);
  assert.equal(c.angle, 22.5);
  assert.equal(c.moveAngle, 18.5);
});

test('car stays inside the map', () => {
  const c = stepCar({ ...car, x: WORLD_W - 1, speed: 350 }, idle, 1);
  assert.equal(c.x, WORLD_W);
});

test('health bar and healing', () => {
  assert.equal(barWidth(10), 220);
  assert.equal(barWidth(-1), 0);
  assert.equal(heal(3), 8);
  assert.equal(heal(9), 10);
});

test('best score handles empty or junk storage', () => {
  assert.equal(bestScore(5, null), 5);
  assert.equal(bestScore(5, 'abc'), 5);
  assert.equal(bestScore(30, '12'), 30);
});
