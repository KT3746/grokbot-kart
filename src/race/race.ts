import * as THREE from "three";
import { TOTAL_LAPS, clamp } from "../config";
import { ChaseCamera } from "../camera/chase";
import { Effects } from "../effects/fx";
import { Input } from "../input/input";
import { ItemSystem } from "../items/system";
import { createKartMesh } from "../karts/mesh";
import { AI_NAMES, AI_STYLES, getKart, KARTS } from "../karts/roster";
import { collideKarts, KartBody, stepKart } from "../physics/kart";
import { buildTrack, nearestMainProgress } from "../tracks/builder";
import { getTrackDef } from "../tracks/catalog";
import type { KartId, TrackId } from "../types";
import { applyLowPerfScene } from "../perf";
import { decorateTrack, makeLights, makeRaceEnvironment } from "../world/scenery";
import { rubberBand, thinkAI } from "./ai";
import type { RaceResultRow, Racer } from "./types";

export type RacePhase = "countdown" | "green" | "finished";

export class Race {
  scene = new THREE.Scene();
  trackId: TrackId;
  built;
  world: THREE.Group;
  racers: Racer[] = [];
  items = new ItemSystem();
  fx = new Effects();
  cameraRig = new ChaseCamera();
  phase: RacePhase = "countdown";
  count = 3;
  countAcc = 0;
  elapsed = 0;
  paused = false;
  laps: number;
  player!: Racer;
  lastResults: RaceResultRow[] = [];
  autoDrive = false;
  onCue: (kind: "count" | "go" | "item" | "hit" | "finish" | "boost" | "respawn") => void = () => undefined;
  private headlight: THREE.SpotLight;
  private lampLights: THREE.PointLight[] = [];
  private lowPerf = false;

