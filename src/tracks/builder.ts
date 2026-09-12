import * as THREE from "three";
import { computeFrames, pathLength, sampleClosedSpline } from "../math/spline";
import { makeAsphalt, makeDirt, makeSand } from "../world/textures";
import type { BuiltTrack, TrackDef, TrackQuery, TrackSample } from "./types";
import type { Surface } from "../types";
import { wrapPi } from "../config";

const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();

function addRibbon(
  samples: TrackSample[],
  group: THREE.Group,
  asphalt: THREE.Texture,
  palette: TrackDef["palette"],
): void {
  const n = samples.length;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const curbPos: number[] = [];
  const curbCol: number[] = [];
  const curbIdx: number[] = [];
  const runPos: number[] = [];
  const runNrm: number[] = [];
  const runUv: number[] = [];
  const runIdx: number[] = [];

  const curbA = new THREE.Color(palette.curbA);
  const curbB = new THREE.Color(palette.curbB);

  let dist = 0;
  for (let i = 0; i < n; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % n];
    const hw = a.halfWidth;
    const left = TMP.copy(a.position).addScaledVector(a.binormal, -hw);
    const right = TMP2.copy(a.position).addScaledVector(a.binormal, hw);
    pos.push(left.x, left.y, left.z, right.x, right.y, right.z);
    nrm.push(a.normal.x, a.normal.y, a.normal.z, a.normal.x, a.normal.y, a.normal.z);
    uv.push(0, dist * 0.12, 1, dist * 0.12);

    const i0 = i * 2;
    const i1 = i * 2 + 1;
    const i2 = ((i + 1) % n) * 2;
    const i3 = ((i + 1) % n) * 2 + 1;
    if (a.position.distanceTo(b.position) < 8 && a.binormal.dot(b.binormal) > 0.15) {
      idx.push(i0, i2, i1, i1, i2, i3);
    }

    const stripe = Math.floor(dist / 2.2) % 2 === 0 ? curbA : curbB;
    for (const side of [-1, 1] as const) {
      const inner = a.position.clone().addScaledVector(a.binormal, side * (hw - 0.08));
      const outer = a.position.clone().addScaledVector(a.binormal, side * (hw + 0.55));
      inner.y += 0.05;
      outer.y += 0.03;
      curbPos.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
      curbCol.push(stripe.r, stripe.g, stripe.b, stripe.r, stripe.g, stripe.b);
    }
    if (segmentJoins(a, b)) {
      for (const off of [0, 2]) {
        const base = i * 4 + off;
        const nextBase = ((i + 1) % n) * 4 + off;
        curbIdx.push(base, nextBase, base + 1, base + 1, nextBase, nextBase + 1);
      }
    }

    const run = a.runoff;
    const rL = a.position.clone().addScaledVector(a.binormal, -(hw + run));
    const rR = a.position.clone().addScaledVector(a.binormal, hw + run);
    rL.y -= 0.08;
    rR.y -= 0.08;
    runPos.push(rL.x, rL.y, rL.z, left.x, left.y - 0.02, left.z, right.x, right.y - 0.02, right.z, rR.x, rR.y, rR.z);
    for (let k = 0; k < 4; k++) runNrm.push(0, 1, 0);
    runUv.push(0, dist * 0.08, 0.35, dist * 0.08, 0.65, dist * 0.08, 1, dist * 0.08);
    const rb = i * 4;
    const nb = ((i + 1) % n) * 4;
    if (segmentJoins(a, b)) {
      runIdx.push(rb, nb, rb + 1, rb + 1, nb, nb + 1);
      runIdx.push(rb + 2, nb + 2, rb + 3, rb + 3, nb + 2, nb + 3);
    }

    dist += a.position.distanceTo(b.position);
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  roadGeo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  roadGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  roadGeo.setIndex(idx);

  const roadMat = new THREE.MeshStandardMaterial({
    map: asphalt,
    roughness: 0.28,
    metalness: 0.22,
    color: 0xf0f3f8,
    envMapIntensity: 1.05,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  const dash = makeCenterDash(samples);
  group.add(dash);

  const start = makeStartGate(samples[0]);
  group.add(start);

  const curbGeo = new THREE.BufferGeometry();
  curbGeo.setAttribute("position", new THREE.Float32BufferAttribute(curbPos, 3));
  curbGeo.setAttribute("color", new THREE.Float32BufferAttribute(curbCol, 3));
  curbGeo.setIndex(curbIdx);
  curbGeo.computeVertexNormals();
  const curbMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const curb = new THREE.Mesh(curbGeo, curbMat);
  group.add(curb);

  const runGeo = new THREE.BufferGeometry();
  runGeo.setAttribute("position", new THREE.Float32BufferAttribute(runPos, 3));
  runGeo.setAttribute("normal", new THREE.Float32BufferAttribute(runNrm, 3));
  runGeo.setAttribute("uv", new THREE.Float32BufferAttribute(runUv, 2));
  runGeo.setIndex(runIdx);
  const runTex = palette.runoff.toLowerCase().startsWith("#c") || palette.runoff.toLowerCase().startsWith("#b")
    ? makeSand()
    : makeDirt();
  runTex.repeat.set(2, 18);
  const runoff = new THREE.Mesh(
    runGeo,
    new THREE.MeshStandardMaterial({
      map: runTex,
      color: palette.runoff,
      roughness: 1,
      metalness: 0,
      emissive: new THREE.Color(palette.runoff).multiplyScalar(0.18),
    }),
  );
  runoff.frustumCulled = false;
  group.add(runoff);

  const wall = makeBarriers(samples, palette);
  group.add(wall);
}

function segmentJoins(a: TrackSample, b: TrackSample): boolean {
  if (a.shortcut || b.shortcut) return false;
  const gap = a.position.distanceTo(b.position);
  if (!Number.isFinite(gap) || gap < 0.04 || gap > 6.5) return false;
  return a.binormal.dot(b.binormal) > 0.35;
}

function makeCenterDash(samples: TrackSample[]): THREE.Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  let on = true;
  let acc = 0;
  const half = 0.12;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    acc += a.position.distanceTo(b.position);
    if (acc > 2.4) {
      acc = 0;
      on = !on;
    }
    if (!on || !segmentJoins(a, b)) continue;
    const l = a.position.clone().addScaledVector(a.binormal, -half);
    const r = a.position.clone().addScaledVector(a.binormal, half);
    const l2 = b.position.clone().addScaledVector(b.binormal, -half);
    const r2 = b.position.clone().addScaledVector(b.binormal, half);
    l.y += 0.05;
    r.y += 0.05;
    l2.y += 0.05;
    r2.y += 0.05;
    const base = pos.length / 3;
    pos.push(l.x, l.y, l.z, r.x, r.y, r.z, l2.x, l2.y, l2.z, r2.x, r2.y, r2.z);
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color: 0xd8dbe0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      depthWrite: false,
    }),
  );
}

