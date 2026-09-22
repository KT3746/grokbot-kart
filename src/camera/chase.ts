import * as THREE from "three";
import { clamp, damp, viewSize } from "../config";
import type { KartBody } from "../physics/kart";
import { queryTrack } from "../tracks/builder";
import type { BuiltTrack } from "../tracks/types";

/** Close enough to see the kart, far enough that walls never eat the near plane. */
export const RACE_NEAR = 0.45;
export const RACE_FAR = 720;

const LOOK_TARGET = new THREE.Vector3();
const VIEW = new THREE.Vector3();

function isFiniteVec(v: THREE.Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function matrixIsFinite(m: THREE.Matrix4): boolean {
  const e = m.elements;
  for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) return false;
  return true;
}

/**
 * If the eye falls off the asphalt (behind the kart on a curve), slide it
 * inward just enough to stay on the road. Do NOT pin it to the centerline —
 * that hid the kart after the white-out fix.
 */
function stayAboveRoad(point: THREE.Vector3, track: BuiltTrack, minHeight: number): void {
  const q = queryTrack(track.samples, point);
  if (!Number.isFinite(q.lateral) || !isFiniteVec(q.right)) return;
  const limit = Math.max(2.4, q.halfWidth * 1.05);
  const over = Math.abs(q.lateral) - limit;
  // Soft lateral nudge only — a hard yank used to park the lens on empty asphalt
  // while the kart kept racing elsewhere ("camera me esqueceu").
  if (over > 0) {
    const pull = Math.min(over, 2.8);
    point.addScaledVector(q.right, -Math.sign(q.lateral) * pull);
  }
  if (Number.isFinite(q.height)) {
    point.y = Math.max(point.y, q.height + minHeight);
  }
}

/**
 * Third-person chase: sit behind and a little above the kart, look down
 * the road. The kart stays centered in the lower third from countdown
 * through the race.
 *
 * Do NOT snap the eye laterally onto the ribbon — that pulled the lens
 * onto a different sample on curves and parked the kart off-screen
 * (white-out follow-up). Height may still lift off the asphalt.
 *
 * A singular lookAt (eye == target, or NaN heading) used to write NaNs
 * into the view matrix. We refuse to lookAt a degenerate pair.
 */
export class ChaseCamera {
  private look = new THREE.Vector3();
  private desired = new THREE.Vector3();
  fov = 52;
  private snapTime = 0;

  attach(camera: THREE.PerspectiveCamera, kart: KartBody, track: BuiltTrack | null = null): void {
    this.snapTime = 2.4;
    camera.near = RACE_NEAR;
    camera.far = RACE_FAR;
    this.place(camera, kart, true, 1 / 60, track);
  }

  /** Hard re-frame after a respawn so the kart never leaves the lens. */
  bump(): void {
    this.snapTime = Math.max(this.snapTime, 0.85);
  }

  update(
    camera: THREE.PerspectiveCamera,
    kart: KartBody,
    dt: number,
    paused: boolean,
    track: BuiltTrack | null = null,
  ): void {
    this.place(camera, kart, paused, dt, track);
  }