  constructor(trackId: TrackId, playerKart: KartId, mobile: boolean, laps = TOTAL_LAPS, autoDrive = false) {
    this.trackId = trackId;
    this.laps = laps;
    this.autoDrive = autoDrive;
    const def = getTrackDef(trackId);
    this.built = buildTrack(def);
    this.world = decorateTrack(this.built, mobile);
    this.scene.add(this.world);
    this.scene.add(makeLights(this.built, mobile));
    this.scene.fog = new THREE.FogExp2(def.palette.fog, def.palette.fogDensity);
    this.scene.background = new THREE.Color(def.palette.fog);
    this.scene.environment = mobile ? null : makeRaceEnvironment();
    this.scene.add(this.items.group);
    this.scene.add(this.fx.group);
    this.items.setup(this.built);
    this.spawn(playerKart);

    this.headlight = new THREE.SpotLight(0xfff3d6, mobile ? 4.2 : 6.4, mobile ? 42 : 64, 0.55, 0.32, 1.0);
    this.headlight.castShadow = false;
    this.scene.add(this.headlight);
    this.scene.add(this.headlight.target);
    const lampColor = def.mood === "neon" ? 0xff8ad4 : 0xffc56a;
    const count = mobile ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const pl = new THREE.PointLight(lampColor, 0, 26, 1.7);
      this.scene.add(pl);
      this.lampLights.push(pl);
    }
  }

  private spawn(playerKart: KartId): void {
    // Sit clearly past the seam (progress≈0) so queryTrack doesn't snap to 0.99.
    const startSample = nearestMainProgress(this.built.samples, 0.02);
    const heading = Math.atan2(startSample.tangent.x, startSample.tangent.z);
    const start = {
      position: startSample.position.clone(),
      heading,
      progress: startSample.progress,
    };
    const unused = KARTS.filter((k) => k.id !== playerKart);
    const infos = [
      { id: "you", name: "Você", kartId: playerKart, isPlayer: true, aiStyle: "linha" as const },
      ...AI_NAMES.map((name, i) => ({
        id: `ai-${i}`,
        name,
        kartId: unused[i]?.id ?? KARTS[i].id,
        isPlayer: false,
        aiStyle: AI_STYLES[i],
      })),
    ];
    const right = new THREE.Vector3(Math.cos(start.heading), 0, -Math.sin(start.heading));
    const back = new THREE.Vector3(-Math.sin(start.heading), 0, -Math.cos(start.heading));
    infos.forEach((info, i) => {
      const body = new KartBody();
      const lane = i % 2 === 0 ? -1.4 : 1.4;
      const row = Math.floor(i / 2);
      const pos = start.position
        .clone()
        .addScaledVector(right, lane)
        .addScaledVector(back, row * 3.2 + 1.2);
      pos.y = start.position.y + 0.06;
      body.reset(pos, start.heading);
      body.progress = start.progress;
      body.lastProgress = start.progress;
      const mesh = createKartMesh(getKart(info.kartId));
      mesh.position.copy(pos);
      mesh.rotation.y = start.heading;
      mesh.frustumCulled = false;
      mesh.scale.setScalar(1.12);
      mesh.visible = true;
      this.scene.add(mesh);
      const racer: Racer = {
        ...info,
        kart: body,
        mesh,
        item: null,
        place: i + 1,
        lastLapTime: 0,
        bestLap: Infinity,
        totalTime: 0,
      };
      this.racers.push(racer);
    });
    this.player = this.racers[0];
  }

  attachCamera(camera: THREE.PerspectiveCamera): void {
    this.cameraRig.attach(camera, this.player.kart, this.built);
    this.syncCarLights();
  }

  update(dt: number, input: Input, camera: THREE.PerspectiveCamera): void {
    input.poll();
    if (this.paused) {
      this.cameraRig.update(camera, this.player.kart, dt, true, this.built);
      this.syncCarLights();
      return;
    }

    if (this.phase === "countdown") {
      this.countAcc += dt;
      if (this.countAcc >= 1) {
        this.countAcc = 0;
        this.count -= 1;
        if (this.count <= 0) {
          this.phase = "green";
          this.onCue("go");
        } else this.onCue("count");
      }
      this.holdGrid(dt, camera);
      return;
    }

    if (this.phase === "finished") {
      this.cameraRig.update(camera, this.player.kart, dt, false, this.built);
      this.syncCarLights();
      return;
    }

    this.elapsed += dt;
    const playerDist = this.player.kart.lap + this.player.kart.progress;
    const leaderDist = Math.max(...this.racers.map((r) => r.kart.lap + r.kart.progress));

    for (const r of this.racers) {
      if (r.kart.finished) continue;
      let inp = input.state;
      if (!r.isPlayer || this.autoDrive) {
        let fire = false;
        inp = thinkAI(r, this.racers, this.built, playerDist, () => {
          fire = true;
        });
        if (fire && r.item) {
          this.items.use(r, this.racers, this.built);
          this.onCue("item");
        }
      } else {
        inp = input.poll();
        if (input.consumeItem() && r.item) {
          const wasTurbo = r.item === "turbo";
          this.items.use(r, this.racers, this.built);
          this.onCue(wasTurbo ? "boost" : "item");
        }
      }
      const stats = { ...getKart(r.kartId).stats };
      const band = rubberBand(r, leaderDist, playerDist);
      stats.topSpeed *= band;
      const prevBoost = r.kart.boostTime;
      stepKart(r.kart, inp, stats, this.built, dt);
      if (r.kart.justRespawned) {
        r.kart.justRespawned = false;
        if (r.isPlayer) {
          this.cameraRig.bump();
          this.onCue("respawn");
        }
      }
      if (r.kart.boostTime > prevBoost && r.isPlayer) this.onCue("boost");
      r.totalTime = this.elapsed;
      if (r.kart.lap > 0 && r.kart.checkpoints === 0 && r.lastLapTime === 0) {
        r.lastLapTime = this.elapsed;
      }
    }

    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i];
        const b = this.racers[j];
        collideKarts(a.kart, b.kart, getKart(a.kartId).stats.weight, getKart(b.kartId).stats.weight);
      }
    }

    this.items.update(dt, this.racers, this.built, (r, kind) => {
      if (kind === "puck" || kind === "soap") this.onCue("hit");
      if (kind === "hook" && r.isPlayer) this.onCue("item");
    });

    for (const r of this.racers) {
      const meshMod = r.mesh as THREE.Group & { lastLap?: number };
      if ((meshMod.lastLap ?? 0) < r.kart.lap) {
        const lapTime = this.elapsed - r.lastLapTime;
        if (r.kart.lap > 0) r.bestLap = Math.min(r.bestLap, lapTime || this.elapsed);
        r.lastLapTime = this.elapsed;
        meshMod.lastLap = r.kart.lap;
      }
      if (!r.kart.finished && r.kart.lap >= this.laps) {
        r.kart.finished = true;
        r.kart.finishTime = this.elapsed;
        r.totalTime = this.elapsed;
        r.kart.speed *= 0.4;
      }
    }

    this.rank();
    for (const r of this.racers) {
      r.mesh.visible = true;
      r.mesh.position.copy(r.kart.position);
      r.mesh.rotation.order = "YXZ";
      r.mesh.rotation.y = r.kart.heading;
      r.mesh.rotation.z = r.kart.roll;
      r.mesh.rotation.x = r.kart.airborne ? -0.1 : 0;
      r.mesh.traverse((o) => {
        if (o.name.startsWith("wheel")) (o as THREE.Object3D).rotation.x -= r.kart.speed * dt * 0.45;
      });
    }

    this.fx.spawnDrift(this.player.kart);
    this.fx.update(dt);
    this.cameraRig.update(camera, this.player.kart, dt, false, this.built);
    this.syncCarLights();

    if (this.racers.every((r) => r.kart.finished) || this.player.kart.finished) {
      const allDone = this.racers.every((r) => r.kart.finished);
      const playerDoneAndPack = this.player.kart.finished && this.elapsed > this.player.kart.finishTime + 4.5;
      if (allDone || playerDoneAndPack) {
        this.finishOpen();
      }
    }
  }

  private syncCarLights(): void {
    const k = this.player.kart;
    const back = new THREE.Vector3(-Math.sin(k.heading), 0, -Math.cos(k.heading));
    const fwd = new THREE.Vector3(Math.sin(k.heading), 0, Math.cos(k.heading));
    this.headlight.position.copy(k.position).addScaledVector(back, 0.2).add(new THREE.Vector3(0, 1.15, 0));
    this.headlight.target.position.copy(k.position).addScaledVector(fwd, 18).add(new THREE.Vector3(0, 0.4, 0));
    this.headlight.target.updateMatrixWorld();

    const lamps = this.built.lampPositions;
    if (this.lowPerf || !lamps.length) {
      for (const l of this.lampLights) l.intensity = 0;
      return;
    }
    const ranked = lamps
      .map((p) => ({ p, d: p.distanceToSquared(k.position) }))
      .sort((a, b) => a.d - b.d);
    this.lampLights.forEach((light, i) => {
      const hit = ranked[i];
      if (!hit) {
        light.intensity = 0;
        return;
      }
      light.position.copy(hit.p);
      const dist = Math.sqrt(hit.d);
      light.intensity = dist < 48 ? 28 * (1 - dist / 52) : 0;
    });
  }

  private holdGrid(dt: number, camera: THREE.PerspectiveCamera): void {
    for (const r of this.racers) {
      r.mesh.position.copy(r.kart.position);
      r.mesh.rotation.y = r.kart.heading;
    }
    this.cameraRig.update(camera, this.player.kart, dt, true, this.built);
    this.syncCarLights();
  }

  private rank(): void {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.kart.finished && b.kart.finished) return a.kart.finishTime - b.kart.finishTime;
      if (a.kart.finished) return -1;
      if (b.kart.finished) return 1;
      const da = a.kart.lap + a.kart.progress;
      const db = b.kart.lap + b.kart.progress;
      return db - da;
    });
    sorted.forEach((r, i) => {
      r.place = i + 1;
    });
  }

  private finishOpen(): void {
    if (this.phase === "finished") return;
    for (const r of this.racers) {
      if (!r.kart.finished) {
        r.kart.finished = true;
        r.kart.finishTime = this.elapsed + (4 - r.place) * 0.8;
        r.totalTime = r.kart.finishTime;
      }
    }
    this.rank();
    this.lastResults = [...this.racers]
      .sort((a, b) => a.place - b.place)
      .map((r) => ({
        id: r.id,
        name: r.name,
        kartId: r.kartId,
        isPlayer: r.isPlayer,
        place: r.place,
        totalTime: r.totalTime,
        bestLap: Number.isFinite(r.bestLap) ? r.bestLap : r.totalTime / Math.max(1, this.laps),
      }));
    this.phase = "finished";
    this.onCue("finish");
  }

  minimapPoints(): { x: number; z: number }[] {
    return this.built.samples.filter((s) => !s.shortcut).map((s) => ({ x: s.position.x, z: s.position.z }));
  }

  applyLowPerf(): void {
    this.lowPerf = true;
    this.fx.lowFx = true;
    this.scene.environment = null;
    this.headlight.intensity = Math.min(this.headlight.intensity, 2.4);
    this.headlight.distance = Math.min(this.headlight.distance, 28);
    for (const l of this.lampLights) {
      l.intensity = 0;
      l.visible = false;
    }
    applyLowPerfScene(this.scene);
  }

  dispose(): void {
    this.fx.clear();
    this.items.clear();
    this.scene.environment = null;
    this.scene.background = null;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
      if (o instanceof THREE.Light) {
        const shadow = (o as THREE.DirectionalLight).shadow;
        shadow?.map?.dispose();
      }
    });
    this.scene.clear();
    this.racers.length = 0;
    this.lampLights.length = 0;
  }

  countdownLabel(): string | null {
    if (this.phase !== "countdown") return null;
    return String(this.count);
  }
}

export function speedKmh(speed: number): number {
  return clamp(speed, 0, 80);
}