function makeStartGate(sample: TrackSample): THREE.Group {
  const g = new THREE.Group();
  const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
  const hw = sample.halfWidth;

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(hw * 2 + 0.4, 0.04, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.45 }),
  );
  stripe.position.copy(sample.position);
  stripe.position.y += 0.03;
  stripe.rotation.y = yaw;
  g.add(stripe);

  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 4.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x9aa3ae, metalness: 0.55, roughness: 0.35 }),
    );
    pole.position.copy(sample.position).addScaledVector(sample.binormal, side * (hw + 0.7));
    pole.position.y += 2.1;
    g.add(pole);
  }

  const gantry = new THREE.Mesh(
    new THREE.BoxGeometry(hw * 2 + 1.6, 0.14, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.4, roughness: 0.45 }),
  );
  gantry.position.copy(sample.position);
  gantry.position.y += 7.2;
  gantry.rotation.y = yaw;
  g.add(gantry);

  const lightGeo = new THREE.SphereGeometry(0.12, 8, 8);
  const colors = [0xc43b2c, 0xc43b2c, 0xc43b2c, 0x3dba7a];
  colors.forEach((c, i) => {
    const bulb = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: c }));
    const x = (i - 1.5) * 0.42;
    bulb.position.copy(sample.position);
    bulb.position.addScaledVector(sample.binormal, x);
    bulb.position.y += 6.95;
    bulb.position.addScaledVector(sample.tangent, 0.18);
    g.add(bulb);
  });
  return g;
}

