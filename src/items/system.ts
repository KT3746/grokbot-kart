import * as THREE from "three";
import type { ItemId } from "../types";
import { queryTrack } from "../tracks/builder";
import type { BuiltTrack } from "../tracks/types";
import type { Racer } from "../race/types";

export const ITEM_LABEL: Record<ItemId, string> = {
  puck: "Disco Ímã",
  soap: "Sabão",
  turbo: "Carga Turbo",
  soot: "Fuligem",
  hook: "Gancho",
};

export interface Puck {
  mesh: THREE.Object3D;
  progress: number;
  life: number;
  owner: string;
  spent: boolean;
}

export interface Slick {
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  life: number;
}

export interface SootCloud {
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  life: number;
  owner: string;
}

export class ItemSystem {
  boxes: { mesh: THREE.Object3D; alive: boolean; respawn: number; pos: THREE.Vector3 }[] = [];
  pucks: Puck[] = [];
  slicks: Slick[] = [];
  soots: SootCloud[] = [];
  group = new THREE.Group();
  private clock = 0;

  constructor() {
    this.group.frustumCulled = false;
  }

  setup(track: BuiltTrack): void {
    this.clear();
    const cube = new THREE.BoxGeometry(0.95, 0.95, 0.95);
    const gold = new THREE.MeshBasicMaterial({ color: 0xffd24a });
    const rim = new THREE.MeshBasicMaterial({ color: 0x5a3a08 });
    const main = track.samples.filter((s) => !s.shortcut);
    for (const progress of track.def.itemBoxes) {
      let sample = main[0];
      let best = 1;
      for (const s of main) {
        const d = Math.abs(s.progress - progress);
        const wrap = Math.min(d, 1 - d);
        if (wrap < best) {
          best = wrap;
          sample = s;
        }
      }
      const lanes = [-2.4, 0, 2.4].filter((lane) => Math.abs(lane) < sample.halfWidth - 1.1);
      for (const lane of lanes) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(cube, gold.clone());
        const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.1, 1.02), rim);
        band.position.y = 0.42;
        const band2 = band.clone();
        band2.position.y = -0.42;
        group.add(body, band, band2);
        group.position.copy(sample.position).addScaledVector(sample.binormal, lane);
        group.position.y += 1.2;
        group.frustumCulled = false;
        group.traverse((o) => {
          if (o instanceof THREE.Mesh) o.frustumCulled = false;
        });
        this.group.add(group);
        this.boxes.push({ mesh: group, alive: true, respawn: 0, pos: group.position.clone() });
      }
    }
  }

  clear(): void {
    this.group.clear();
    this.boxes = [];
    this.pucks = [];
    this.slicks = [];
    this.soots = [];
  }

  roll(place: number): ItemId {
    if (place === 1) return Math.random() < 0.55 ? "soap" : "soot";
    if (place === 2) return (["soap", "turbo", "soot", "hook"] as ItemId[])[Math.floor(Math.random() * 4)];
    return (["puck", "turbo", "hook", "puck"] as ItemId[])[Math.floor(Math.random() * 4)];
  }

  use(racer: Racer, racers: Racer[], track: BuiltTrack): void {
    const id = racer.item;
    if (!id) return;
    racer.item = null;
    const kart = racer.kart;
    if (id === "turbo") {
      kart.boostTime = Math.max(kart.boostTime, 2.15);
      return;
    }
    if (id === "hook") {
      kart.magnetTime = 5.0;
      return;
    }
    if (id === "soap") {
      const back = new THREE.Vector3(-Math.sin(kart.heading), 0, -Math.cos(kart.heading));
      const p = kart.position.clone().addScaledVector(back, 2.4);
      p.y = queryTrack(track.samples, p).height + 0.06;
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(1.35, 16),
        new THREE.MeshStandardMaterial({
          color: 0x9ad0c2,
          transparent: true,
          opacity: 0.72,
          roughness: 0.15,
          metalness: 0.4,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(p);
      this.group.add(mesh);
      this.slicks.push({ mesh, position: p, life: 14 });
      return;
    }
    if (id === "soot") {
      const back = new THREE.Vector3(-Math.sin(kart.heading), 0, -Math.cos(kart.heading));
      const p = kart.position.clone().addScaledVector(back, 2.8);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.8, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x222226, transparent: true, opacity: 0.55, roughness: 1 }),
      );
      mesh.position.copy(p).add(new THREE.Vector3(0, 0.8, 0));
      this.group.add(mesh);
      this.soots.push({ mesh, position: p, life: 5.0, owner: racer.id });
      return;
    }
    if (id === "puck") {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.18, 16),
        new THREE.MeshStandardMaterial({
          color: 0x2de2ff,
          emissive: 0x145566,
          metalness: 0.7,
          roughness: 0.2,
        }),
      );
      mesh.position.copy(kart.position).add(new THREE.Vector3(0, 0.5, 0));
      this.group.add(mesh);
      this.pucks.push({
        mesh,
        progress: (kart.progress + 0.012) % 1,
        life: 5.2,
        owner: racer.id,
        spent: false,
      });
    }
    void racers;
  }

  update(dt: number, racers: Racer[], track: BuiltTrack, onHit: (r: Racer, kind: ItemId) => void): void {
    this.clock += dt;
    for (const box of this.boxes) {
      if (!box.alive) {
        box.respawn -= dt;
        if (box.respawn <= 0) {
          box.alive = true;
          box.mesh.visible = true;
          box.mesh.position.copy(box.pos);
        }
        continue;
      }
      box.mesh.rotation.y += dt * 2.2;
      box.mesh.position.y = box.pos.y + Math.sin(this.clock * 3 + box.pos.x) * 0.16;
      box.mesh.visible = true;
      for (const r of racers) {
        if (r.item || r.kart.finished) continue;
        if (r.kart.position.distanceTo(box.mesh.position) < 2.6 + (r.kart.magnetTime > 0 ? 3.5 : 0)) {
          r.item = this.roll(r.place);
          box.alive = false;
          box.respawn = 6.5;
          box.mesh.visible = false;
          onHit(r, "hook");
          break;
        }
      }
    }

    for (const puck of this.pucks) {
      if (puck.spent) continue;
      puck.life -= dt;
      puck.progress = (puck.progress + dt * 0.26) % 1;
      let best = track.samples[0];
      let bestD = 1;
      for (const s of track.samples) {
        if (s.shortcut) continue;
        const d = Math.abs(s.progress - puck.progress);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      let target = best.position.clone().add(new THREE.Vector3(0, 0.55, 0));
      let nearest: Racer | null = null;
      let nd = 8;
      for (const r of racers) {
        if (r.id === puck.owner || r.kart.finished || r.kart.invuln > 0) continue;
        const d = r.kart.position.distanceTo(puck.mesh.position);
        if (d < nd) {
          nd = d;
          nearest = r;
        }
      }
      if (nearest) target.lerp(nearest.kart.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0.35);
      puck.mesh.position.lerp(target, 1 - Math.exp(-10 * dt));
      puck.mesh.rotation.y += dt * 8;
      if (nearest && nd < 1.5) {
        nearest.kart.stunTime = 0.95;
        nearest.kart.speed *= 0.28;
        nearest.kart.shake = 0.45;
        nearest.kart.invuln = 1.4;
        puck.spent = true;
        puck.mesh.visible = false;
        onHit(nearest, "puck");
      }
      if (puck.life <= 0) {
        puck.spent = true;
        puck.mesh.visible = false;
      }
    }

    for (const slick of this.slicks) {
      slick.life -= dt;
      slick.mesh.rotateZ(dt * 0.2);
      if (slick.life <= 0) slick.mesh.visible = false;
      for (const r of racers) {
        if (r.kart.invuln > 0) continue;
        if (r.kart.position.distanceTo(slick.position) < 1.5 && slick.life > 0) {
          const fresh = r.kart.slipTime <= 0.2;
          r.kart.slipTime = Math.max(r.kart.slipTime, 1.55);
          r.kart.shake = Math.max(r.kart.shake, 0.2);
          if (fresh) onHit(r, "soap");
        }
      }
    }

    for (const cloud of this.soots) {
      cloud.life -= dt;
      cloud.mesh.scale.addScalar(dt * 0.35);
      const sootMat = (cloud.mesh as THREE.Mesh).material;
      if (sootMat instanceof THREE.MeshStandardMaterial) {
        sootMat.opacity = Math.max(0, cloud.life * 0.16);
      }
      if (cloud.life <= 0) cloud.mesh.visible = false;
      for (const r of racers) {
        if (r.id === cloud.owner) continue;
        if (r.kart.position.distanceTo(cloud.position) < 2.6 && cloud.life > 0) {
          r.kart.speed *= Math.exp(-1.1 * dt);
          r.kart.smokeTime = Math.max(r.kart.smokeTime, 2.2);
        }
      }
    }

    if (this.pucks.length > 12) this.pucks = this.pucks.filter((p) => !p.spent && p.life > 0);

    for (const r of racers) {
      if (r.kart.magnetTime <= 0) continue;
      let nearest: (typeof this.boxes)[number] | null = null;
      let nd = 26;
      for (const box of this.boxes) {
        if (!box.alive) continue;
        const d = r.kart.position.distanceTo(box.mesh.position);
        if (d < nd) {
          nd = d;
          nearest = box;
        }
      }
      if (!nearest) continue;
      nearest.mesh.position.lerp(r.kart.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 1 - Math.exp(-3.2 * dt));
    }
  }
}

export function syncKartVisual(racer: Racer, dt: number): void {
  const k = racer.kart;
  const m = racer.mesh;
  m.position.copy(k.position);
  m.position.y += 0.02;
  m.rotation.order = "YXZ";
  m.rotation.y = k.heading;
  m.rotation.z = k.roll;
  m.rotation.x = k.airborne ? -0.08 : 0;
  m.traverse((o) => {
    if (o.name.startsWith("wheel")) o.rotation.x -= k.wheelSpin * 0.4 * dt;
  });
}
