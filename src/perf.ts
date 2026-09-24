import * as THREE from "three";

export type PerfTier = "high" | "low";

const params = (): URLSearchParams => {
  if (typeof location === "undefined") return new URLSearchParams();
  return new URLSearchParams(location.search);
};

export const forcedLowPerf = (): boolean => params().get("perf") === "low";
export const forcedHighPerf = (): boolean => params().get("perf") === "high";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    return false;
  }
}

/**
 * Cheap path: reduced-motion, tiny/coarse screens, or an explicit ?perf=low.
 * Phones still get the prettier low-poly look — this only strips expensive FX.
 */
export function wantsLowFx(): boolean {
  if (forcedHighPerf()) return false;
  if (forcedLowPerf()) return true;
  if (prefersReducedMotion()) return true;
  if (typeof window === "undefined") return false;
  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  return Math.min(w, h) < 360;
}

function isPhoneFrame(): boolean {
  if (typeof window === "undefined") return false;
  return (window.innerWidth < 820 || (window.visualViewport?.width ?? 820) < 820);
}

/**
 * Drop pixel ratio, shadows and extra lights when the box is slow
 * (review VM, software GL) or the player asks with ?perf=low.
 */
export class PerfMonitor {
  tier: PerfTier;
  fps = 60;
  private frames = 0;
  private acc = 0;
  private lowHits = 0;
  private locked: boolean;

  constructor() {
    this.locked = forcedLowPerf() || forcedHighPerf();
    this.tier = forcedLowPerf() || wantsLowFx() ? "low" : "high";
  }

  get low(): boolean {
    return this.tier === "low";
  }

  sample(dt: number): boolean {
    if (!Number.isFinite(dt) || dt <= 0) return false;
    this.acc += dt;
    this.frames += 1;
    if (this.acc < 0.75) return false;
    this.fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (this.locked) return false;
    if (this.fps < 24) this.lowHits += 1;
    else this.lowHits = Math.max(0, this.lowHits - 2);
    if (this.lowHits >= 5 && this.tier !== "low") {
      this.tier = "low";
      return true;
    }
    return false;
  }

  apply(renderer: THREE.WebGLRenderer): void {
    const phone = isPhoneFrame();
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    if (this.low) {
      renderer.setPixelRatio(Math.min(1, dpr));
      renderer.shadowMap.enabled = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 1.05;
      return;
    }
    // Cap ~1–1.5: phones stay near 1.15, desktop 1.5. Antialias is gated at construct.
    renderer.setPixelRatio(Math.min(dpr, phone ? 1.15 : 1.5));
    renderer.shadowMap.enabled = !phone;
    if (renderer.shadowMap.enabled) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = phone ? 1.26 : 1.18;
  }
}

function stripMaterial(m: THREE.Material): void {
  const std = m as THREE.MeshStandardMaterial;
  if ("envMap" in std) std.envMap = null;
  if ("envMapIntensity" in std) std.envMapIntensity = 0;
  if ("metalness" in std && typeof std.metalness === "number") {
    std.metalness = Math.min(std.metalness, 0.06);
  }
  if (m.transparent && m.opacity >= 0.88) {
    m.transparent = false;
    m.opacity = 1;
  }
  m.needsUpdate = true;
}

/** Strip shadows, env maps, extra point lights and shiny metals. */
export function applyLowPerfScene(root: THREE.Object3D): void {
  if ((root as THREE.Scene).isScene) {
    (root as THREE.Scene).environment = null;
  }
  root.traverse((o) => {
    const light = o as THREE.Light;
    if ((light as THREE.DirectionalLight).isDirectionalLight) {
      const dir = light as THREE.DirectionalLight;
      dir.castShadow = false;
      dir.intensity = Math.min(dir.intensity, 1.2);
    }
    if ((light as THREE.PointLight).isPointLight) {
      const pt = light as THREE.PointLight;
      pt.castShadow = false;
      pt.intensity = 0;
      pt.visible = false;
    }
    if ((light as THREE.SpotLight).isSpotLight) {
      const sp = light as THREE.SpotLight;
      sp.castShadow = false;
      sp.intensity = Math.min(sp.intensity, 2.2);
    }
    if (o instanceof THREE.Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) stripMaterial(m);
    }
  });
}
