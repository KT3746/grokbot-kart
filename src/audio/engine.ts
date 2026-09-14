export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private squeal: OscillatorNode | null = null;
  private squealGain: GainNode | null = null;
  muted = false;
  unlocked = false;

  async unlock(): Promise<void> {
    if (this.unlocked && this.ctx?.state === "running") return;
    if (!this.ctx) this.build();
    if (!this.ctx) return;
    await this.ctx.resume();
    this.unlocked = true;
    this.applyMaster();
  }

  private build(): void {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 280;
    this.filter.Q.value = 0.7;
    this.oscA = this.ctx.createOscillator();
    this.oscB = this.ctx.createOscillator();
    // Soft motor: sine + quiet triangle (no sawtooth rasp)
    this.oscA.type = "sine";
    this.oscB.type = "triangle";
    this.oscA.frequency.value = 55;
    this.oscB.frequency.value = 56.5;
    this.oscA.connect(this.filter);
    this.oscB.connect(this.filter);
    this.filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.oscA.start();
    this.oscB.start();

    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = this.ctx.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;
    this.noiseFilter = this.ctx.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 700;
    this.noiseFilter.Q.value = 0.85;
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noise.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.master);
    this.noise.start();

    this.squeal = this.ctx.createOscillator();
    this.squeal.type = "triangle";
    this.squeal.frequency.value = 320;
    this.squealGain = this.ctx.createGain();
    this.squealGain.gain.value = 0;
    const sqf = this.ctx.createBiquadFilter();
    sqf.type = "bandpass";
    sqf.frequency.value = 900;
    sqf.Q.value = 1.2;
    this.squeal.connect(sqf);
    sqf.connect(this.squealGain);
    this.squealGain.connect(this.master);
    this.squeal.start();

    this.applyMaster();
  }

  private applyMaster(): void {
    if (!this.master) return;
    this.master.gain.value = this.muted ? 0 : 0.58;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMaster();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  engine(rpm: number, throttle: number, boost: boolean): void {
    if (!this.ctx || !this.oscA || !this.oscB || !this.filter || !this.engineGain) return;
    const r = Math.max(0, Math.min(1, rpm));
    const th = Math.max(0, Math.min(1, throttle));
    const f = 48 + r * 68 + (boost ? 22 : 0);
    this.oscA.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.06);
    this.oscB.frequency.setTargetAtTime(f * 1.04, this.ctx.currentTime, 0.06);
    this.filter.frequency.setTargetAtTime(220 + th * 480 + (boost ? 220 : 0), this.ctx.currentTime, 0.08);
    const eng = 0.045 + th * 0.14 + r * 0.07 + (boost ? 0.08 : 0);
    this.engineGain.gain.setTargetAtTime(eng, this.ctx.currentTime, 0.08);
    if (this.noiseGain) {
      const road = th * 0.012 + r * 0.01;
      this.noiseGain.gain.setTargetAtTime(road, this.ctx.currentTime, 0.1);
    }
  }

  drift(amount: number): void {
    if (!this.ctx || !this.squealGain || !this.squeal) return;
    const a = Math.max(0, Math.min(1, amount));
    this.squeal.frequency.setTargetAtTime(280 + a * 140, this.ctx.currentTime, 0.05);
    this.squealGain.gain.setTargetAtTime(a * 0.025, this.ctx.currentTime, 0.06);
  }

  blip(freq: number, dur = 0.12, type: OscillatorType = "sine"): void {
    if (!this.ctx || !this.master || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.06, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + dur + 0.02);
  }

  whoosh(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = "sawtooth";
    o2.type = "sine";
    o.frequency.setValueAtTime(220, t0);
    o.frequency.exponentialRampToValueAtTime(70, t0 + 0.32);
    o2.frequency.setValueAtTime(440, t0);
    o2.frequency.exponentialRampToValueAtTime(110, t0 + 0.28);
    f.type = "lowpass";
    f.frequency.setValueAtTime(1400, t0);
    f.frequency.exponentialRampToValueAtTime(380, t0 + 0.32);
    g.gain.setValueAtTime(0.09, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.36);
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.master);
    o.start();
    o2.start();
    o.stop(t0 + 0.38);
    o2.stop(t0 + 0.38);
  }

  finish(): void {
    this.blip(392, 0.14, "sine");
    setTimeout(() => this.blip(494, 0.14, "sine"), 110);
    setTimeout(() => this.blip(587, 0.14, "sine"), 220);
    setTimeout(() => this.blip(784, 0.32, "triangle"), 340);
  }

  lap(): void {
    this.blip(440, 0.08, "sine");
    setTimeout(() => this.blip(660, 0.12, "triangle"), 70);
  }

  countdown(n: number): void {
    if (n <= 0) {
      this.blip(392, 0.1, "triangle");
      setTimeout(() => this.blip(523, 0.12, "triangle"), 60);
      setTimeout(() => this.blip(784, 0.22, "sine"), 120);
    } else this.blip(180 + n * 45, 0.12, "sine");
  }

  item(): void {
    this.blip(480, 0.07, "sine");
    setTimeout(() => this.blip(640, 0.09, "sine"), 70);
  }

  hit(): void {
    this.blip(70, 0.16, "triangle");
  }

  pauseHum(on: boolean): void {
    if (!this.engineGain || !this.ctx) return;
    if (on) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      if (this.noiseGain) this.noiseGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
  }

  silence(): void {
    if (!this.ctx || !this.engineGain) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
    if (this.noiseGain) this.noiseGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
    this.drift(0);
  }
}
