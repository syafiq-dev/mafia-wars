import * as Phaser from 'phaser';
import { WORLD_W, WORLD_H, MAX_HP, stepCar, stickKeys, barWidth, heal, bestScore, type Car, type Keys } from './logic.ts';

const W = 854;
const H = 480;
const FONT = 'Tahoma, Verdana, sans-serif';
const BEST_KEY = 'mafiaBest';
const COFFEE_URL = 'https://spoo.me/coffee';
const db = (v: number) => Math.pow(10, v / 20); // the original set volumes in dB

// localStorage can throw (private mode, blocked storage); the game must still run.
const readBest = () => { try { return localStorage.getItem(BEST_KEY); } catch { return null; } };
const writeBest = (n: number) => { try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* not saved */ } };

// Online leaderboard: a Vercel function in api/scores.js. Not available under plain `npm run dev` (use `vercel dev`).
type Row = { name: string; score: number };
const NAME_KEY = 'playerName';
const SENT_KEY = 'mafiaSentBest';
const readSent = () => { try { return Number(localStorage.getItem(SENT_KEY)) || 0; } catch { return 0; } };
const writeSent = (n: number) => { try { localStorage.setItem(SENT_KEY, String(n)); } catch { /* resend next time */ } };

async function fetchTop(): Promise<Row[]> {
  const res = await fetch('/api/scores');
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return (await res.json()).top;
}

async function submitScore(name: string, score: number): Promise<number> {
  const res = await fetch('/api/scores', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, score }) });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return (await res.json()).rank;
}

/** Saved name, or ask once. Returns null if the player cancels. */
function playerName(): string | null {
  try { const saved = localStorage.getItem(NAME_KEY); if (saved) return saved; } catch { /* ask instead */ }
  const typed = window.prompt('Your name for the online leaderboard (max 12 letters):')?.trim().slice(0, 12);
  if (!typed) return null;
  try { localStorage.setItem(NAME_KEY, typed); } catch { /* ask again next time */ }
  return typed;
}

const text = (scene: Phaser.Scene, x: number, y: number, s: string, size: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) =>
  scene.add.text(x, y, s, { fontFamily: FONT, fontStyle: 'bold', fontSize: `${size}px`, color: '#ffffff', ...extra });

/** Flat button in the menu's look: dark fill, white border. */
function button(scene: Phaser.Scene, x: number, y: number, w: number, label: string, color: string, onClick: () => void) {
  const fill = 0x1d1d3a;
  const box = scene.add.rectangle(x, y, w, 36, fill, 0.9).setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(color).color);
  const t = text(scene, x, y, label, 16, { color }).setOrigin(0.5);
  box.setInteractive({ useHandCursor: true })
    .on('pointerover', () => box.setFillStyle(0x3b3b72))
    .on('pointerout', () => box.setFillStyle(fill))
    .on('pointerup', onClick); // pointerup, not down: browsers only allow window.open from a click
  return [box, t];
}

const isTouch = (scene: Phaser.Scene) => scene.sys.game.device.input.touch;

/** The screen grows to fill the phone (Scale.EXPAND); keep the 854x480 menu art centred in it. */
function centre(scene: Phaser.Scene) {
  const f = () => scene.cameras.main.centerOn(W / 2, H / 2);
  f();
  scene.scale.on('resize', f);
  scene.events.once('shutdown', () => scene.scale.off('resize', f));
}

/** Android Chrome: tapping Start goes fullscreen and locks landscape. iPhone Safari has no fullscreen API, so it just plays. */
function goFullscreen(scene: Phaser.Scene) {
  if (!isTouch(scene) || scene.scale.isFullscreen) return;
  scene.scale.startFullscreen();
  (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => { /* not supported */ });
}

