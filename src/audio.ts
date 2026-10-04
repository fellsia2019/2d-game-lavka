import type { Settings } from "./storage";
class ShopAudio {
  private context: AudioContext | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private settings: Settings = {
    sound: true,
    music: false,
    reducedMotion: false,
  };
  private paused = false;
  async unlock() {
    this.context ??= new AudioContext();
    if (this.context.state === "suspended" && !this.paused)
      await this.context.resume().catch(() => {});
    this.syncMusic();
  }
  configure(settings: Settings) {
    this.settings = settings;
    this.syncMusic();
  }
  pause(paused: boolean) {
    this.paused = paused;
    if (paused) void this.context?.suspend();
    else if (this.context) void this.context.resume().catch(() => {});
    this.syncMusic();
  }
  private note(
    frequency: number,
    offset = 0,
    duration = 0.15,
    volume = 0.07,
    type: OscillatorType = "sine",
  ) {
    if (!this.context || this.paused || this.context.state !== "running")
      return;
    const context = this.context,
      start = context.currentTime + offset;
    const osc = context.createOscillator(),
      gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  play(effect: "take" | "place" | "ship" | "win" | "repair" | "button") {
    if (!this.settings.sound || this.paused) return;
    const notes = {
      take: [640],
      place: [380, 520],
      button: [490],
      ship: [523, 659, 784],
      win: [523, 659, 784, 1046],
      repair: [392, 523, 659, 784, 1046],
    }[effect];
    notes.forEach((n, i) =>
      this.note(
        n,
        i * 0.075,
        effect === "win" || effect === "repair" ? 0.5 : 0.16,
        0.045,
        "triangle",
      ),
    );
  }
  private syncMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (
      !this.settings.music ||
      this.paused ||
      !this.context ||
      this.context.state !== "running"
    )
      return;
    const melody = [
      523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 1046, 587, 698,
      784, 659,
    ];
    this.musicTimer = setInterval(() => {
      const n = melody[this.tick++ % melody.length];
      this.note(n, 0, 1.2, 0.013);
      if (this.tick % 4 === 1) this.note(n / 2, 0.03, 2, 0.009, "triangle");
    }, 750);
  }
}
export const audio = new ShopAudio();