function makeBarriers(samples: TrackSample[], palette: TrackDef["palette"]): THREE.Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const color = new THREE.Color(palette.curbA).lerp(new THREE.Color("#2a2d33"), 0.55);
  const n = samples.length;
  const wallH = 0.82;
  const thick = 0.22;
  for (let i = 0; i < n; i++) {
    const a = samples[i];
    const hw = a.halfWidth + a.runoff + 0.55;
    for (const side of [-1, 1] as const) {
      const outer = a.position.clone().addScaledVector(a.binormal, side * hw);
      const inner = a.position.clone().addScaledVector(a.binormal, side * (hw - thick));
      pos.push(
        outer.x, outer.y, outer.z,
        outer.x, outer.y + wallH, outer.z,
        inner.x, inner.y + wallH, inner.z,
        inner.x, inner.y, inner.z,
      );
      for (let k = 0; k < 4; k++) col.push(color.r, color.g, color.b);
    }
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (!segmentJoins(samples[i], samples[j])) continue;
    for (let s = 0; s < 2; s++) {
      const i0 = i * 8 + s * 4;
      const j0 = j * 8 + s * 4;
      idx.push(i0 + 3, i0 + 2, j0 + 2, i0 + 3, j0 + 2, j0 + 3);
      idx.push(i0 + 2, i0 + 1, j0 + 1, i0 + 2, j0 + 1, j0 + 2);
      idx.push(i0 + 1, i0 + 0, j0 + 0, i0 + 1, j0 + 0, j0 + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const wallMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.58,
    metalness: 0.16,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(geo, wallMat);
  wall.frustumCulled = false;
  return wall;
}

function buildSamples(def: TrackDef): TrackSample[] {
  const sampled = sampleClosedSpline(def.points, 28);
  const positions = sampled.map((s) => s.position);
  const frames = computeFrames(positions);
  const length = pathLength(positions);
  const samples: TrackSample[] = [];
  let dist = 0;
  for (let i = 0; i < sampled.length; i++) {
    const next = sampled[(i + 1) % sampled.length].position;
    const step = sampled[i].position.distanceTo(next);
    const prevT = frames[(i - 1 + frames.length) % frames.length].tangent;
    const curvature = 1 - Math.max(-1, Math.min(1, prevT.dot(frames[i].tangent)));
    samples.push({
      position: sampled[i].position,
      tangent: frames[i].tangent,
      normal: frames[i].normal,
      binormal: frames[i].binormal,
      halfWidth: sampled[i].width * 0.5,
      runoff: def.mood === "neon" ? 2.2 : 3.4,
      progress: dist / length,
      distance: dist,
      surface: "asphalt",
      shortcut: false,
      curvature,
    });
    dist += step;
  }

  for (const cut of def.shortcuts) {
    const extra = sampleClosedSpline(
      [
        queryApprox(samples, cut.fromProgress).position,
        ...cut.points,
        queryApprox(samples, cut.toProgress).position,
        queryApprox(samples, cut.fromProgress).position,
      ],
      8,
    );
    // Use only the interior of the shortcut (not a closed loop).
    const useful = extra.slice(8, extra.length - 8);
    const framesS = computeFrames(useful.map((u) => u.position));
    const span = ((cut.toProgress - cut.fromProgress) + 1) % 1 || (cut.toProgress - cut.fromProgress);
    for (let i = 0; i < useful.length; i++) {
      const t = i / Math.max(1, useful.length - 1);
      const prevT = framesS[(i - 1 + framesS.length) % framesS.length].tangent;
      samples.push({
        position: useful[i].position,
        tangent: framesS[i].tangent,
        normal: framesS[i].normal,
        binormal: framesS[i].binormal,
        halfWidth: useful[i].width * 0.5,
        runoff: 1.6,
        progress: (cut.fromProgress + span * t) % 1,
        distance: 0,
        surface: cut.surface,
        shortcut: true,
        curvature: 1 - Math.max(-1, Math.min(1, prevT.dot(framesS[i].tangent))),
      });
    }
  }

  return samples;
}

function queryApprox(samples: TrackSample[], progress: number): TrackSample {
  let best = samples[0];
  let bestD = 1;
  for (const s of samples) {
    if (s.shortcut) continue;
    const d = Math.abs(s.progress - progress);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Progress distance on a closed [0,1) loop. */
function wrapProgressDelta(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

/**
 * Nearest ribbon sample. When preferProgress is set, heavily prefer samples
 * near that progress so parallel/overlapping track folds cannot yank the kart
 * forward/back (teleport stutter while accelerating).
 */
export function queryTrack(
  samples: TrackSample[],
  point: THREE.Vector3,
  preferProgress: number | null = null,
): TrackQuery {
  let bestI = 0;
  let bestScore = Infinity;
  const hasPref = preferProgress != null && Number.isFinite(preferProgress);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const d = s.position.distanceToSquared(point);
    const rel = TMP.copy(point).sub(s.position);
    const lat = Math.abs(rel.dot(s.binormal));
    const ribbon = lat < s.halfWidth + s.runoff + 0.6 ? 0 : 8;
    const shortcutPenalty = s.shortcut ? 2.5 : 0;
    // ~progress units: 0.08 ≈ nearby; 0.35+ is a different stretch of a folded track.
    const progPenalty = hasPref
      ? wrapProgressDelta(preferProgress as number, s.progress) * 55
      : 0;
    const score = d + ribbon + shortcutPenalty + progPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestI = i;
    }
  }
  const sample = samples[bestI];
  const rel = TMP.copy(point).sub(sample.position);
  const lateral = rel.dot(sample.binormal);
  const slope = sample.tangent.y;
  return {
    index: bestI,
    sample,
    height: sample.position.y,
    lateral,
    halfWidth: sample.halfWidth,
    runoff: sample.runoff,
    progress: sample.progress,
    surface: sample.surface,
    tangent: sample.tangent,
    right: sample.binormal,
    slope,
    onRibbon: Math.abs(lateral) < sample.halfWidth + sample.runoff + 1.2,
  };
}

export function headingFromTangent(tangent: THREE.Vector3): number {
  return Math.atan2(tangent.x, tangent.z);
}

export function alignHeading(current: number, target: number, maxDelta: number): number {
  const d = wrapPi(target - current);
  return current + Math.max(-maxDelta, Math.min(maxDelta, d));
}

export function buildTrack(def: TrackDef): BuiltTrack {
  const samples = buildSamples(def);
  const main = samples.filter((s) => !s.shortcut);
  const length = main.length ? main[main.length - 1].distance + 8 : 400;
  const group = new THREE.Group();
  group.name = def.name;

  const asphalt = makeAsphalt(def.palette.asphalt);
  asphalt.repeat.set(1, 18);
  addRibbon(samples.filter((s) => !s.shortcut), group, asphalt, def.palette);

  const cuts = samples.filter((s) => s.shortcut);
  if (cuts.length) {
    const cutTex = cuts[0].surface === "sand" ? makeSand() : cuts[0].surface === "metal" ? asphalt : makeDirt();
    addShortcutRibbon(cuts, group, cutTex, cuts[0].surface);
  }

  const itemBoxAnchors = def.itemBoxes.map((p) => queryApprox(samples, p).position.clone().add(new THREE.Vector3(0, 0.85, 0)));
  const start = samples[0];
  return {
    def,
    samples,
    length,
    group,
    itemBoxAnchors,
    lampPositions: [],
    startPose: {
      position: start.position.clone(),
      heading: headingFromTangent(start.tangent),
    },
  };
}

function addShortcutRibbon(
  samples: TrackSample[],
  group: THREE.Group,
  tex: THREE.Texture,
  surface: Surface,
): void {
  const n = samples.length;
  if (n < 2) return;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const a = samples[i];
    const hw = a.halfWidth;
    const left = a.position.clone().addScaledVector(a.binormal, -hw);
    const right = a.position.clone().addScaledVector(a.binormal, hw);
    pos.push(left.x, left.y + 0.02, left.z, right.x, right.y + 0.02, right.z);
    nrm.push(0, 1, 0, 0, 1, 0);
    uv.push(0, dist * 0.2, 1, dist * 0.2);
    if (i < n - 1) {
      const i0 = i * 2;
      idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3);
      dist += a.position.distanceTo(samples[i + 1].position);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const color = surface === "sand" ? 0xc9a36a : surface === "metal" ? 0x6a7180 : 0x5a4a38;
  group.add(
    new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.95, metalness: surface === "metal" ? 0.35 : 0 }),
    ),
  );
}

export function nearestMainProgress(samples: TrackSample[], progress: number): TrackSample {
  return queryApprox(samples, progress);
}