class Boot extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    const bar = this.add.rectangle(W / 2 - 150, H / 2, 0, 8, 0xdd214c).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => bar.setSize(300 * p, 8));
    for (const k of ['player', 'enemy', 'bullet', 'gun', 'crosshair', 'menu', 'arrows', 'stallion', 'handgun', 'metalbullet', 'guy-dead', 'guy-punch', 'tile'])
      this.load.image(k, `assets/${k}.png`);
    for (const [k, size] of [['guy-run', 80], ['explosion', 100], ['blood', 80], ['heart', 50], ['heal', 300]] as const)
      this.load.spritesheet(k, `assets/${k}.png`, { frameWidth: size, frameHeight: size });
    for (const k of ['bgm', 'carhit', 'explode', 'heal', 'loss', 'menuclose', 'menumusic', 'menuopen', 'scrrea', 'select', 'shoot', 'splat'])
      this.load.audio(k, `assets/${k}.mp3`);
  }

  create() {
    const anim = (key: string, frameRate: number, repeat: number) =>
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(key), frameRate, repeat });
    anim('guy-run', 15, -1);
    anim('explosion', 50, 0);
    anim('blood', 10, 0);
    anim('heart', 10, -1);
    anim('heal', 8, -1);

    // The tank isn't in the original art, so it's drawn here: hull and turret, facing right like the other sprites.
    const g = this.add.graphics();
    g.fillStyle(0x2b2b2b).fillRect(0, 0, 100, 16).fillRect(0, 48, 100, 16);
    g.fillStyle(0x4b5320).fillRect(6, 12, 88, 40);
    g.fillStyle(0x5d6b2a).fillRect(80, 16, 12, 32);
    g.generateTexture('tank', 100, 64).clear();
    g.fillStyle(0x3a4119).fillRect(20, 11, 50, 8);
    g.fillStyle(0x5d6b2a).fillCircle(20, 15, 15);
    g.generateTexture('tank-turret', 70, 30).destroy();
    this.scene.start('menu');
  }
}

class Menu extends Phaser.Scene {
  constructor() { super('menu'); }

  create() {
    const touch = isTouch(this);
    centre(this);
    this.add.image(W / 2, H / 2, 'menu');
    this.add.rectangle(608, 323, 432, 205, 0x000000, 150 / 255);
    text(this, 400, 230, 'CONTROLS', 24);
    this.add.rectangle(502, 268, 203, 2, 0xffffff);
    this.add.rectangle(605, 324, 3, 194, 0xffffff);
    this.add.image(461, 315, 'arrows').setDisplaySize(113, 34);
    text(this, 403, 344, touch ? 'TAP - AIM & SHOOT' : 'LEFT CLICK - SHOOT', 18);
    text(this, 403, 376, touch ? 'JOYSTICK - DRIVE' : 'MOUSE - AIM', 18);
    ['Survive and Eliminate', 'as many Mafias as', 'possible.'].forEach((s, i) => text(this, 614, 271 + i * 26, s, 18));
    text(this, 598, 200, `BEST : ${bestScore(0, readBest())}`, 16, { color: '#ffffff' }).setOrigin(0.5, 0);

    if (!this.sound.get('menumusic')?.isPlaying) this.sound.play('menumusic', { loop: true });
    const go = () => {
      goFullscreen(this);
      this.sound.stopByKey('menumusic');
      this.sound.play('select', { volume: db(5) });
      this.scene.start('game');
    };
    button(this, 598, 165, 123, 'Start', '#ffffff', go);
    button(this, 450, 448, 100, 'TOP 10', '#ffffff', () => this.scene.start('leaderboard')); // menu music keeps playing there
    button(this, 565, 448, 110, 'DONATE', '#ffdd00', () => window.open(COFFEE_URL, '_blank', 'noopener'));
    this.input.keyboard?.once('keydown-ENTER', go);
    this.input.keyboard?.once('keydown-SPACE', go);
  }
}

type Thing = Phaser.GameObjects.Sprite; // data: hp, speed, touching, gun (stallion's turret)

class Game extends Phaser.Scene {
  private car!: Car;
  private player!: Phaser.GameObjects.Image;
  private gun!: Phaser.GameObjects.Image;
  private hp = MAX_HP;
  private score = 0;
  private deadGuys = 0;
  private lastShot = 0;
  private paused = false;
  private over = false;
  private things: Record<'bullets' | 'metal' | 'enemies' | 'stallions' | 'guys' | 'hearts', Thing[]> =
    { bullets: [], metal: [], enemies: [], stallions: [], guys: [], hearts: [] };
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT', Phaser.Input.Keyboard.Key>;
  private stick = { id: -1, angle: 0, strength: 0 }; // touch joystick: pointer id holding it, direction in degrees, 0..1
  private scoreText!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Rectangle;
  private healFx!: Phaser.GameObjects.Sprite;
  private pauseUi: Phaser.GameObjects.GameObject[] = [];

