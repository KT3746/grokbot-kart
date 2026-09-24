/**
 * Probe WebGL before constructing the renderer, and show a PT-BR fallback
 * when the GPU path is missing (same idea as ECO / CABANA / FRONTEIRA).
 */

export function probeWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl =
      c.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ||
      c.getContext("webgl", { failIfMajorPerformanceCaveat: false }) ||
      c.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}

const FAIL_COPY =
  "Erro: WebGL indisponível. Atualize o navegador ou ative a aceleração gráfica.";

export function showWebglFail(host?: HTMLElement | null): void {
  const existing = document.getElementById("webgl-fail");
  if (existing) {
    existing.hidden = false;
    existing.removeAttribute("hidden");
    existing.classList.remove("hidden");
    return;
  }
  const panel = document.createElement("div");
  panel.id = "webgl-fail";
  panel.className = "webgl-fail";
  panel.setAttribute("role", "alert");
  panel.innerHTML = `<div class="webgl-fail-panel">
    <p class="eyebrow">KART</p>
    <h1>Sem WebGL</h1>
    <p>${FAIL_COPY}</p>
  </div>`;
  (host ?? document.body).appendChild(panel);
}

/** True when the 3D path can start. False shows the fallback and skips Game. */
export function bootOrFail(canvas: HTMLCanvasElement, ui: HTMLElement): boolean {
  if (probeWebGL()) return true;
  canvas.style.display = "none";
  showWebglFail(ui.parentElement ?? document.body);
  return false;
}
