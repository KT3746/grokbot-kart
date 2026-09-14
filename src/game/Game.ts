import * as THREE from "three";
import { AudioEngine } from "../audio/engine";
import { forceRacePadsVisible, isMobileViewport, isPhoneViewport, viewSize, wantsTouchControls } from "../config";
import { RACE_FAR, RACE_NEAR } from "../camera/chase";
import { Input } from "../input/input";
import { applyLowPerfScene, forcedLowPerf, PerfMonitor } from "../perf";
import { Championship } from "../race/championship";
import { Race } from "../race/race";
import type { GameMode, KartId, TrackId } from "../types";
import { UI } from "../ui/dom";
import { createKartMesh } from "../karts/mesh";
import { getKart } from "../karts/roster";

const MENU_CLEAR = 0x0b1018;
const RACE_CLEAR = 0x152038;

type View = "title" | "karts" | "tracks" | "race" | "results" | "standings" | "controls" | "credits";

export class Game {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  ui: UI;
  input = new Input();
  audio = new AudioEngine();
  view: View = "title";
  mode: GameMode = "quick";
  kartId: KartId = "cometa";
  trackId: TrackId = "orla";
  race: Race | null = null;
  private lastHudLap = -1;
  private lastPlace = 0;
  cup = new Championship();
  muted = false;
  private menuScene = new THREE.Scene();
  private menuKart: THREE.Group | null = null;
  private clock = new THREE.Clock();
  private lastTickMs = 0;
  private rafPulse = false;
  private ticking = false;
  private perf = new PerfMonitor();
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    const { w, h } = viewSize();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isPhoneViewport() && !this.perf.low,
      powerPreference: "high-performance",
      alpha: false,
      logarithmicDepthBuffer: false,
    });
    this.renderer.autoClear = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.perf.apply(this.renderer);
    this.fitRenderer(w, h);
    this.renderer.setClearColor(MENU_CLEAR, 1);
    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.55, 720);
    this.ui = new UI(uiRoot);
    this.audio.setMuted(this.muted);
    this.ui.onAction = (a) => this.handle(a);
    this.input.bind(document.body);
    this.setupMenuScene();
    this.showTitle();

    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.perf.apply(this.renderer);
      this.renderer.setClearColor(this.view === "race" ? RACE_CLEAR : MENU_CLEAR, 1);
      this.renderer.autoClear = true;
      this.resize();
    });

    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => {
      this.resize();
      // iOS/Android report the old size for a beat — second pass fixes stretch.
      window.setTimeout(() => this.resize(), 120);
      window.setTimeout(() => this.resize(), 320);
    });
    window.visualViewport?.addEventListener("resize", () => this.resize());
    // Blur / visibility must NOT pause or abandon. Only Esc and the pause button.
    const unlock = () => {
      void this.audio.unlock();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    if (forcedLowPerf()) this.enterLowPerf();
    (window as unknown as { pista: Game }).pista = this;
  }

  start(): void {
    this.clock.start();
    this.lastTickMs = performance.now();
    const sim = () => {
      if (this.ticking) return;
      this.ticking = true;
      try {
        const now = performance.now();
        let dt = (now - this.lastTickMs) / 1000;
        if (dt < 0.008) return;
        this.lastTickMs = now;
        dt = Math.min(0.12, dt);
        this.tick(dt);
      } catch (err) {
        console.error("KART: falha no frame", err);
      } finally {
        this.ticking = false;
      }
    };
    const loop = () => {
      this.rafPulse = true;
      requestAnimationFrame(loop);
      sim();
    };
    loop();
    // If WebGL/rAF stalls (software GL, low-power Safari), keep the race clock alive.
    window.setInterval(() => {
      if (this.rafPulse) {
        this.rafPulse = false;
        return;
      }
      sim();
    }, 50);
  }

  private setupMenuScene(): void {
    this.menuScene.background = new THREE.Color(MENU_CLEAR);
    this.menuScene.fog = new THREE.FogExp2(0x0c1220, 0.008);
    this.menuScene.add(new THREE.HemisphereLight(0x6a7c9a, 0x3a2e20, 1.45));
    const dir = new THREE.DirectionalLight(0xf2f6fc, 1.6);
    dir.position.set(-6, 12, 10);
    this.menuScene.add(dir);
    const fill = new THREE.DirectionalLight(0xffc56a, 0.7);
    fill.position.set(8, 4, -6);
    this.menuScene.add(fill);
    const key = new THREE.PointLight(0xffe8b0, 18, 16, 1.6);
    key.position.set(1.4, 2.4, 2.2);
    this.menuScene.add(key);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(18, 36),
      new THREE.MeshStandardMaterial({ color: 0x242830, roughness: 0.7, metalness: 0.12 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.menuScene.add(floor);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.08, 22),
      new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7 }),
    );
    strip.position.y = 0.04;
    this.menuScene.add(strip);
    this.swapMenuKart(this.kartId);
    this.camera.position.set(4.2, 2.4, 5.6);
    this.camera.lookAt(0, 0.6, 0);
  }

  private swapMenuKart(id: KartId): void {
    if (this.menuKart) this.menuScene.remove(this.menuKart);
    this.menuKart = createKartMesh(getKart(id));
    this.menuScene.add(this.menuKart);
  }

  private fitRenderer(w: number, h: number): void {
    this.renderer.setSize(w, h, true);
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
  }

  private fullFrame(clear: number): void {
    const { w, h } = viewSize();
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setClearColor(clear, 1);
    this.renderer.autoClear = true;
    this.renderer.clear();
  }

  private enterLowPerf(): void {
    this.perf.tier = "low";
    this.perf.apply(this.renderer);
    applyLowPerfScene(this.menuScene);
    this.race?.applyLowPerf();
    const { w, h } = viewSize();
    this.fitRenderer(w, h);
  }

  private resize(): void {
    const { w, h } = viewSize();
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.fitRenderer(w, h);
    this.syncChrome();
  }

  private showTitle(): void {
    this.view = "title";
    this.ui.title(this.muted);
    this.syncChrome();
  }

  private syncChrome(): void {
    const racing = this.view === "race";
    const touch = racing && (isPhoneViewport() || wantsTouchControls());
    document.body.classList.toggle("is-race", racing);
    document.body.classList.toggle("touch-on", touch);
    document.body.classList.toggle("is-garage", this.view === "karts");
    document.body.dataset.view = this.view;
    this.input.setRaceLock(racing);
    if (!racing) {
      this.input.releaseTouch();
      this.ui.stripRaceChrome();
    } else {
      this.input.refreshTouchFlag();
      this.ensureTouchLayer();
    }
  }

  private ensureTouchLayer(): void {
    const touch = document.getElementById("touch");
    if (!touch) return;
    // Wide desktop: never bind pads — leftover stick used to steal Arrow keys
    // and CSS used to force #touch visible even without touch-on.
    if (!wantsTouchControls()) {
      this.input.releaseTouch();
      touch.style.removeProperty("display");
      touch.style.removeProperty("visibility");
      touch.style.removeProperty("opacity");
      return;
    }
    forceRacePadsVisible(touch);
    this.input.bindTouch(touch);
  }

  private handle(a: { type: string; id?: string }): void {
    void this.audio.unlock();
    switch (a.type) {
      case "quick":
        this.mode = "quick";
        this.view = "karts";
        this.ui.karts(this.kartId, false);
        this.syncChrome();
        break;
      case "cup":
        this.mode = "cup";
        this.view = "karts";
        this.ui.karts(this.kartId, true);
        this.syncChrome();
        break;
      case "credits":
        this.view = "credits";
        this.ui.credits();
        this.syncChrome();
        break;
      case "controls":
        this.view = "controls";
        this.ui.controls();
        this.syncChrome();
        break;
      case "back":
        if (this.view === "credits" || this.view === "controls") {
          this.showTitle();
        } else if (this.view === "tracks") {
          this.view = "karts";
          this.ui.karts(this.kartId, this.mode === "cup");
          this.syncChrome();
        } else {
          this.showTitle();
        }
        break;
      case "kart":
        if (a.id) {
          this.kartId = a.id as KartId;
          this.swapMenuKart(this.kartId);
          this.ui.highlight("kart", a.id);
        }
        break;
      case "track":
        if (a.id) {
          this.trackId = a.id as TrackId;
          this.ui.highlight("track", a.id);
        }
        break;
      case "go":
        if (this.view === "karts") {
          this.view = "tracks";
          if (this.mode === "cup") {
            this.trackId = "orla";
            this.cup.start(this.previewField());
          }
          this.ui.tracks(this.trackId, this.mode === "cup");
          this.syncChrome();
        } else {
          this.bootRace();
        }
        break;
      case "resume":
        this.resumeRace();
        break;
      case "pause":
        this.togglePause();
        break;
      case "quit":
        this.leaveRace();
        break;
      case "retry":
        this.bootRace();
        break;
      case "menu":
        this.leaveRace();
        break;
      case "next":
        if (this.mode === "cup" && this.race) {
          this.cup.apply(this.race.lastResults);
          this.race.dispose();
          this.race = null;
          if (this.cup.done) {
            this.fullFrame(MENU_CLEAR);
            this.view = "standings";
            this.ui.standings(this.cup.table);
            this.syncChrome();
          } else {
            this.trackId = this.cup.currentTrack;
            this.bootRace();
          }
        }
        break;
      case "mute":
        this.muted = this.audio.toggleMute();
        if (this.view === "title") this.ui.title(this.muted);
        if (this.view === "race" && this.race?.paused) this.ui.pause(this.muted);
        break;
      default:
        break;
    }
  }

  private previewField() {
    const unused = ["vespa", "cometa", "guardiao", "ziper"].filter((id) => id !== this.kartId) as KartId[];
    return [
      { id: "you", name: "Você", kartId: this.kartId, isPlayer: true },
      { id: "ai-0", name: "Áurea Volt", kartId: unused[0], isPlayer: false },
      { id: "ai-1", name: "Davi Rampa", kartId: unused[1], isPlayer: false },
      { id: "ai-2", name: "Kim Óleo", kartId: unused[2], isPlayer: false },
    ];
  }

  private bootRace(): void {
    const { w, h } = viewSize();
    this.fullFrame(RACE_CLEAR);
    this.camera.clearViewOffset();
    this.camera.near = RACE_NEAR;
    this.camera.far = RACE_FAR;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.race?.dispose();
    this.race = null;
    const params = new URLSearchParams(location.search);
    const lapsRaw = Number(params.get("laps"));
    const laps = Number.isFinite(lapsRaw) && lapsRaw > 0 && lapsRaw < 8 ? lapsRaw : undefined;
    const autoDrive = params.get("auto") === "1";
    this.lastHudLap = -1;
    this.lastPlace = 0;
    this.race = new Race(this.trackId, this.kartId, isMobileViewport() || this.perf.low, laps, autoDrive);
    this.race.attachCamera(this.camera);
    this.race.onCue = (kind) => {
      if (kind === "count") this.audio.countdown(this.race?.count ?? 0);
      if (kind === "go") {
        this.audio.countdown(0);
        this.ui.setCountdown("VAI!");
        this.ui.banner("LARGADA!", 700);
        setTimeout(() => this.ui.setCountdown(null), 780);
      }
      if (kind === "item") this.audio.item();
      if (kind === "hit") {
        this.audio.hit();
        this.race?.fx.spawnHit(this.race.player.kart);
        if (navigator.vibrate) navigator.vibrate([18, 30, 18]);
      }
      if (kind === "boost") {
        this.audio.whoosh();
        this.ui.banner("TURBO!", 520);
        if (navigator.vibrate) navigator.vibrate(12);
      }
      if (kind === "respawn") this.ui.banner("DE VOLTA À PISTA", 900);
      if (kind === "finish") {
        this.audio.finish();
        this.ui.banner("BANDEIRADA");
        setTimeout(() => {
          if (this.race && this.view === "race") {
            this.view = "results";
            this.ui.results(this.race.lastResults, this.mode === "cup", this.mode === "cup" && !this.wouldEndCup());
            this.audio.silence();
            this.syncChrome();
          }
        }, 1600);
      }
    };
    this.view = "race";
    this.ui.raceHud(true);
    this.syncChrome();
    this.audio.countdown(3);
    if (this.perf.low) this.race.applyLowPerf();
  }

  private wouldEndCup(): boolean {
    return this.mode === "cup" && this.cup.index >= 2;
  }

  private pauseRace(): void {
    if (!this.race || this.race.phase === "finished") return;
    this.race.paused = true;
    this.audio.pauseHum(true);
    this.ui.pause(this.muted);
  }

  private resumeRace(): void {
    if (!this.race) return;
    this.race.paused = false;
    this.audio.pauseHum(false);
    this.ui.hidePause();
  }

  private togglePause(): void {
    if (!this.race || this.view !== "race") return;
    if (this.race.paused) this.resumeRace();
    else this.pauseRace();
  }

  private leaveRace(): void {
    this.race?.dispose();
    this.race = null;
    this.audio.silence();
    this.input.setRaceLock(false);
    this.input.releaseTouch();
    this.camera.clearViewOffset();
    this.camera.position.set(4.2, 2.4, 5.6);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0.6, 0);
    this.camera.fov = 52;
    this.camera.near = 0.55;
    this.camera.far = 80;
    const { w, h } = viewSize();
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.fullFrame(MENU_CLEAR);
    this.view = "title";
    this.ui.title(this.muted);
    this.syncChrome();
  }

  private tick(dt: number): void {
    if (this.perf.sample(dt)) this.enterLowPerf();

    if (this.view === "race" && this.race) {
      this.ensureTouchLayer();
      if (this.input.consumePause()) this.togglePause();
      this.race.update(dt, this.input, this.camera);
      const p = this.race.player;
      this.ui.updateHud({
        place: p.place,
        lap: p.kart.lap,
        laps: this.race.laps,
        speed: p.kart.speed,
        item: p.item,
        trackName: this.race.built.def.name,
        smoke: p.kart.smokeTime > 0,
        boost: p.kart.boostTime > 0,
      });
      if (p.kart.lap > this.lastHudLap) {
        if (this.lastHudLap >= 0 && p.kart.lap < this.race.laps) {
          this.audio.lap();
          this.ui.banner(`VOLTA ${p.kart.lap + 1}/${this.race.laps}`, 900);
          this.race.fx.spawnLapBurst(p.kart);
        }
        this.lastHudLap = p.kart.lap;
      }
      if (this.lastPlace && p.place < this.lastPlace) {
        this.ui.banner(p.place === 1 ? "LIDERANÇA!" : `SOBE PRA P${p.place}!`, 700);
        this.audio.blip(520, 0.1, "triangle");
      }
      this.lastPlace = p.place;
      this.ui.drawMinimap(
        this.race.minimapPoints(),
        this.race.racers.map((r) => ({
          x: r.kart.position.x,
          z: r.kart.position.z,
          you: r.isPlayer,
        })),
      );
      const cd = this.race.countdownLabel();
      if (cd) this.ui.setCountdown(cd);
      if (new URLSearchParams(location.search).get("steer") === "1") {
        this.ui.setSteerDebug(this.input.debugLine());
      }
      if (this.race.paused) {
        this.audio.pauseHum(true);
        this.audio.drift(0);
      } else {
        const rpm = Math.min(1, Math.abs(p.kart.speed) / 28);
        this.audio.engine(rpm, this.input.state.throttle, p.kart.boostTime > 0);
        this.audio.drift(p.kart.drifting ? 0.7 + p.kart.driftCharge * 0.3 : 0);
      }
      const { w, h } = viewSize();
      if (!Number.isFinite(this.camera.position.x)) {
        this.race.attachCamera(this.camera);
      }
      this.renderer.setClearColor(RACE_CLEAR, 1);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.renderer.autoClear = true;
      this.renderer.render(this.race.scene, this.camera);
      return;
    }

    if (this.menuKart) this.menuKart.rotation.y += dt * 0.45;
    const { w, h } = viewSize();
    if (this.view === "karts") {
      const previewH = Math.max(220, Math.floor(h * 0.48));
      this.camera.clearViewOffset();
      this.camera.near = 0.25;
      this.camera.far = 80;
      this.camera.fov = 38;
      this.camera.aspect = w / previewH;
      if (w < 820) {
        this.camera.position.set(4.05, 1.72, 5.85);
        this.camera.lookAt(0, 0.48, 0);
        this.camera.near = 0.7;
      } else {
        this.camera.position.set(3.8, 1.65, 5.4);
        this.camera.lookAt(0, 0.45, 0);
        this.camera.near = 0.55;
        this.camera.aspect = (w * 0.52) / h;
      }
      this.camera.updateProjectionMatrix();
      // Wipe leftover race pixels first — scissor alone leaves the last frame.
      this.fullFrame(MENU_CLEAR);
      this.renderer.setScissorTest(true);
      if (w < 820) {
        this.renderer.setViewport(0, h - previewH, w, previewH);
        this.renderer.setScissor(0, h - previewH, w, previewH);
      } else {
        const previewW = Math.floor(w * 0.56);
        this.renderer.setViewport(w - previewW, 0, previewW, h);
        this.renderer.setScissor(w - previewW, 0, previewW, h);
      }
      this.renderer.setClearColor(MENU_CLEAR, 1);
      this.renderer.render(this.menuScene, this.camera);
      this.renderer.setScissorTest(false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
      this.audio.silence();
      return;
    }

    this.camera.clearViewOffset();
    this.camera.position.x = 4.2 + Math.sin(performance.now() * 0.00025) * 0.4;
    this.camera.position.y = 2.4;
    this.camera.position.z = 5.6;
    this.camera.lookAt(0, 0.6, 0);
    this.camera.fov = 52;
    this.camera.near = 0.55;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.audio.silence();
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setClearColor(MENU_CLEAR, 1);
    this.renderer.render(this.menuScene, this.camera);
  }
}
