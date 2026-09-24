import * as THREE from "three";

function noiseCanvas(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

/** Dark, gritty asphalt — curbs and center dash stay readable on top. */
export function makeAsphalt(hex = "#1c1e24"): THREE.CanvasTexture {
  return noiseCanvas(512, (ctx, size) => {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 38000; i++) {
      const v = 18 + Math.random() * 42;
      ctx.fillStyle = `rgba(${v},${v},${v + 10},${0.18 + Math.random() * 0.28})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1);
    }
    // darker patches so the ribbon isn't a flat slab
    for (let i = 0; i < 48; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(
        Math.random() * size,
        Math.random() * size,
        12 + Math.random() * 28,
        6 + Math.random() * 14,
        Math.random() * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(210, 220, 235, 0.05)";
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * size, Math.random() * size);
      ctx.lineTo(Math.random() * size, Math.random() * size);
      ctx.stroke();
    }
    // crown: slightly brighter center, darker shoulders
    const g = ctx.createLinearGradient(0, 0, size, 0);
    g.addColorStop(0, "rgba(0,0,0,0.38)");
    g.addColorStop(0.14, "rgba(0,0,0,0)");
    g.addColorStop(0.5, "rgba(210,220,235,0.07)");
    g.addColorStop(0.86, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

export function makeNightEnv(): THREE.CubeTexture {
  const faces = ["#243656", "#12182a", "#4a5c82", "#1a140e", "#2a3d68", "#0c1018"];
  const images = faces.map((hex) => {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, 16, 16);
    return c;
  });
  const tex = new THREE.CubeTexture(images);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeSand(): THREE.CanvasTexture {
  return noiseCanvas(256, (ctx, size) => {
    ctx.fillStyle = "#c4a36a";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 14000; i++) {
      const r = 160 + Math.random() * 60;
      const g = 130 + Math.random() * 50;
      const b = 70 + Math.random() * 40;
      ctx.fillStyle = `rgba(${r},${g},${b},0.35)`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  });
}

export function makeDirt(): THREE.CanvasTexture {
  return noiseCanvas(256, (ctx, size) => {
    ctx.fillStyle = "#5a5044";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 11000; i++) {
      ctx.fillStyle = `rgba(${90 + Math.random() * 50},${80 + Math.random() * 40},${40},0.4)`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  });
}

export function makeSkyTexture(top: string, horizon: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.42, top);
  g.addColorStop(0.62, horizon);
  g.addColorStop(0.78, horizon);
  g.addColorStop(0.9, "#141820");
  g.addColorStop(1, "#07080c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/** Cheap ground grain so the circle isn't a flat fill. */
export function makeGround(hex: string): THREE.CanvasTexture {
  return noiseCanvas(128, (ctx, size) => {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.12})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  });
}
