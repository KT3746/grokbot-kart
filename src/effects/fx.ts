import * as THREE from "three";
import type { KartBody } from "../physics/kart";

export class Effects {
  group = new THREE.Group();
  private smokeGeo = new THREE.SphereGeometry(0.16, 6, 6);
  private sparkGeo = new THREE.SphereGeometry(0.09, 5, 5);
  private smokeMat = new THREE.MeshBasicMaterial({ color: 0xc8c8c8, transparent: true, opacity: 0.35 });
  private boostMat = new THREE.MeshBasicMaterial({ color: 0xffc56a, transparent: true, opacity: 0.55 });
  private boostHotMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.7 });
  private sparkMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 });
  private marks: THREE.Mesh[] = [];
  private puffs: { mesh: THREE.Mesh; life: number; rise: number; grow: number }[] = [];

  spawnDrift(kart: KartBody): void {
    if (!kart.drifting && kart.boostTime <= 0) return;
    const boosting = kart.boostTime > 0;
    if (Math.random() > (boosting ? 0.16 : 0.42)) return;
    const back = new THREE.Vector3(-Math.sin(kart.heading), 0, -Math.cos(kart.heading));
    const side = new THREE.Vector3(Math.cos(kart.heading), 0, -Math.sin(kart.heading));

    const puff = new THREE.Mesh(
      this.smokeGeo,
      boosting ? (Math.random() > 0.45 ? this.boostHotMat : this.boostMat) : this.smokeMat,
    );
    puff.position.copy(kart.position).addScaledVector(back, 0.85 + Math.random() * 0.35);
    puff.position.addScaledVector(side, (Math.random() - 0.5) * (boosting ? 0.9 : 0.35));
    puff.position.y += 0.18 + Math.random() * 0.12;
    if (boosting) puff.scale.setScalar(0.85 + Math.random() * 0.55);
    this.group.add(puff);
    this.puffs.push({ mesh: puff, life: boosting ? 0.55 : 0.45, rise: boosting ? 1.4 : 0.8, grow: boosting ? 2.4 : 1.6 });

    if (boosting && Math.random() > 0.35) {
      const spark = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      spark.position.copy(kart.position).addScaledVector(back, 1.1);
      spark.position.y += 0.25;
      spark.scale.setScalar(0.6 + Math.random() * 0.8);
      this.group.add(spark);
      this.puffs.push({ mesh: spark, life: 0.28, rise: 2.2, grow: 3.2 });
    }

    if (kart.drifting && kart.onAsphalt) {
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(0.22, 0.7),
        new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0.45 }),
      );
      mark.rotation.x = -Math.PI / 2;
      mark.rotation.z = -kart.heading;
      mark.position.copy(kart.position);
      mark.position.y += 0.04;
      this.group.add(mark);
      this.marks.push(mark);
      if (this.marks.length > 80) {
        const old = this.marks.shift();
        if (old) {
          this.group.remove(old);
          old.geometry.dispose();
        }
      }
    }
  }

  /** Burst when hit by an item — quick colorful pop. */
  spawnHit(kart: KartBody): void {
    const colors = [0xff5a2a, 0xffe27a, 0x7ad7ff, 0xff6ad5, 0xffffff];
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: 0.98,
      });
      const spark = new THREE.Mesh(this.sparkGeo, mat);
      const ang = (i / 12) * Math.PI * 2;
      spark.position.copy(kart.position);
      spark.position.x += Math.cos(ang) * 0.55;
      spark.position.z += Math.sin(ang) * 0.55;
      spark.position.y += 0.55;
      spark.scale.setScalar(1.05);
      this.group.add(spark);
      this.puffs.push({ mesh: spark, life: 0.42, rise: 4.2, grow: 4.6 });
    }
  }

  /** Short sparkle when the player fires an item (fun4 juice). */
  spawnUse(kart: KartBody): void {
    const colors = [0xffe27a, 0x7ad7ff, 0x7dff9a];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: 0.95,
      });
      const spark = new THREE.Mesh(this.sparkGeo, mat);
      const ang = (i / 6) * Math.PI * 2;
      spark.position.copy(kart.position);
      spark.position.x += Math.cos(ang) * 0.35;
      spark.position.z += Math.sin(ang) * 0.35;
      spark.position.y += 0.7;
      spark.scale.setScalar(0.75);
      this.group.add(spark);
      this.puffs.push({ mesh: spark, life: 0.28, rise: 2.6, grow: 3.2 });
    }
  }

  update(dt: number): void {
    for (const p of this.puffs) {
      p.life -= dt;
      p.mesh.position.y += dt * p.rise;
      p.mesh.scale.addScalar(dt * p.grow);
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, p.life * 1.4);
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        if (mat !== this.smokeMat && mat !== this.boostMat && mat !== this.boostHotMat && mat !== this.sparkMat) {
          mat.dispose();
        }
      }
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
  }

  spawnLapBurst(kart: KartBody): void {
    const colors = [0xffe27a, 0x7dff9a, 0x7ad7ff, 0xff6ad5];
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: 0.95,
      });
      const spark = new THREE.Mesh(this.sparkGeo, mat);
      const ang = (i / 10) * Math.PI * 2;
      spark.position.copy(kart.position);
      spark.position.x += Math.cos(ang) * 0.55;
      spark.position.z += Math.sin(ang) * 0.55;
      spark.position.y += 0.4;
      this.group.add(spark);
      this.puffs.push({ mesh: spark, life: 0.45, rise: 2.8, grow: 3.5 });
    }
  }

  clear(): void {
    this.group.clear();
    this.marks = [];
    this.puffs = [];
  }
}
