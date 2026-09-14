import type { InputState } from "../types";
import { clamp, wrapPi } from "../config";
import type { BuiltTrack } from "../tracks/types";
import { queryTrack } from "../tracks/builder";
import type { Racer } from "./types";

function lookahead(track: BuiltTrack, progress: number, ahead: number) {
  let best = track.samples[0];
  let bestD = 1;
  const target = (progress + ahead) % 1;
  for (const s of track.samples) {
    if (s.shortcut) continue;
    const d = Math.abs(s.progress - target);
    const wrap = Math.min(d, 1 - d);
    if (wrap < bestD) {
      bestD = wrap;
      best = s;
    }
  }
  return best;
}

export function thinkAI(
  racer: Racer,
  others: Racer[],
  track: BuiltTrack,
  playerProgress: number,
  wantItem: () => void,
): InputState {
  const k = racer.kart;
  const q = queryTrack(track.samples, k.position, k.progress);
  const look = lookahead(track, k.progress, 0.05 + Math.abs(k.speed) * 0.0014);
  const look2 = lookahead(track, k.progress, 0.1);

  let desiredLat = -Math.sign(look.curvature - 0.02) * clamp(look.curvature * 8.5, 0, 2.4);
  if (racer.aiStyle === "linha") desiredLat *= 1.2;
  if (racer.aiStyle === "caos") desiredLat += Math.sin(k.progress * 42 + k.lap) * 0.75;
  if (racer.aiStyle === "agressivo") desiredLat *= 0.85;

  // Take shortcuts when not the aggressive blocker style.
  if (racer.aiStyle !== "agressivo") {
    const cut = track.samples.find(
      (s) => s.shortcut && Math.min(Math.abs(s.progress - k.progress), 1 - Math.abs(s.progress - k.progress)) < 0.035,
    );
    if (cut && Math.abs(k.lateral) < q.halfWidth) {
      desiredLat = cut.position.clone().sub(k.position).dot(q.right);
    }
  }

  const worldTarget = look.position.clone().addScaledVector(look.binormal, desiredLat);
  const to = worldTarget.clone().sub(k.position);
  const wantHeading = Math.atan2(to.x, to.z);
  const err = wrapPi(wantHeading - k.heading);
  let steer = clamp(err * 1.75, -1, 1);

  // Nudge toward the player when aggressive and nearby behind them.
  if (racer.aiStyle === "agressivo") {
    const player = others.find((o) => o.isPlayer);
    if (player && !placeAhead(racer, player) && dist(racer, player) < 14) {
      const side = player.kart.position.clone().sub(k.position).dot(q.right);
      steer = clamp(steer + Math.sign(side) * 0.22, -1, 1);
    }
  }

  const sharp = look.curvature + look2.curvature;
  const drift = sharp > 0.17 && k.speed > 11 && Math.abs(steer) > 0.32;
  let throttle = 1;
  let brake = 0;
  if (sharp > 0.3 && k.speed > 19) {
    throttle = 0.32;
    brake = 0.28;
  } else if (sharp > 0.22 && k.speed > 22) {
    throttle = 0.55;
  }

  const selfDist = k.lap + k.progress;
  const gap = playerProgress - selfDist;
  if (gap > 0.28) throttle = 1;
  if (gap < -0.5) throttle *= 0.9;

  const ahead = others.find((o) => o.id !== racer.id && placeAhead(racer, o) && dist(racer, o) < 20);
  const behind = others.find((o) => o.id !== racer.id && !placeAhead(racer, o) && dist(racer, o) < 14);

  // Item timing: more decisive, less waste on bad corners.
  if (racer.item === "turbo" && sharp < 0.14 && k.speed > 8) wantItem();
  if (racer.item === "puck" && ahead && dist(racer, ahead) < 22) wantItem();
  if (racer.item === "soap" && behind) wantItem();
  if (racer.item === "soot" && behind && dist(racer, behind) < 16) wantItem();
  if (racer.item === "hook") wantItem();

  return { throttle, brake, steer, drift, item: false, pause: false };
}

function placeAhead(self: Racer, other: Racer): boolean {
  return other.kart.lap + other.kart.progress > self.kart.lap + self.kart.progress;
}

function dist(a: Racer, b: Racer): number {
  return a.kart.position.distanceTo(b.kart.position);
}

export function rubberBand(racer: Racer, leaderDist: number, playerDist: number): number {
  let m = 1;
  const behindLeader = leaderDist - (racer.kart.lap + racer.kart.progress);
  if (behindLeader > 0.15) m += Math.min(0.16, behindLeader * 0.1);
  if (behindLeader < -0.12) m -= Math.min(0.12, -behindLeader * 0.08);
  const vsPlayer = playerDist - (racer.kart.lap + racer.kart.progress);
  if (vsPlayer > 0.22) m += 0.07;
  if (vsPlayer < -0.3) m -= 0.06;
  if (racer.isPlayer) return 1;
  return clamp(m, 0.86, 1.18);
}
