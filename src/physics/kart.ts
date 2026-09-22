import * as THREE from "three";
import { clamp, damp, wrapPi } from "../config";
import type { InputState, KartStats } from "../types";
import { queryTrack } from "../tracks/builder";
import type { BuiltTrack } from "../tracks/types";

export class KartBody {
  position = new THREE.Vector3();
  heading = 0;
  roll = 0;
  speed = 0;
  yawRate = 0;
  vertVel = 0;
  airborne = false;
  onAsphalt = true;
  surfaceGrip = 1;
  lateral = 0;
  progress = 0;
  sampleIndex = 0;
  drifting = false;
  driftDir = 0;
  driftCharge = 0;
  boostTime = 0;
  slipTime = 0;
  stunTime = 0;
  invuln = 0;
  smokeTime = 0;
  magnetTime = 0;
  shake = 0;
  lap = 0;
  lapStart = 0;
  lastProgress = 0;
  finished = false;
  finishTime = 0;
  checkpoints = 0;
  wheelSpin = 0;
  offTrackTimer = 0;
  wallContact = false;
  stuckTimer = 0;
  airTime = 0;
  recoverTimer = 0;
  /** Set when we snap back to the ribbon; Race consumes it for the banner + cam bump. */
  justRespawned = false;

  reset(pos: THREE.Vector3, heading: number): void {
    this.position.copy(pos);
    this.heading = heading;
    this.speed = 0;
    this.yawRate = 0;
    this.vertVel = 0;
    this.airborne = false;
    this.drifting = false;
    this.driftCharge = 0;
    this.boostTime = 0;
    this.slipTime = 0;
    this.stunTime = 0;
    this.shake = 0;
    this.lap = 0;
    this.lastProgress = 0.0;
    this.finished = false;
    this.checkpoints = 0;
    this.offTrackTimer = 0;
    this.wallContact = false;
    this.stuckTimer = 0;
    this.airTime = 0;
    this.recoverTimer = 0;
    this.justRespawned = false;
  }
}

function snapToRibbon(kart: KartBody, track: BuiltTrack): void {
  const main = track.samples.filter((x) => !x.shortcut);
  let s = main[0] ?? track.samples[0];
  let best = 1;
  for (const cand of main) {
    const d = Math.abs(cand.progress - kart.progress);
    const wrap = Math.min(d, 1 - d);
    if (wrap < best) {
      best = wrap;
      s = cand;
    }
  }
  kart.position.copy(s.position);
  kart.position.y += 0.06;
  kart.heading = Math.atan2(s.tangent.x, s.tangent.z);
  kart.speed = Math.max(4, kart.speed * 0.4);
  kart.airborne = false;
  kart.vertVel = 0;
  kart.shake = 0.28;
  kart.offTrackTimer = 0;
  kart.stuckTimer = 0;
  kart.airTime = 0;
  kart.wallContact = false;
  kart.recoverTimer = 0;
  kart.justRespawned = true;
  kart.invuln = Math.max(kart.invuln, 1.4);
}

const FWD = new THREE.Vector3();
const PUSH = new THREE.Vector3();

