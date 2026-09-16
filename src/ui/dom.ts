import { TOTAL_LAPS, formatTime } from "../config";
import { KARTS } from "../karts/roster";
import { TRACKS } from "../tracks/catalog";
import { ITEM_LABEL } from "../items/system";
import type { ItemId, KartId, TrackId } from "../types";
import type { RaceResultRow } from "../race/types";
import type { CupRow } from "../race/championship";

export type UiAction =
  | { type: "quick" }
  | { type: "cup" }
  | { type: "credits" }
  | { type: "controls" }
  | { type: "back" }
  | { type: "kart"; id: KartId }
  | { type: "track"; id: TrackId }
  | { type: "go" }
  | { type: "resume" }
  | { type: "quit" }
  | { type: "retry" }
  | { type: "menu" }
  | { type: "next" }
  | { type: "mute" }
  | { type: "pause" };

export class UI {
  root: HTMLElement;
  onAction: (a: UiAction) => void = () => undefined;
  private minimap: CanvasRenderingContext2D | null = null;
  private countdownEl: HTMLElement | null = null;
  private press: { pointerId: number; x: number; y: number; el: HTMLElement } | null = null;
  private lastFire = 0;
  private bannerTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button !== 0) return;
        const t = this.actFromEvent(e);
        if (!t) return;
        this.press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, el: t };
      },
      true,
    );
    this.root.addEventListener(
      "pointerup",
      (e) => {
        const p = this.press;
        this.press = null;
        const t = this.actFromEvent(e) ?? (p && p.pointerId === e.pointerId ? p.el : null);
        if (!t) return;
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 28) return;
        if (!t.isConnected || this.isDisabled(t)) return;
        this.fire(t);
      },
      true,
    );
    this.root.addEventListener("pointercancel", () => {
      this.press = null;
    });
    this.root.addEventListener(
      "click",
      (e) => {
        const t = this.actFromEvent(e);
        if (!t) return;
        this.fire(t);
      },
      true,
    );
  }

  /** Text nodes inside a button are not Elements — closest() used to throw and eat the first tap. */
  private actFromEvent(e: Event): HTMLElement | null {
    const raw = e.target;
    const el = raw instanceof Element ? raw : (raw as Node | null)?.parentElement;
    if (!el) return null;
    const t = el.closest("[data-act]") as HTMLElement | null;
    if (!t || t.closest("[data-pad]") || this.isDisabled(t)) return null;
    return t;
  }

  private isDisabled(el: HTMLElement): boolean {
    return el.hasAttribute("disabled") || (el as HTMLButtonElement).disabled === true;
  }

  private fire(el: HTMLElement): void {
    const act = el.dataset.act;
    if (!act) return;
    const id = el.dataset.id ?? "";
    const now = performance.now();
    // Swallow the leftover `click` after pointerup (even if the DOM under
    // the cursor was replaced by a different button). Keep the window short
    // so a real second press is not ignored.
    if (now - this.lastFire < 140) return;
    this.lastFire = now;
    if (act === "kart") this.onAction({ type: "kart", id: id as KartId });
    else if (act === "track") this.onAction({ type: "track", id: id as TrackId });
    else this.onAction({ type: act } as UiAction);
  }

  highlight(kind: "kart" | "track", id: string): void {
    this.root.querySelectorAll(`[data-act="${kind}"]`).forEach((node) => {
      node.classList.toggle("selected", (node as HTMLElement).dataset.id === id);
    });
  }

  private set(html: string): void {
    this.root.innerHTML = html;
    this.minimap = null;
    this.countdownEl = null;
  }

  title(muted: boolean): void {
    this.set(`
      <section class="screen">
        <div class="screen-body">
          <div class="topbar">
            <div class="brand">
              <div class="eyebrow">Corrida de kart original</div>
              <h1>KART</h1>
              <p class="lede">Terceira pessoa, asfalto com peso, itens que mudam a prova. Sem mascote emprestado — só o grid e a noite.</p>
            </div>
            <button type="button" class="icon-btn mute-btn" data-act="mute" aria-label="${muted ? "Ativar som" : "Mudo"}">${muted ? "Mudo" : "Som"}</button>
          </div>
        </div>
        <div class="screen-foot col">
          <button type="button" class="btn primary" data-act="quick">Corrida rápida</button>
          <button type="button" class="btn" data-act="cup">Campeonato curto</button>
          <div class="row">
            <button type="button" class="btn ghost" data-act="controls">Controles</button>
            <button type="button" class="btn ghost" data-act="credits">Créditos</button>
          </div>
        </div>
      </section>`);
  }

  controls(_back = "back"): void {
    this.set(`
      <section class="screen solid">
        <div class="screen-body">
          <div class="eyebrow">Como dirigir</div>
          <h2>Controles</h2>
          <div class="sheet">
            <p><b>No celular:</b> à esquerda o direcional. À direita: <b>Acelera</b>, <b>Derrapa</b> e <b>Item</b>. Segure Acelera pra andar; solte pra ir freando sozinho. Segure Derrapa nas curvas pra carregar turbo.</p>
            <p><b>No teclado:</b> W ou ↑ acelera · A D dirige · Shift (ou Espaço) derrapa · E usa o item · Esc pausa.</p>
            <p>Caixas douradas no asfalto enchem o slot de item. Use na hora certa.</p>
            <p><b>Disco Ímã</b> segue a fita da pista e busca quem está à frente. <b>Sabão</b> deixa uma poça escorregadia atrás. <b>Carga Turbo</b> empurra. <b>Fuligem</b> cega e atrasa quem vem atrás. <b>Gancho</b> puxa a próxima caixa dourada.</p>
          </div>
        </div>
        <div class="screen-foot">
          <button type="button" class="btn primary" data-act="${_back}">Voltar</button>
        </div>
      </section>`);
  }

  credits(): void {
    this.set(`
      <section class="screen solid">
        <div class="screen-body">
          <div class="eyebrow">Ficha técnica</div>
          <h2>Créditos</h2>
          <div class="sheet">
            <p><b>KART</b> é um jogo original de corrida no navegador. Inspirado no gênero — câmera de perseguição, caixas, caos justo — com nomes, silhuetas e itens próprios.</p>
            <p>Three.js · WebGL · áudio procedural. Feito para desktop e Safari no iPhone.</p>
            <p>MIT · KT3746</p>
          </div>
        </div>
        <div class="screen-foot">
          <button type="button" class="btn primary" data-act="back">Voltar</button>
        </div>
      </section>`);
  }

  karts(selected: KartId, cup: boolean): void {
    const cards = KARTS.map((k) => {
      const sel = k.id === selected ? " selected" : "";
      const bar = (n: number) => `<span class="bar"><i style="width:${Math.round(n * 100)}%"></i></span>`;
      return `<button type="button" class="card${sel}" data-act="kart" data-id="${k.id}">
        <div class="name">${k.name}</div>
        <div class="tag">${k.role}</div>
        <p>${k.blurb}</p>
        <div class="stat">Acelera ${bar(k.stats.accel)}</div>
        <div class="stat">Vel. máx ${bar(k.stats.topSpeed)}</div>
        <div class="stat">Direção ${bar(k.stats.handling)}</div>
        <div class="stat">Drift ${bar(k.stats.drift)}</div>
      </button>`;
    }).join("");
    this.set(`
      <section class="screen garage">
        <div class="garage-stage" aria-hidden="true"></div>
        <div class="screen-body garage-body">
          <div class="eyebrow">${cup ? "Campeonato curto" : "Corrida rápida"}</div>
          <h2>Escolha o kart</h2>
          <div class="grid kart-grid">${cards}</div>
        </div>
        <div class="screen-foot">
          <button type="button" class="btn ghost" data-act="back">Voltar</button>
          <button type="button" class="btn primary" data-act="go">${cup ? "Ver pistas" : "Escolher pista"}</button>
        </div>
      </section>`);
  }

  tracks(selected: TrackId, cup: boolean): void {
    const cards = TRACKS.map((t) => {
      const sel = t.id === selected ? " selected" : "";
      return `<button type="button" class="card${sel}" data-act="track" data-id="${t.id}" ${cup ? "disabled" : ""}>
        <div class="name">${t.name}</div>
        <div class="tag">${t.tagline}</div>
        <p>${t.blurb}</p>
      </button>`;
    }).join("");
    this.set(`
      <section class="screen solid">
        <div class="screen-body">
          <div class="eyebrow">${cup ? "Três provas · 10 / 7 / 5 / 3 pts" : `Uma prova · ${TOTAL_LAPS} voltas`}</div>
          <h2>${cup ? "Ordem do campeonato" : "Escolha a pista"}</h2>
          <div class="grid">${cards}</div>
        </div>
        <div class="screen-foot">
          <button type="button" class="btn ghost" data-act="back">Voltar</button>
          <button type="button" class="btn primary" data-act="go">Correr</button>
        </div>
      </section>`);
  }

  stripRaceChrome(): void {
    this.root.querySelectorAll(".hud, .touch, .countdown, .banner, .soot-veil, .pause-btn").forEach((n) => n.remove());
    this.minimap = null;
    this.countdownEl = null;
  }

  raceHud(_touch = true): void {
    this.set(`
      <div class="hud">
        <div class="hud-tl">
          <div class="pos"><span id="hud-pos">P–</span><small id="hud-name">—</small></div>
        </div>
        <div class="hud-tr">
          <div class="hud-tr-row">
            <div class="lap-box"><div class="kicker">Volta</div><div class="num" id="hud-lap">1/3</div></div>
            <button type="button" class="icon-btn pause-btn" data-act="pause" aria-label="Pausa">II</button>
          </div>
          <div class="hud-map">
            <canvas id="minimap" width="264" height="264"></canvas>
          </div>
        </div>
        <div class="hud-bot">
          <div class="speed-box" id="hud-speed"><div class="kicker">km/h</div><div class="num" id="hud-spd">0</div></div>
          <div class="item-slot" id="hud-item">VAZIO</div>
        </div>
      </div>
      <div class="steer-dbg hidden" id="steer-dbg"></div>
      <div class="countdown hidden" id="countdown">3</div>
      <div class="banner hidden" id="banner"></div>
      <div class="speedlines hidden" id="speedlines" aria-hidden="true"></div>
      <div class="soot-veil hidden" id="soot-veil"></div>
      <div class="touch" id="touch">
        <div class="zone stick-wrap stick-invisible" aria-label="Direção"><div class="stick-base"></div><div class="stick-knob"></div></div>
        <div class="zone pad-right pad-row">
          <button type="button" class="pad-btn item" data-pad="item">Item</button>
          <button type="button" class="pad-btn drift" data-pad="drift">Derrapa</button>
          <button type="button" class="pad-btn accel" data-pad="throttle">Acelera</button>
        </div>
      </div>
    `);
    const c = this.root.querySelector("#minimap") as HTMLCanvasElement | null;
    this.minimap = c?.getContext("2d") ?? null;
    this.countdownEl = this.root.querySelector("#countdown");
  }

  updateHud(data: {
    place: number;
    lap: number;
    laps: number;
    speed: number;
    item: ItemId | null;
    trackName: string;
    smoke?: boolean;
    boost?: boolean;
  }): void {
    const pos = this.root.querySelector("#hud-pos");
    const name = this.root.querySelector("#hud-name");
    const lap = this.root.querySelector("#hud-lap");
    const spd = this.root.querySelector("#hud-spd");
    const item = this.root.querySelector("#hud-item");
    const speedBox = this.root.querySelector("#hud-speed");
    const lines = this.root.querySelector("#speedlines");
    if (pos) pos.textContent = `P${data.place}`;
    if (name) name.textContent = data.trackName;
    if (lap) lap.textContent = `${Math.min(data.laps, data.lap + 1)}/${data.laps}`;
    if (spd) spd.textContent = String(Math.max(0, Math.round(data.speed * 4.6)));
    if (item) {
      const label = data.item ? ITEM_LABEL[data.item] : "VAZIO";
      const was = item.textContent;
      item.textContent = label;
      item.classList.toggle("armed", !!data.item);
      if (data.item && label !== was) {
        item.classList.remove("flash");
        void (item as HTMLElement).offsetWidth;
        item.classList.add("flash");
        window.setTimeout(() => item.classList.remove("flash"), 520);
      }
    }
    this.root.querySelector("#soot-veil")?.classList.toggle("hidden", !data.smoke);
    const boosting = !!data.boost;
    speedBox?.classList.toggle("boosting", boosting);
    lines?.classList.toggle("hidden", !boosting);
    document.body.classList.toggle("is-boost", boosting);
  }

  setSteerDebug(text: string | null): void {
    const el = this.root.querySelector("#steer-dbg");
    if (!el) return;
    if (!text) el.classList.add("hidden");
    else {
      el.classList.remove("hidden");
      el.textContent = text;
    }
  }

  drawMinimap(
    pts: { x: number; z: number }[],
    racers: { x: number; z: number; you: boolean }[],
  ): void {
    const ctx = this.minimap;
    if (!ctx) return;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(7,8,12,0.35)";
    ctx.fillRect(0, 0, w, h);
    const finitePts = pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
    if (!finitePts.length) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of finitePts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return;
    const pad = 24;
    const sx = (w - pad * 2) / Math.max(1, maxX - minX);
    const sz = (h - pad * 2) / Math.max(1, maxZ - minZ);
    const s = Math.min(sx, sz);
    if (!Number.isFinite(s) || s <= 0) return;
    const map = (x: number, z: number) => ({
      x: pad + (x - minX) * s,
      y: pad + (z - minZ) * s,
    });
    ctx.strokeStyle = "rgba(232,237,242,0.55)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    finitePts.forEach((p, i) => {
      const m = map(p.x, p.z);
      if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
      if (i === 0) ctx.moveTo(m.x, m.y);
      else ctx.lineTo(m.x, m.y);
    });
    ctx.closePath();
    ctx.stroke();
    for (const r of racers) {
      if (!Number.isFinite(r.x) || !Number.isFinite(r.z)) continue;
      const m = map(r.x, r.z);
      if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
      ctx.fillStyle = r.you ? "#d4a017" : "#e8edf2";
      ctx.beginPath();
      ctx.arc(m.x, m.y, r.you ? 7 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  setCountdown(text: string | null): void {
    if (!this.countdownEl) this.countdownEl = this.root.querySelector("#countdown");
    if (!this.countdownEl) return;
    if (!text) {
      this.countdownEl.classList.add("hidden");
      this.countdownEl.classList.remove("go", "pop");
    } else {
      this.countdownEl.classList.remove("hidden");
      const go = /vai/i.test(text);
      this.countdownEl.classList.toggle("go", go);
      this.countdownEl.textContent = text;
      // Retrigger CSS pop every tick change.
      this.countdownEl.classList.remove("pop");
      void this.countdownEl.offsetWidth;
      this.countdownEl.classList.add("pop");
    }
  }

  banner(text: string | null, ms = 0): void {
    const el = this.root.querySelector("#banner");
    if (!el) return;
    window.clearTimeout(this.bannerTimer);
    if (!text) {
      el.classList.add("hidden");
      el.classList.remove("pop");
    } else {
      el.classList.remove("hidden");
      el.textContent = text;
      el.classList.remove("pop");
      void (el as HTMLElement).offsetWidth;
      el.classList.add("pop");
      if (ms > 0) {
        this.bannerTimer = window.setTimeout(() => {
          el.classList.add("hidden");
          el.classList.remove("pop");
        }, ms);
      }
    }
  }

  pause(muted: boolean): void {
    const existing = this.root.querySelector(".overlay");
    existing?.remove();
    const wrap = document.createElement("div");
    wrap.className = "overlay";
    wrap.innerHTML = `
      <div class="panel">
        <div class="eyebrow">Prova interrompida</div>
        <h2>Pausa</h2>
        <div class="sheet" style="margin-top:10px">
          <p><b>Celular:</b> esquerda = direção. Direita = Acelera, Derrapa e Item.</p>
          <p><b>Teclado:</b> W acelera · A D dirige · Shift derrapa · E item.</p>
        </div>
        <div class="stack">
          <button type="button" class="btn primary" data-act="resume">Continuar</button>
          <button type="button" class="btn" data-act="mute">${muted ? "Ativar som" : "Mudo"}</button>
          <button type="button" class="btn danger" data-act="quit">Abandonar</button>
        </div>
      </div>`;
    this.root.appendChild(wrap);
  }

  hidePause(): void {
    this.root.querySelector(".overlay")?.remove();
  }

  results(rows: RaceResultRow[], cup: boolean, more: boolean): void {
    const body = rows
      .map(
        (r) => `<tr class="${r.isPlayer ? "you" : ""}">
        <td>P${r.place}</td><td>${r.name}${r.isPlayer ? " (você)" : ""}</td>
        <td>${formatTime(r.totalTime)}</td><td>${formatTime(r.bestLap)}</td>
      </tr>`,
      )
      .join("");
    this.set(`
      <section class="screen solid">
        <div class="screen-body">
          <div class="eyebrow">Chegada</div>
          <h2>${rows.find((r) => r.isPlayer)?.place === 1 ? "Bandeirada sua" : "Fim da prova"}</h2>
          <table class="table">
            <thead><tr><th>Pos</th><th>Piloto</th><th>Tempo</th><th>Melhor volta</th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <div class="screen-foot">
          ${cup && more ? `<button type="button" class="btn primary" data-act="next">Próxima prova</button>` : ""}
          ${cup && !more ? `<button type="button" class="btn primary" data-act="next">Classificação</button>` : ""}
          ${!cup ? `<button type="button" class="btn primary" data-act="retry">Correr de novo</button>` : ""}
          <button type="button" class="btn" data-act="menu">Menu</button>
        </div>
      </section>`);
  }

  standings(rows: CupRow[]): void {
    const body = rows
      .map(
        (r, i) => `<tr class="${r.isPlayer ? "you" : ""}">
        <td>${i + 1}º</td><td>${r.name}${r.isPlayer ? " (você)" : ""}</td>
        <td>${r.points}</td><td>${r.wins}</td>
      </tr>`,
      )
      .join("");
    const you = rows.findIndex((r) => r.isPlayer) + 1;
    this.set(`
      <section class="screen solid">
        <div class="screen-body">
          <div class="eyebrow">Campeonato curto</div>
          <h2>${you === 1 ? "Troféu" : "Classificação final"}</h2>
          <table class="table">
            <thead><tr><th>Pos</th><th>Piloto</th><th>Pts</th><th>Vitórias</th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <div class="screen-foot">
          <button type="button" class="btn primary" data-act="menu">Menu</button>
        </div>
      </section>`);
  }
}