  constructor() { super('game'); }

  create() {
    this.hp = MAX_HP;
    this.score = 0;
    this.deadGuys = 0;
    this.lastShot = -Infinity;
    this.paused = this.over = false;
    this.time.paused = false;
    for (const k in this.things) this.things[k as keyof typeof this.things] = [];
    this.stick = { id: -1, angle: 0, strength: 0 };

    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'tile').setOrigin(0);
    this.car = { x: 387, y: 347, angle: 0, moveAngle: 0, speed: 0 };
    this.player = this.add.image(this.car.x, this.car.y, 'player').setOrigin(0.503, 0.5).setDisplaySize(95, 47).setDepth(3);
    this.gun = this.add.image(0, 0, 'gun').setOrigin(0.23, 0.5).setDisplaySize(37, 14).setDepth(4);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H).startFollow(this.player);

    // Starting layout from the original.
    for (const [x, y] of [[730, 251], [860, 443]]) this.spawnEnemy(x, y, Phaser.Math.Between(0, 359));
    for (const [x, y] of [[216, 583], [542, 560]]) this.spawnGuy(x, y);
    this.spawnStallion(121, 961, Phaser.Math.Between(0, 359));
    this.spawnHeart(398, 444);

    const rnd = () => Phaser.Math.Between(0, WORLD_H);
    const every = (ms: number, fn: () => void) => this.time.addEvent({ delay: ms, loop: true, callback: fn });
    every(6000, () => this.spawnEnemy(1400, rnd(), 0)); // spawned off the right edge; they turn towards you once outside
    every(8000, () => this.spawnStallion(1400, rnd(), 0));
    every(15000, () => this.spawnHeart(Phaser.Math.Between(0, WORLD_W), rnd()));
    every(3000, () => this.spawnGuy(1400, rnd()));
    every(1000, () => this.punch());
    every(20000, () => { // rare boss: at most one tank, about one in three tries
      if (!this.things.stallions.some((s) => s.getData('tank')) && Math.random() < 0.35) this.spawnTank(1400, rnd());
    });

    this.hud();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as typeof this.keys;
    this.input.keyboard?.on('keydown-P', () => this.togglePause());
    this.input.keyboard?.on('keydown-R', () => this.over && this.retry());
    this.input.setDefaultCursor('url(assets/crosshair.png) 15 15, crosshair');
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: unknown[]) => {
      if (over.length) return; // a button was pressed, not the map
      if (this.over) return this.retry();
      if (this.time.now - this.lastShot < 250) return; // one shot at a time, even when several fingers tap together
      this.lastShot = this.time.now;
      this.aim(p);
      this.shoot();
    });
    if (isTouch(this)) this.touchControls();

    this.sound.play('bgm', { loop: true, volume: db(-14) });
    this.events.once('shutdown', () => this.input.setDefaultCursor('default'));
  }

  private hud() {
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) => o.setScrollFactor(0).setDepth(20);
    fixed(this.add.rectangle(122, 55, 242, 109, 0x000000, 0.7));
    this.scoreText = fixed(text(this, 9, 9, '', 23, { fontStyle: 'bold italic', color: '#e9ffe9' }));
    fixed(text(this, 13, 74, 'HEALTH', 15));
    fixed(this.add.rectangle(4, 98, 227, 13, 0xeaeaea).setOrigin(0, 0.5));
    this.bar = fixed(this.add.rectangle(8, 98, barWidth(this.hp), 7, 0xdd214c).setOrigin(0, 0.5));
    if (!isTouch(this)) fixed(text(this, 289, 12, 'Press P to Pause', 23));
    this.healFx = fixed(this.add.sprite(403, 149, 'heal').setDisplaySize(196, 196).play('heal').setVisible(false));
  }

  private touchControls() {
    this.input.addPointer(3); // drive and shoot at the same time
    const R = 60;
    const base = this.add.circle(0, 0, R, 0xffffff, 0.2).setStrokeStyle(2, 0xffffff, 0.5).setScrollFactor(0).setDepth(30);
    const knob = this.add.circle(0, 0, 28, 0xffffff, 0.5).setScrollFactor(0).setDepth(31);
    const pause = this.add.circle(0, 0, 22, 0xffffff, 0.25).setStrokeStyle(2, 0xffffff, 0.6).setScrollFactor(0).setDepth(30);
    const pauseText = text(this, 0, 0, 'II', 15).setOrigin(0.5).setAlpha(0.8).setScrollFactor(0).setDepth(31);
    const layout = () => { // stay in the corners on any screen width
      const { width, height } = this.scale;
      base.setPosition(100, height - 100);
      knob.setPosition(base.x, base.y);
      pause.setPosition(width - 34, 34);
      pauseText.setPosition(pause.x, pause.y);
    };
    layout();
    this.scale.on('resize', layout);
    this.events.once('shutdown', () => this.scale.off('resize', layout));
    pause.setInteractive().on('pointerdown', () => this.togglePause());

    const drag = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stick.id) return;
      const a = Phaser.Math.Angle.Between(base.x, base.y, p.x, p.y);
      const d = Math.min(R, Phaser.Math.Distance.Between(base.x, base.y, p.x, p.y));
      knob.setPosition(base.x + Math.cos(a) * d, base.y + Math.sin(a) * d);
      this.stick.angle = Phaser.Math.RadToDeg(a);
      this.stick.strength = d / R;
    };
    // Bigger touch area than the drawn circle, so a thumb landing a bit off still grabs the stick.
    base.setInteractive(new Phaser.Geom.Circle(R, R, R * 1.6), Phaser.Geom.Circle.Contains)
      .on('pointerdown', (p: Phaser.Input.Pointer) => { this.stick.id = p.id; drag(p); });
    this.input.on('pointermove', drag);
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stick.id) return;
      this.stick = { id: -1, angle: 0, strength: 0 };
      knob.setPosition(base.x, base.y);
    });
  }

  private spawn(list: Thing[], x: number, y: number, key: string, w: number, h: number, angle: number, data: object) {
    const s = this.add.sprite(x, y, key).setDisplaySize(w, h).setAngle(angle).setDepth(2).setData({ touching: false, ...data });
    list.push(s);
    return s;
  }

  private spawnEnemy(x: number, y: number, angle: number) {
    this.spawn(this.things.enemies, x, y, 'enemy', 90, 90, angle, { hp: 3, speed: 100 });
  }

  private spawnStallion(x: number, y: number, angle: number) {
    const s = this.spawn(this.things.stallions, x, y, 'stallion', 87, 41, angle, { hp: 1, speed: 120, reload: 1.5 }).setOrigin(0.3, 0.5);
    s.setData('gun', this.add.image(x, y, 'handgun').setOrigin(0.15, 0.2).setDisplaySize(23, 8).setDepth(2.5));
  }

  private spawnTank(x: number, y: number) {
    const t = this.spawn(this.things.stallions, x, y, 'tank', 100, 64, 0,
      { hp: 20, speed: 50, reload: 2, rate: 2, tank: true, ram: 0, hit: 2, points: 25, shell: 1 });
    t.setData('gun', this.add.image(x, y, 'tank-turret').setOrigin(0.29, 0.5).setDepth(2.5));
    t.setData('bar', this.add.rectangle(x, y, 60, 5, 0xdd214c).setOrigin(0, 0.5).setDepth(2.6));
    const warn = text(this, this.scale.width / 2, 140, 'TANK INCOMING!', 30, { color: '#ffd84a' }).setOrigin(0.5).setScrollFactor(0).setDepth(22);
    this.tweens.add({ targets: warn, alpha: 0, delay: 1500, duration: 800, onComplete: () => warn.destroy() });
    this.sfx('menuopen');
  }

  private spawnGuy(x: number, y: number) {
    this.spawn(this.things.guys, x, y, 'guy-run', 37, 37, 0, { hp: 1, speed: 80 }).play('guy-run');
  }

  private spawnHeart(x: number, y: number) {
    this.spawn(this.things.hearts, x, y, 'heart', 22, 22, 0, {}).play('heart');
  }

  private boom(x: number, y: number) {
    this.add.sprite(x, y, 'explosion').setDepth(6).play('explosion').once('animationcomplete', function (this: Thing) { this.destroy(); });
  }

  private sfx(key: string, vol = -15) {
    this.sound.play(key, { volume: db(vol) });
  }

  private shake() {
    this.cameras.main.shake(400, 20 / W);
  }

  private hurt(amount: number) {
    this.hp -= amount;
    this.bar.width = barWidth(this.hp);
    this.sfx('carhit');
    if (this.hp <= 0) this.gameOver();
  }

  private aim(p: Phaser.Input.Pointer) {
    p.updateWorldPoint(this.cameras.main);
    this.gun.setRotation(Phaser.Math.Angle.Between(this.gun.x, this.gun.y, p.worldX, p.worldY));
  }

  private shoot() {
    if (this.paused || this.over) return;
    const a = this.gun.rotation;
    const s = this.spawn(this.things.bullets, this.gun.x + Math.cos(a) * 28, this.gun.y + Math.sin(a) * 28, 'bullet', 24, 12, this.gun.angle, { speed: 600 });
    s.setDepth(5);
    this.sfx('shoot', -22);
  }

  private punch() {
    for (const g of this.things.guys) {
      if (this.over || g.getData('hp') <= 0 || this.dist(g) > 35) continue;
      g.setTexture('guy-punch').setDisplaySize(64, 37);
      this.time.delayedCall(300, () => g.active && g.getData('hp') > 0 && g.setTexture('guy-run').setDisplaySize(37, 37));
      this.shake();
      this.hurt(0.5);
    }
  }

  private dist(o: { x: number; y: number }) {
    return Phaser.Math.Distance.Between(o.x, o.y, this.car.x, this.car.y);
  }

  private faceCar(o: Thing) {
    o.setAngle(Phaser.Math.RadToDeg(Phaser.Math.Angle.Between(o.x, o.y, this.car.x, this.car.y)));
  }

  private togglePause() {
    if (this.over) return;
    this.paused = !this.paused;
    this.time.paused = this.paused;
    if (this.paused) {
      this.anims.pauseAll();
      this.sfx('menuopen');
      this.pauseUi = [
        this.add.rectangle(0, 0, 4000, 4000, 0x000000, 150 / 255).setScrollFactor(0).setDepth(25),
        text(this, this.scale.width / 2, this.scale.height / 2, 'Paused', 32).setOrigin(0.5).setScrollFactor(0).setDepth(26),
      ];
    } else {
      this.anims.resumeAll();
      this.sfx('menuclose');
      this.pauseUi.forEach((o) => o.destroy());
    }
  }

  private retry() {
    this.sound.stopAll();
    this.scene.restart();
  }

  update(_: number, deltaMs: number) {
    if (this.paused || this.over) return;
    const dt = Math.min(deltaMs, 100) / 1000; // a backgrounded tab must not teleport everything
    const k = this.keys;
    const t = stickKeys(this.car.angle, this.stick.angle, this.stick.strength);
    this.car = stepCar(this.car, {
      up: k.W.isDown || k.UP.isDown || t.up,
      down: k.S.isDown || k.DOWN.isDown,
      left: k.A.isDown || k.LEFT.isDown || t.left,
      right: k.D.isDown || k.RIGHT.isDown || t.right,
    }, dt);
    this.player.setPosition(this.car.x, this.car.y).setAngle(this.car.angle);
    this.gun.setPosition(this.car.x, this.car.y);
    if (!isTouch(this)) this.aim(this.input.activePointer);

    const move = (s: Thing) => {
      const sp = s.getData('speed') * dt;
      s.x += Math.cos(s.rotation) * sp;
      s.y += Math.sin(s.rotation) * sp;
    };
    const outside = (s: Thing) => s.x < 0 || s.y < 0 || s.x > WORLD_W || s.y > WORLD_H;
    const near = (a: Thing, r: number) => this.dist(a) < r;
    // "On collision" in Construct fires once when the overlap starts, not every frame.
    const bump = (s: Thing, r: number) => {
      const hit = near(s, r);
      const fresh = hit && !s.getData('touching');
      s.setData('touching', hit);
      return fresh;
    };
    const { bullets, metal, enemies, stallions, guys, hearts } = this.things;

    for (const e of enemies) {
      const d = this.dist(e);
      if (outside(e) || (d < 200 && d > 100)) this.faceCar(e);
      move(e);
      if (bump(e, 50)) {
        this.car.speed = 0;
        this.shake();
        e.data.values.hp -= 2;
        this.hurt(1);
      }
    }

    // Stallions (red cars with a gunner) and the tank share this loop; the tank's data overrides the defaults.
    for (const s of stallions) {
      const tank = s.getData('tank');
      if (tank) s.rotation = Phaser.Math.Angle.RotateTo(s.rotation, Phaser.Math.Angle.Between(s.x, s.y, this.car.x, this.car.y), dt); // slowly turns to chase you
      else if (outside(s)) this.faceCar(s);
      move(s);
      const gun = s.getData('gun') as Phaser.GameObjects.Image;
      gun.setPosition(s.x, s.y);
      s.getData('bar')?.setPosition(s.x - 30, s.y - 48).setSize(60 * s.getData('hp') / 20, 5);
      if (this.dist(s) < 500) {
        gun.setRotation(Phaser.Math.Angle.Between(s.x, s.y, this.car.x, this.car.y));
        s.data.values.reload -= dt;
        if (s.getData('reload') <= 0) {
          s.setData('reload', s.getData('rate') ?? 1.5);
          const len = tank ? 50 : 20;
          this.spawn(metal, gun.x + Math.cos(gun.rotation) * len, gun.y + Math.sin(gun.rotation) * len, 'metalbullet', tank ? 26 : 17, tank ? 8 : 4, gun.angle,
            { speed: tank ? 350 : 500, dmg: s.getData('shell') ?? 0.2 }).setDepth(5);
          this.sfx(tank ? 'explode' : 'shoot', -22);
        }
      }
      if (bump(s, tank ? 60 : 45)) {
        this.car.speed = 0;
        this.shake();
        s.data.values.hp -= s.getData('ram') ?? 3;
        this.hurt(s.getData('hit') ?? 1);
      }
    }

    for (const g of guys) {
      if (g.getData('hp') <= 0) continue;
      const d = this.dist(g);
      if (outside(g) || (d < 300 && d > 35)) this.faceCar(g);
      if (d <= 35) { g.setData('speed', 0); g.anims.pause(); }
      else if (d >= 50) { g.setData('speed', 80); g.anims.resume(); }
      move(g);
      if (bump(g, 35) && Math.abs(this.car.speed) >= 2) {
        this.shake();
        this.killGuy(g);
      }
    }

    for (const h of hearts) {
      if (!near(h, 35)) continue;
      h.destroy();
      this.hp = heal(this.hp);
      this.bar.width = barWidth(this.hp);
      this.sfx('heal');
      this.healFx.setVisible(true);
      this.time.delayedCall(2000, () => this.healFx.setVisible(false));
    }

    for (const b of bullets) {
      move(b);
      if (outside(b)) { b.destroy(); continue; }
      const target = [...enemies, ...stallions].find((e) => Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y) < 40)
        ?? guys.find((g) => g.getData('hp') > 0 && Phaser.Math.Distance.Between(b.x, b.y, g.x, g.y) < 20);
      if (!target) continue;
      if (guys.includes(target)) this.killGuy(target);
      else { target.data.values.hp -= 1; this.boom(b.x, b.y); }
      b.destroy();
    }

    for (const m of metal) {
      move(m);
      if (outside(m)) m.destroy();
      else if (near(m, 30)) { this.boom(m.x, m.y); m.destroy(); this.hurt(m.getData('dmg')); }
    }

    for (const e of [...enemies, ...stallions]) {
      if (e.getData('hp') > 0) continue;
      this.boom(e.x, e.y);
      e.getData('gun')?.destroy();
      e.getData('bar')?.destroy();
      if (e.getData('tank')) for (let i = 0; i < 3; i++) this.time.delayedCall(i * 150, () => this.boom(e.x + Phaser.Math.Between(-40, 40), e.y + Phaser.Math.Between(-30, 30)));
      this.score += e.getData('points') ?? 5; // before destroy(), which clears the data
      e.destroy();
      this.sfx('explode');
    }

    if (this.deadGuys >= 30) { // clear old bodies so they don't pile up
      for (const g of guys) if (g.getData('hp') <= 0) g.destroy();
      this.deadGuys = 0;
    }

    for (const k in this.things) {
      const key = k as keyof typeof this.things;
      this.things[key] = this.things[key].filter((s) => s.active);
    }
    this.scoreText.setText(`SCORE : [${this.score}]`);
  }

  private killGuy(g: Thing) {
    g.setData({ hp: 0, speed: 0 }).stop().setTexture('guy-dead').setDisplaySize(37, 46).setDepth(1);
    this.add.sprite(g.x, g.y, 'blood').setDisplaySize(80, 80).setDepth(0.5).play('blood');
    this.sfx('scrrea');
    this.sfx('splat');
    this.deadGuys++;
    this.score += 2;
  }

  private gameOver() {
    if (this.over) return;
    this.over = true;
    this.boom(this.car.x, this.car.y);
    this.player.destroy();
    this.gun.destroy();
    this.bar.width = 0;
    this.sound.stopAll();
    this.sfx('explode');
    this.sound.play('loss', { loop: true });

    const best = bestScore(this.score, readBest());
    writeBest(best);
    const ui = (o: Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle) => o.setScrollFactor(0).setDepth(26);
    const cx = this.scale.width / 2;
    const dy = (this.scale.height - H) / 2;
    ui(this.add.rectangle(0, 0, 4000, 4000, 0x000000, 150 / 255).setDepth(25));
    ui(text(this, cx, dy + 180, 'Game Over', 48).setOrigin(0.5));
    ui(text(this, cx, dy + 240, `Score : ${this.score}     Best : ${best}`, 20, { color: '#e9ffe9' }).setOrigin(0.5));
    ui(text(this, cx, dy + 285, isTouch(this) ? 'Tap to Retry' : 'Press [R] or click to Retry', 18).setOrigin(0.5));
    const rankText = ui(text(this, cx, dy + 320, '', 16, { color: '#ffd84a' }).setOrigin(0.5)) as Phaser.GameObjects.Text;
    button(this, cx, dy + 380, 110, 'MENU', '#ffffff', () => { this.sound.stopAll(); this.scene.start('menu'); })
      .forEach((o) => (o as Phaser.GameObjects.Rectangle).setScrollFactor(0).setDepth(27));

    if (this.score > readSent()) {
      this.time.delayedCall(700, () => {
        const name = playerName();
        if (!name) return;
        rankText.setText('Saving online...');
        submitScore(name, this.score)
          .then((rank) => { writeSent(this.score); if (rankText.scene) rankText.setText(`World rank #${rank}`); })
          .catch(() => rankText.scene && rankText.setText('Offline: score not sent'));
      });
    }
  }
}