export function stepKart(
  kart: KartBody,
  input: InputState,
  stats: KartStats,
  track: BuiltTrack,
  dt: number,
): void {
  kart.invuln = Math.max(0, kart.invuln - dt);
  kart.boostTime = Math.max(0, kart.boostTime - dt);
  kart.slipTime = Math.max(0, kart.slipTime - dt);
  kart.stunTime = Math.max(0, kart.stunTime - dt);
  kart.smokeTime = Math.max(0, kart.smokeTime - dt);
  kart.magnetTime = Math.max(0, kart.magnetTime - dt);
  kart.shake = Math.max(0, kart.shake - dt);

  if (
    !Number.isFinite(kart.heading) ||
    !Number.isFinite(kart.speed) ||
    !Number.isFinite(kart.position.x) ||
    !Number.isFinite(kart.position.y) ||
    !Number.isFinite(kart.position.z)
  ) {
    snapToRibbon(kart, track);
    kart.heading = Number.isFinite(kart.heading) ? wrapPi(kart.heading) : 0;
    kart.speed = 0;
    kart.yawRate = 0;
    return;
  }

  const stunned = kart.stunTime > 0;
  const throttle = stunned ? 0 : input.throttle;
  const brake = stunned ? 1 : input.brake;
  const steerIn = stunned ? 0 : input.steer;
  const wantDrift = !stunned && input.drift;

  const prefer = Number.isFinite(kart.progress) ? kart.progress : null;
  const q = queryTrack(track.samples, kart.position, prefer);
  kart.sampleIndex = q.index;
  if (prefer == null) {
    kart.progress = q.progress;
  } else {
    const raw = Math.abs(q.progress - prefer);
    const jump = Math.min(raw, 1 - raw);
    // Accept normal forward motion; reject folded-track jumps (teleport stutter).
    if (jump <= 0.14) kart.progress = q.progress;
  }
  kart.lateral = q.lateral;
  kart.onAsphalt = q.surface === "asphalt" && Math.abs(q.lateral) < q.halfWidth;
  const onRunoff = Math.abs(q.lateral) > q.halfWidth && Math.abs(q.lateral) < q.halfWidth + q.runoff;
  const offRibbon = Math.abs(q.lateral) > q.halfWidth + q.runoff;

  const away = kart.position.distanceTo(q.sample.position);
  const planar = Math.hypot(kart.position.x - q.sample.position.x, kart.position.z - q.sample.position.z);
  // Hard-snap only if fallen or absurdly far. Never mid-accel on a fold.
  if (kart.invuln <= 0 && (kart.position.y < -2.5 || (away > 36 && planar > 36))) {
    snapToRibbon(kart, track);
    return;
  }

  const groundY = q.height + 0.02;
  if (!kart.airborne) {
    kart.airTime = 0;
    if (q.slope > 0.48 && kart.speed > 20 && kart.onAsphalt) {
      kart.airborne = true;
      kart.vertVel = kart.speed * q.slope * 0.32;
    } else {
      kart.position.y = damp(kart.position.y, groundY, 16, dt);
    }
  } else {
    kart.airTime += dt;
    kart.vertVel -= 26 * dt;
    kart.position.y += kart.vertVel * dt;
    if (kart.position.y <= groundY || kart.airTime > 1.6) {
      kart.position.y = groundY;
      kart.airborne = false;
      kart.vertVel = 0;
      kart.airTime = 0;
      kart.shake = Math.max(kart.shake, 0.12);
    }
  }

  let grip = stats.grip;
  if (kart.airborne) grip *= 0.08;
  else if (kart.onAsphalt) grip *= 1;
  else if (onRunoff) grip *= q.surface === "sand" ? 0.38 : 0.46;
  else grip *= 0.3;
  if (kart.slipTime > 0) grip *= 0.16;
  if (kart.drifting) grip *= 0.58;
  kart.surfaceGrip = grip;

  const top =
    (22 + stats.topSpeed * 18) *
    (kart.boostTime > 0 ? 1.52 : 1) *
    (kart.onAsphalt ? 1 : kart.airborne ? 0.72 : onRunoff ? 0.32 : 0.18);
  const acc = 10.4 + stats.accel * 12.5;

  if (!kart.onAsphalt && !kart.airborne) {
    kart.speed *= Math.exp(-(onRunoff ? 1.8 : 3.2) * dt);
  }

  if (brake > 0.1) {
    kart.speed = Math.max(kart.speed - (32 + brake * 10) * dt, -7);
  } else if (throttle > 0.05) {
    const room = top - kart.speed;
    kart.speed += Math.max(0, room) * (acc / 18) * throttle * dt * (kart.airborne ? 0.25 : 1);
    if (kart.speed < 6) kart.speed += acc * 0.72 * throttle * dt;
  } else {
    kart.speed *= Math.exp(-0.85 * dt);
  }

  const speedNorm = clamp(Math.abs(kart.speed) / 28, 0, 1);
  // Casual turn rate: keep curves controllable (no 360 spin on a short hold).
  let steer = steerIn * (0.38 + stats.handling * 0.42) * (1.05 - 0.45 * speedNorm);

  if (wantDrift && Math.abs(kart.speed) > 9 && Math.abs(steerIn) > 0.15 && !kart.airborne) {
    if (!kart.drifting) kart.driftDir = Math.sign(steerIn) || kart.driftDir || 1;
    kart.drifting = true;
    // fun4: slightly faster charge so a clean hold feels rewarding without runaway turbo
    kart.driftCharge += dt * (0.62 + stats.drift * 0.9) * (0.68 + Math.abs(steerIn) * 0.5);
    steer += kart.driftDir * (0.28 + stats.drift * 0.18);
    kart.speed *= Math.exp(-0.07 * dt);
  } else if (kart.drifting) {
    if (kart.driftCharge > 0.38 && kart.slipTime <= 0) {
      kart.boostTime = Math.min(2.05, 0.62 + kart.driftCharge * 0.92 * stats.drift);
    }
    kart.drifting = false;
    kart.driftCharge = 0;
  }

  const steerScale = (kart.airborne ? 0.15 : 1) * clamp(grip, 0.12, 1.15);
  // Player steers — no auto-pilot / center pull (felt like "drives itself").
  kart.yawRate = damp(kart.yawRate, steer * (0.85 + (1 - grip) * 0.25), 9, dt);
  kart.heading += kart.yawRate * (2.8 + Math.abs(kart.speed) * 0.055) * dt * steerScale;
  // Tiny road hint only when hands are off the stick — not enough to drive for you.
  if (Math.abs(steerIn) < 0.08 && kart.onAsphalt && !kart.drifting && !kart.airborne) {
    const roadH = Math.atan2(q.tangent.x, q.tangent.z);
    kart.heading += wrapPi(roadH - kart.heading) * (1 - Math.exp(-0.7 * dt));
  }
  kart.heading = wrapPi(kart.heading);

  FWD.set(Math.sin(kart.heading), 0, Math.cos(kart.heading));
  kart.position.addScaledVector(FWD, kart.speed * dt);
  if (onRunoff && !kart.airborne) {
    kart.position.addScaledVector(q.right, -Math.sign(q.lateral) * 3.2 * dt);
  }
  if (offRibbon && !kart.airborne) {
    kart.position.addScaledVector(q.right, -Math.sign(q.lateral) * 5.5 * dt);
  }
  if (offRibbon && !q.sample.shortcut && kart.invuln <= 0 && Math.abs(kart.speed) < 2) {
    kart.recoverTimer += dt;
    if (kart.recoverTimer > 4) {
      snapToRibbon(kart, track);
      return;
    }
  } else {
    kart.recoverTimer = 0;
  }

  const q2 = queryTrack(track.samples, kart.position, kart.progress);
  {
    const raw = Math.abs(q2.progress - kart.progress);
    const jump = Math.min(raw, 1 - raw);
    if (jump <= 0.14) kart.progress = q2.progress;
  }
  kart.lateral = q2.lateral;
  const limit = q2.halfWidth + q2.runoff;
  const over = Math.abs(q2.lateral) - limit;
  if (over > 0) {
    // Cap the correction so a bad lateral never flings the kart to another ribbon.
    const pushAmt = Math.min(over + 0.08, 1.6);
    PUSH.copy(q2.right).multiplyScalar(-Math.sign(q2.lateral) * pushAmt);
    kart.position.add(PUSH);
    if (!kart.wallContact) {
      kart.speed *= 0.88;
      kart.heading += -Math.sign(q2.lateral) * 0.05;
      kart.shake = Math.max(kart.shake, 0.12);
      if (kart.drifting) kart.driftCharge *= 0.35;
    }
    kart.wallContact = true;
    kart.offTrackTimer += dt;
    // Respawn only if stuck outside for a long time — not during accel stutter.
    if (kart.invuln <= 0 && over > 6 && kart.offTrackTimer > 3.5) {
      snapToRibbon(kart, track);
      return;
    }
  } else {
    kart.wallContact = false;
    kart.offTrackTimer = 0;
  }

  // Stuck only when fully stopped off-ribbon — never while accelerating.
  if (!kart.onAsphalt && !onRunoff && Math.abs(kart.speed) < 0.35) {
    kart.stuckTimer += dt;
    if (kart.stuckTimer > 2.5) {
      snapToRibbon(kart, track);
      return;
    }
  } else {
    kart.stuckTimer = 0;
  }

  kart.roll = damp(kart.roll, -steerIn * 0.18 - kart.yawRate * 0.08, 8, dt);
  kart.wheelSpin += kart.speed * dt * 1.8;

  updateLap(kart);
}

