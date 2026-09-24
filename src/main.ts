import "./style.css";
import { Game } from "./game/Game";
import { bootOrFail, showWebglFail } from "./webgl";

const canvas = document.getElementById("scene") as HTMLCanvasElement | null;
const ui = document.getElementById("ui");
if (!canvas || !ui) throw new Error("KART: DOM incompleto");

document.body.addEventListener(
  "touchmove",
  (e) => {
    if (!document.body.classList.contains("is-race")) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("#touch, .pad-btn, .stick-wrap, .overlay, .icon-btn")) return;
    e.preventDefault();
  },
  { passive: false },
);

if (!bootOrFail(canvas, ui)) {
  // Fallback HUD already on screen — no renderer, no race loop.
} else {
  try {
    const game = new Game(canvas, ui);
    game.start();
  } catch (err) {
    console.error("KART: WebGL falhou ao iniciar", err);
    canvas.style.display = "none";
    showWebglFail(ui.parentElement ?? document.body);
  }
}
