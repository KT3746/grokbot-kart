import type { InputState } from "../types";
import { clamp, wantsTouchControls } from "../config";
import { keyPlayerRight, steerFromPlayerRight } from "./steerMap";

export class Input {
  state: InputState = { throttle: 0, brake: 0, steer: 0, drift: false, item: false, pause: false };
  itemPressed = false;
  pausePressed = false;
  touchMode = false;
  private keys = new Set<string>();
  private steerTouch = 0;
  private pad = { throttle: false, brake: false, drift: false, item: false };
  private listeners: Array<() => void> = [];
  private raceLock = false;
  private boundLayer: HTMLElement | null = null;
  private padPointers = new Map<number, keyof typeof this.pad>();
  private steerPointer: number | null = null;
  private windowPadBound = false;

  constructor() {
    this.touchMode = wantsTouchControls();
  }

  setRaceLock(on: boolean): void {
    this.raceLock = on;
    if (!on) this.resetPlay();
  }

  resetPlay(): void {
    this.pad.throttle = false;
    this.pad.brake = false;
    this.pad.drift = false;
    this.pad.item = false;
    this.steerTouch = 0;
    this.itemPressed = false;
    this.pausePressed = false;
    this.padPointers.clear();
    this.steerPointer = null;
    this.state.throttle = 0;
    this.state.brake = 0;
    this.state.steer = 0;
    this.state.drift = false;
    this.state.item = false;
  }

  bind(root: HTMLElement): void {
    const down = (e: KeyboardEvent) => {
      this.keys.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (e.code === "Escape") this.pausePressed = true;
      if (e.code === "KeyE" || e.code === "ControlLeft" || e.code === "ControlRight") this.itemPressed = true;
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    this.listeners.push(() => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    });

    const onTouchMove = (e: TouchEvent) => {
      if (!this.raceLock) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("#touch, .pad-btn, .stick-wrap, .overlay, .icon-btn")) return;
      e.preventDefault();
    };
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    this.listeners.push(() => root.removeEventListener("touchmove", onTouchMove));
  }

  bindTouch(layer: HTMLElement): void {
    if (this.boundLayer === layer) {
      this.touchMode = true;
      return;
    }
    this.boundLayer = layer;
    this.touchMode = true;
    const stick = layer.querySelector(".stick-wrap") as HTMLElement | null;
    const knob = layer.querySelector(".stick-knob") as HTMLElement | null;

    const setPad = (name: keyof typeof this.pad, on: boolean) => {
      this.pad[name] = on;
      const btn = layer.querySelector(`[data-pad="${name}"]`);
      btn?.classList.toggle("active", on);
    };

    const onWindowUp = (e: Event) => {
      const pid = "pointerId" in e ? (e as PointerEvent).pointerId : -1;
      const name = this.padPointers.get(pid) ?? this.padPointers.get(-1);
      this.padPointers.delete(pid);
      this.padPointers.delete(-1);
      if (name) {
        let still = false;
        for (const v of this.padPointers.values()) if (v === name) still = true;
        if (!still) {
          this.pad[name] = false;
          this.boundLayer?.querySelector(`[data-pad="${name}"]`)?.classList.remove("active");
        }
      }
      if (this.steerPointer === pid) {
        this.steerPointer = null;
        this.steerTouch = 0;
        const knobEl = this.boundLayer?.querySelector(".stick-knob") as HTMLElement | null;
        if (knobEl) knobEl.style.transform = "translate(0,0)";
      }
    };
    if (!this.windowPadBound) {
      this.windowPadBound = true;
      window.addEventListener("pointerup", onWindowUp, true);
      window.addEventListener("pointercancel", onWindowUp, true);
      window.addEventListener("mouseup", onWindowUp, true);
    }

    if (stick && knob) {
      const update = (cx: number) => {
        const r = stick.getBoundingClientRect();
        const x = (cx - (r.left + r.width / 2)) / (r.width * 0.5);
        this.steerTouch = clamp(x, -1, 1);
        knob.style.transform = `translate(${clamp(x, -1, 1) * 42}px, 0px)`;
      };
      stick.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.steerPointer = e.pointerId;
        try {
          stick.setPointerCapture(e.pointerId);
        } catch {
          /* capture is optional */
        }
        update(e.clientX);
      });
      stick.addEventListener("pointermove", (e) => {
        if (this.steerPointer === e.pointerId) update(e.clientX);
      });
    }

    layer.querySelectorAll("[data-pad]").forEach((node) => {
      const el = node as HTMLElement;
      const name = el.getAttribute("data-pad") as keyof typeof this.pad;
      el.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.padPointers.set(e.pointerId, name);
          setPad(name, true);
          if (name === "item") this.itemPressed = true;
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            /* optional */
          }
        },
        { capture: true },
      );
      el.addEventListener(
        "mousedown",
        (e) => {
          e.preventDefault();
          this.padPointers.set(-1, name);
          setPad(name, true);
          if (name === "item") this.itemPressed = true;
        },
        { capture: true },
      );
      el.addEventListener("contextmenu", (ev) => ev.preventDefault());
    });
  }

  refreshTouchFlag(): void {
    this.touchMode = wantsTouchControls();
  }

  /** Drop the race pad layer so menu clicks are not captured by leftover sticks. */
  releaseTouch(): void {
    this.boundLayer = null;
    this.resetPlay();
    this.touchMode = wantsTouchControls();
  }

  poll(): InputState {
    const k = this.keys;
    const up = k.has("ArrowUp") || k.has("KeyW");
    const left = k.has("ArrowLeft") || k.has("KeyA");
    const right = k.has("ArrowRight") || k.has("KeyD");
    // Coast when throttle is released. Drift = Shift (PC) or Derrapa pad (touch).
    const fromKeys = keyPlayerRight(left, right);
    const stickLive = this.steerPointer !== null;
    const playerRight = fromKeys !== 0 ? fromKeys : stickLive ? this.steerTouch : 0;
    const shift =
      k.has("ShiftLeft") || k.has("ShiftRight") || k.has("Space");
    this.state.throttle = this.pad.throttle || up ? 1 : 0;
    this.state.brake = 0;
    this.state.steer = steerFromPlayerRight(playerRight);
    this.state.drift = this.pad.drift || shift;
    this.state.item = this.itemPressed;
    return this.state;
  }

  consumeItem(): boolean {
    const v = this.itemPressed;
    this.itemPressed = false;
    return v;
  }

  consumePause(): boolean {
    const v = this.pausePressed;
    this.pausePressed = false;
    return v;
  }

  debugLine(): string {
    const k = this.keys;
    const right = k.has("ArrowRight") || k.has("KeyD");
    const left = k.has("ArrowLeft") || k.has("KeyA");
    return `R=${right ? 1 : 0} L=${left ? 1 : 0} stick=${this.steerTouch.toFixed(2)} live=${this.steerPointer !== null ? 1 : 0} steer=${this.state.steer.toFixed(2)}`;
  }
}