function updateLap(kart: KartBody): void {
  const prev = kart.lastProgress;
  const cur = kart.progress;
  if (prev > 0.82 && cur < 0.18 && kart.checkpoints >= 1) {
    kart.lap += 1;
    kart.checkpoints = 0;
  }
  if (cur > 0.45 && cur < 0.7) kart.checkpoints = Math.max(kart.checkpoints, 1);
  kart.lastProgress = cur;
}

export function raceDistance(kart: KartBody): number {
  return kart.lap + clamp(kart.progress, 0, 0.999);
}

export function collideKarts(a: KartBody, b: KartBody, wa: number, wb: number): void {
  const dx = a.position.x - b.position.x;
  const dz = a.position.z - b.position.z;
  const d2 = dx * dx + dz * dz;
  const min = 1.85;
  if (d2 > min * min || d2 < 1e-6) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const nz = dz / d;
  const overlap = min - d;
  const ta = wb / (wa + wb);
  const tb = wa / (wa + wb);
  a.position.x += nx * overlap * ta;
  a.position.z += nz * overlap * ta;
  b.position.x -= nx * overlap * tb;
  b.position.z -= nz * overlap * tb;
  const rel = a.speed - b.speed;
  a.speed -= rel * 0.18 * tb;
  b.speed += rel * 0.18 * ta;
  if (Math.abs(rel) > 8) {
    a.shake = Math.max(a.shake, 0.16);
    b.shake = Math.max(b.shake, 0.16);
  }
}