class Leaderboard extends Phaser.Scene {
  constructor() { super('leaderboard'); }

  create() {
    centre(this);
    this.add.image(W / 2, H / 2, 'menu');
    this.add.rectangle(W / 2, H / 2, 4000, 4000, 0x000000, 0.7);
    text(this, W / 2, 40, 'TOP 10', 34).setOrigin(0.5);
    const status = text(this, W / 2, 220, 'Loading...', 18).setOrigin(0.5);

    fetchTop()
      .then((rows) => {
        if (!status.scene) return; // player already left this screen
        status.setText(rows.length ? '' : 'No scores yet. Be the first!');
        let me: string | null = null;
        try { me = localStorage.getItem(NAME_KEY); } catch { /* no highlight */ }
        rows.forEach((r, i) => {
          const y = 80 + i * 30;
          const color = r.name === me ? '#ffd84a' : '#ffffff';
          text(this, 280, y, `${i + 1}.`, 18, { color });
          text(this, 325, y, r.name, 18, { color });
          text(this, 575, y, String(r.score), 18, { color }).setOrigin(1, 0);
        });
      })
      .catch(() => status.scene && status.setText('Leaderboard offline'));

    const back = () => this.scene.start('menu');
    button(this, W / 2, 440, 110, 'BACK', '#ffffff', back);
    this.input.keyboard?.once('keydown-ESC', back);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot, Menu, Game, Leaderboard],
});