  private place(
    camera: THREE.PerspectiveCamera,
    kart: KartBody,
    paused: boolean,
    dt: number,
    track: BuiltTrack | null,
  ): void {
    const phone = typeof window !== "undefined" && (window.innerWidth < 820 || (window.visualViewport?.width ?? 820) < 820);
    const heading = Number.isFinite(kart.heading) ? kart.heading : 0;
    const speed = Number.isFinite(kart.speed) ? Math.min(Math.abs(kart.speed), 48) : 0;
    const boost = kart.boostTime > 0 ? 1 : 0;
    // Narrow neon alleys: sit higher/further so building faces never fill the lens.
    const narrow = !!(track && track.def && track.def.mood === "neon");
    // Phone: close chase that keeps the kart above the touch pads.
    const back = (phone ? 8.2 : 10.6) + speed * 0.05 + (narrow ? 2.0 : 0);
    const height = (phone ? 4.2 : 5.0) + speed * 0.01 + (narrow ? 1.8 : 0);
    // Look AT the kart (tiny look-ahead), never at empty asphalt far ahead.
    const ahead = (phone ? 0.35 : 4.2) + speed * 0.03;
    const lookY = phone ? 1.05 : 0.62;
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    const px = Number.isFinite(kart.position.x) ? kart.position.x : 0;
    const py = Number.isFinite(kart.position.y) ? kart.position.y : 0;
    const pz = Number.isFinite(kart.position.z) ? kart.position.z : 0;

    // Face the kart heading — not the ribbon tangent. Mixing 75% tangent
    // walked the eye onto a different sample and hid the player.
    const backX = -sin;
    const backZ = -cos;

    this.desired.set(px + backX * back, py + height, pz + backZ * back);
    if (track) stayAboveRoad(this.desired, track, phone ? (narrow ? 5.6 : 4.2) : (narrow ? 6.2 : 4.8));

    LOOK_TARGET.set(px + sin * ahead, py + lookY, pz + cos * ahead);

    const snap = paused || this.snapTime > 0;
    if (this.snapTime > 0) this.snapTime = Math.max(0, this.snapTime - dt);

    if (snap || !isFiniteVec(camera.position) || !isFiniteVec(this.look) || !isFiniteVec(this.desired)) {
      camera.position.copy(this.desired);
      this.look.copy(LOOK_TARGET);
    } else {
      // fun4: slightly snappier damp — still soft enough for phone framing
      camera.position.x = damp(camera.position.x, this.desired.x, 7.1, dt);
      camera.position.y = damp(camera.position.y, this.desired.y, 6.2, dt);
      camera.position.z = damp(camera.position.z, this.desired.z, 7.1, dt);
      this.look.x = damp(this.look.x, LOOK_TARGET.x, 8.0, dt);
      this.look.y = damp(this.look.y, LOOK_TARGET.y, 8.0, dt);
      this.look.z = damp(this.look.z, LOOK_TARGET.z, 8.0, dt);
    }

    const minDist = phone ? 7.2 : 10.2;
    const dx = camera.position.x - px;
    const dy = camera.position.y - py;
    const dz = camera.position.z - pz;
    if (!isFiniteVec(camera.position) || dx * dx + dy * dy + dz * dz < minDist * minDist) {
      camera.position.copy(this.desired);
    }
    if (track) stayAboveRoad(camera.position, track, phone ? (narrow ? 5.6 : 4.2) : (narrow ? 6.2 : 4.8));

    // If road correction dragged us off the chase cone, snap back so we never
    // stare at empty asphalt while the player is elsewhere.
    const driftX = camera.position.x - this.desired.x;
    const driftZ = camera.position.z - this.desired.z;
    if (driftX * driftX + driftZ * driftZ > 16) {
      camera.position.copy(this.desired);
      this.look.copy(LOOK_TARGET);
    }

    if (!isFiniteVec(this.look) || camera.position.distanceToSquared(this.look) < 0.25) {
      this.look.set(px + sin * ahead, py + lookY, pz + cos * ahead);
    }

    VIEW.copy(this.look).sub(camera.position);
    const horiz = VIEW.x * VIEW.x + VIEW.z * VIEW.z;
    if (horiz < 0.04) {
      this.look.x = px + sin * Math.max(2.5, ahead + 2);
      this.look.z = pz + cos * Math.max(2.5, ahead + 2);
      this.look.y = py + lookY;
    }

    camera.up.set(0, 1, 0);
    camera.lookAt(this.look);

    if (!matrixIsFinite(camera.matrix) || !isFiniteVec(camera.position)) {
      camera.position.set(px + backX * back, py + height, pz + backZ * back);
      camera.up.set(0, 1, 0);
      camera.lookAt(px + sin * Math.max(2.5, ahead + 2), py + lookY, pz + cos * Math.max(2.5, ahead + 2));
      if (!matrixIsFinite(camera.matrix)) {
        camera.quaternion.identity();
        camera.rotation.set(0, heading, 0);
        camera.position.set(px + backX * back, py + height, pz + backZ * back);
      }
    }

    // fun4: a bit more FOV punch on boost; damp stays tame for phone
    const wantFov = (phone ? 50 : 48) + speed * 0.22 + boost * 9;
    this.fov = snap ? wantFov : damp(this.fov, wantFov, 5.0, dt);
    if (!Number.isFinite(this.fov)) this.fov = 50;
    camera.fov = clamp(this.fov, 42, 72);
    // Light punch when the kart shakes (hits / walls / landings).
    const reduceMotion =
      typeof document !== "undefined" && document.body.classList.contains("reduce-motion");
    if (kart.shake > 0 && !snap && !reduceMotion) {
      const punch = Math.min(0.22, kart.shake) * 0.55;
      camera.position.x += (Math.random() - 0.5) * punch;
      camera.position.y += (Math.random() - 0.5) * punch * 0.6;
      camera.position.z += (Math.random() - 0.5) * punch;
    }
    camera.near = RACE_NEAR;
    camera.far = RACE_FAR;
    // Match Game.viewSize (visualViewport) — innerWidth alone skews phone framing
    // and made the chase look like it "forgot" the kart.
    const { w, h } = viewSize();
    camera.aspect = w / Math.max(1, h);
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
}
