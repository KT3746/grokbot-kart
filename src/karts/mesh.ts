import * as THREE from "three";
import type { KartDef } from "../types";

function paint(color: string, metal = 0.42, rough = 0.36): THREE.MeshStandardMaterial {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: c,
    metalness: metal,
    roughness: rough,
    emissive: c.clone().multiplyScalar(0.14),
    emissiveIntensity: 0.62,
    flatShading: true,
    envMapIntensity: 0.4,
  });
}

function mat(hex: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness: 0.45,
    metalness: 0.28,
    flatShading: true,
    ...opts,
  });
}

function wheel(w: number, r: number): THREE.Group {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, w, 16),
    mat(0x0a0a0c, { roughness: 0.95, metalness: 0.02, flatShading: false }),
  );
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.58, r * 0.58, w * 0.55, 12),
    mat(0xd4dce4, { metalness: 0.88, roughness: 0.22, emissive: 0x202428, emissiveIntensity: 0.25 }),
  );
  rim.rotation.z = Math.PI / 2;
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.22, r * 0.22, w * 0.7, 8),
    mat(0x222830, { metalness: 0.7, roughness: 0.25 }),
  );
  disc.rotation.z = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, r * 0.7, w * 0.1),
      mat(0xa8b0ba, { metalness: 0.85, roughness: 0.2 }),
    );
    s.rotation.z = Math.PI / 2;
    s.rotation.x = (i / 5) * Math.PI;
    g.add(s);
  }
  g.add(tire, rim, disc);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

/**
 * Closed-cockpit race car (GT / stock-car vibe). Wide body, cabin, spoiler.
 * Low-poly flat shading + a cheap blob shadow so the kart reads on mobile
 * (where the renderer does not cast real shadows).
 */
export function createKartMesh(def: KartDef): THREE.Group {
  const root = new THREE.Group();
  root.frustumCulled = false;
  const body = paint(def.paint, 0.46, 0.32);
  const accent = paint(def.accent, 0.38, 0.36);
  const black = mat(0x111418, { roughness: 0.58, metalness: 0.22 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x152028,
    transparent: true,
    opacity: 0.52,
    metalness: 0.78,
    roughness: 0.12,
    emissive: 0x0a1824,
    emissiveIntensity: 0.35,
    envMapIntensity: 0.7,
  });
  const chrome = mat(0xd0d6de, { metalness: 0.9, roughness: 0.2, flatShading: false });

  const wide = def.id === "guardiao";
  const slim = def.id === "vespa";
  const long = def.id === "ziper";
  const W = wide ? 1.55 : slim ? 1.28 : 1.4;
  const L = slim ? 2.35 : long ? 2.55 : 2.45;
  const H = 0.42;

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 14),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.025;
  blob.name = "blobShadow";
  blob.renderOrder = -1;

  const tray = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.06, L * 0.92), black);
  tray.position.y = 0.18;

  const hull = new THREE.Mesh(new THREE.BoxGeometry(W * 0.95, H, L * 0.72), body);
  hull.position.set(0, 0.42, -0.05);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 0.22, 0.7), body);
  hood.position.set(0, 0.4, L * 0.28);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(W * 0.55, 0.16, 0.45), body);
  nose.position.set(0, 0.34, L * 0.42);
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.04, 0.16), black);
  splitter.position.set(0, 0.22, L * 0.48);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.38, 0.7), black);
  cabin.position.set(0, 0.72, -0.05);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(W * 0.56, 0.28, 0.08), glass);
  windshield.position.set(0, 0.78, 0.28);
  windshield.rotation.x = -0.35;
  const sideGlassL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.45), glass);
  sideGlassL.position.set(-W * 0.32, 0.74, -0.02);
  const sideGlassR = sideGlassL.clone();
  sideGlassR.position.x = W * 0.32;
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, 0.22, 0.06), glass);
  rearGlass.position.set(0, 0.76, -0.38);
  rearGlass.rotation.x = 0.25;

  const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.55, 0.06, 0.55), body);
  roof.position.set(0, 0.94, -0.08);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 0.85, 0.16, 0.55), body);
  deck.position.set(0, 0.4, -L * 0.32);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(W * 1.05, 0.05, 0.22), black);
  spoiler.position.set(0, 0.78, -L * 0.38);
  const endL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.24), black);
  endL.position.set(-W * 0.5, 0.78, -L * 0.38);
  const endR = endL.clone();
  endR.position.x = W * 0.5;
  const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.04), chrome);
  strutL.position.set(-0.35, 0.58, -L * 0.36);
  const strutR = strutL.clone();
  strutR.position.x = 0.35;

  for (const [x, z] of [
    [-1, 0.85],
    [1, 0.85],
    [-1, -0.85],
    [1, -0.85],
  ] as const) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.55), body);
    f.position.set(x * W * 0.48, 0.4, z * (L * 0.28));
    root.add(f);
  }

  const skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, L * 0.7), black);
  skirtL.position.set(-W * 0.5, 0.26, 0);
  const skirtR = skirtL.clone();
  skirtR.position.x = W * 0.5;

  root.add(
    blob,
    tray,
    hull,
    hood,
    nose,
    splitter,
    cabin,
    windshield,
    sideGlassL,
    sideGlassR,
    rearGlass,
    roof,
    deck,
    spoiler,
    endL,
    endR,
    strutL,
    strutR,
    skirtL,
    skirtR,
  );

  if (def.id === "cometa") {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, L * 0.85), accent);
    stripe.position.set(0, 0.64, 0.05);
    root.add(stripe);
  } else if (def.id === "vespa") {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, L * 0.7), accent);
    stripe.position.set(0, 0.64, 0.1);
    root.add(stripe);
  } else if (def.id === "guardiao") {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.1, 0.12), accent);
    bar.position.set(0, 0.32, L * 0.45);
    root.add(bar);
  } else {
    const n1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, L * 0.6), accent);
    n1.position.set(0.22, 0.64, 0);
    const n2 = n1.clone();
    n2.position.x = -0.22;
    root.add(n1, n2);
  }

  const hl = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
  const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.06), hl);
  h1.position.set(-0.32, 0.36, L * 0.48);
  const h2 = h1.clone();
  h2.position.x = 0.32;
  const tl = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.06), tl);
  t1.position.set(-0.38, 0.42, -L * 0.42);
  const t2 = t1.clone();
  t2.position.x = 0.38;
  root.add(h1, h2, t1, t2);

  const num = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.02), accent);
  num.position.set(0, 0.55, -L * 0.42);
  root.add(num);

  const rF = 0.34;
  const rR = 0.36;
  const wF = wide ? 0.3 : 0.26;
  const wR = wide ? 0.34 : 0.3;
  const xF = W * 0.48;
  const xR = W * 0.5;
  const zF = L * 0.32;
  const zR = -L * 0.34;
  for (const [x, z, ww, rr] of [
    [-xF, zF, wF, rF],
    [xF, zF, wF, rF],
    [-xR, zR, wR, rR],
    [xR, zR, wR, rR],
  ] as const) {
    const wh = wheel(ww, rr);
    wh.position.set(x, rr, z);
    wh.name = z > 0 ? "wheelF" : "wheelR";
    root.add(wh);
  }

  const helm = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 10, 8),
    mat(0x0c1016, { metalness: 0.5, roughness: 0.2 }),
  );
  helm.position.set(0, 0.78, 0.02);
  root.add(helm);

  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });
  blob.castShadow = false;
  blob.receiveShadow = false;
  return root;
}
