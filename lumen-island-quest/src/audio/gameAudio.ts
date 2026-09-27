export type SoundName =
  | 'ui'
  | 'step'
  | 'attack'
  | 'hit'
  | 'hurt'
  | 'dodge'
  | 'perfect'
  | 'skill'
  | 'potion'
  | 'pickup'
  | 'craft'
  | 'level'
  | 'boss'
  | 'victory'
  | 'defeat';

export type AudioScene = 'title' | 'world' | 'battle' | 'boss' | 'safe';

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambientNodes: Array<OscillatorNode | BiquadFilterNode> = [];
  private sfxVolume = 0.72;
  private musicVolume = 0.45;
  private scene: AudioScene = 'title';
  private unlocked = false;

  async unlock(): Promise<void> {
    if (this.unlocked) {
      if (this.context?.state === 'suspended') await this.context.resume();
      return;
    }
    try {
      const AudioContextClass = window.AudioContext;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.sfxBus = this.context.createGain();
      this.musicBus = this.context.createGain();
      this.master.gain.value = 0.82;
      this.sfxBus.gain.value = this.sfxVolume;
      this.musicBus.gain.value = this.musicVolume * 0.22;
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.master.connect(this.context.destination);
      this.createAmbient();
      this.unlocked = true;
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      this.context = null;
    }
  }

  setSfxVolume(value: number): void {
    this.sfxVolume = Math.min(1, Math.max(0, value));
    this.sfxBus?.gain.setTargetAtTime(this.sfxVolume, this.currentTime, 0.03);
  }

  setMusicVolume(value: number): void {
    this.musicVolume = Math.min(1, Math.max(0, value));
    this.musicBus?.gain.setTargetAtTime(this.musicVolume * 0.22, this.currentTime, 0.08);
  }

  setScene(scene: AudioScene): void {
    this.scene = scene;
    if (!this.context || !this.musicBus) return;
    const targets: Record<AudioScene, number> = {
      title: 0.2,
      world: 0.34,
      battle: 0.5,
      boss: 0.66,
      safe: 0.28,
    };
    this.musicBus.gain.setTargetAtTime(this.musicVolume * targets[scene], this.currentTime, 0.35);
  }

  async pause(): Promise<void> {
    if (this.context?.state === 'running') await this.context.suspend();
  }

  async resume(): Promise<void> {
    if (this.context?.state === 'suspended') await this.context.resume();
  }

  play(name: SoundName): void {
    if (!this.context || !this.sfxBus || this.context.state !== 'running') return;
    const now = this.currentTime;
    switch (name) {
      case 'ui':
        this.tone(430, 0.045, 'sine', 0.12, 620, now);
        break;
      case 'step':
        this.noise(0.035, 0.035, 620, now);
        break;
      case 'attack':
        this.sweep(230, 0.085, 'triangle', 0.12, 90, now);
        break;
      case 'hit':
        this.noise(0.055, 0.11, 1200, now);
        this.tone(150, 0.07, 'square', 0.05, 90, now);
        break;
      case 'hurt':
        this.sweep(170, 0.2, 'sawtooth', 0.09, 68, now);
        break;
      case 'dodge':
        this.sweep(720, 0.14, 'sine', 0.07, 190, now);
        break;
      case 'perfect':
        this.tone(660, 0.16, 'sine', 0.1, 990, now + 0.02);
        this.tone(990, 0.2, 'triangle', 0.07, 1320, now + 0.1);
        break;
      case 'skill':
        this.tone(260, 0.34, 'triangle', 0.1, 720, now);
        this.tone(520, 0.3, 'sine', 0.06, 980, now + 0.05);
        break;
      case 'potion':
        this.tone(520, 0.22, 'sine', 0.08, 880, now);
        break;
      case 'pickup':
        this.tone(620, 0.11, 'sine', 0.06, 780, now);
        this.tone(930, 0.13, 'sine', 0.05, 1100, now + 0.07);
        break;
      case 'craft':
        this.tone(180, 0.2, 'square', 0.05, 320, now);
        this.tone(420, 0.3, 'triangle', 0.07, 740, now + 0.08);
        break;
      case 'level':
        [440, 554, 659, 880].forEach((frequency, index) => this.tone(frequency, 0.22, 'sine', 0.07, frequency * 1.1, now + index * 0.08));
        break;
      case 'boss':
        this.sweep(70, 0.9, 'sawtooth', 0.12, 45, now);
        this.tone(98, 0.8, 'square', 0.05, 73, now + 0.1);
        break;
      case 'victory':
        [392, 494, 587, 784].forEach((frequency, index) => this.tone(frequency, 0.4, 'triangle', 0.07, frequency, now + index * 0.11));
        break;
      case 'defeat':
        this.sweep(240, 0.7, 'sine', 0.08, 72, now);
        break;
      default:
        break;
    }
  }

  private get currentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  private createAmbient(): void {
    if (!this.context || !this.musicBus) return;
    const now = this.currentTime;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    filter.Q.value = 0.8;
    filter.connect(this.musicBus);

    const frequencies = [110, 164.81, 220];
    frequencies.forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      oscillator.type = index === 1 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index * 5 - 3;
      gain.gain.value = [0.035, 0.026, 0.018][index]!;
      oscillator.connect(gain);
      gain.connect(filter);
      oscillator.start(now);
      const lfo = this.context!.createOscillator();
      const lfoGain = this.context!.createGain();
      lfo.frequency.value = 0.055 + index * 0.018;
      lfoGain.gain.value = index * 0.004;
      lfo.connect(lfoGain);
      lfoGain.connect(oscillator.detune);
      lfo.start(now);
      this.ambientNodes.push(oscillator, lfo, filter);
    });
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, endFrequency: number, start: number): void {
    if (!this.context || !this.sfxBus) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(0.02, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.sfxBus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private sweep(frequency: number, duration: number, type: OscillatorType, volume: number, endFrequency: number, start: number): void {
    this.tone(frequency, duration, type, volume, endFrequency, start);
  }

  private noise(duration: number, volume: number, cutoff: number, start: number): void {
    if (!this.context || !this.sfxBus) return;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    source.start(start);
  }
}
