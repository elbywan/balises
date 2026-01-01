/**
 * Audio Service - Manages music and sound effects for the battle game
 * Uses Web Audio API to generate retro-style sound effects
 */

export type SoundEffect =
  | "select"
  | "attack"
  | "hit"
  | "superEffective"
  | "notVeryEffective"
  | "critical"
  | "faint"
  | "levelUp"
  | "heal"
  | "statUp"
  | "statDown"
  | "statusCondition"
  | "victory"
  | "defeat"
  | "switch";

export type MusicTrack = "team-select" | "battle" | "victory";

export class AudioService {
  #audioContext: AudioContext | null = null;
  #musicGain: GainNode | null = null;
  #sfxGain: GainNode | null = null;
  #masterGain: GainNode | null = null;
  #currentMusic: AudioBufferSourceNode | null = null;
  #currentMusicElement: HTMLAudioElement | null = null;
  #isMuted = false;
  #musicVolume = 0.3;
  #sfxVolume = 0.5;
  #isPlayingMusic = false;
  #preloadedAudio: Map<MusicTrack, HTMLAudioElement> = new Map();
  #currentTrack: MusicTrack | null = null;

  /**
   * Preload all music tracks for faster playback
   * Call this early (e.g., on page load) to start downloading audio files
   */
  preloadMusic(): void {
    const tracks: MusicTrack[] = ["team-select", "battle", "victory"];
    tracks.forEach((track) => {
      if (this.#preloadedAudio.has(track)) return;
      const audio = new Audio(`./assets/music/${track}.mp3`);
      audio.preload = "auto";
      // Start loading by setting src and calling load()
      audio.load();
      this.#preloadedAudio.set(track, audio);
    });
  }

  /**
   * Initialize the audio context (must be called after user interaction)
   */
  init(): void {
    if (this.#audioContext) return;

    this.#audioContext = new AudioContext();

    // Create master gain
    this.#masterGain = this.#audioContext.createGain();
    this.#masterGain.connect(this.#audioContext.destination);

    // Create separate gain nodes for music and SFX
    this.#musicGain = this.#audioContext.createGain();
    this.#musicGain.gain.value = this.#musicVolume;
    this.#musicGain.connect(this.#masterGain);

    this.#sfxGain = this.#audioContext.createGain();
    this.#sfxGain.gain.value = this.#sfxVolume;
    this.#sfxGain.connect(this.#masterGain);
  }

  /**
   * Resume audio context if suspended (required by browsers)
   */
  async resume(): Promise<void> {
    if (this.#audioContext?.state === "suspended") {
      await this.#audioContext.resume();
    }
  }

  /**
   * Play a sound effect
   */
  playSfx(effect: SoundEffect): void {
    if (!this.#audioContext || !this.#sfxGain || this.#isMuted) return;

    // Fire and forget resume
    void this.resume();

    switch (effect) {
      case "select":
        this.#playTone([800], 0.05, "square", 0.3);
        break;
      case "attack":
        this.#playAttackSound();
        break;
      case "hit":
        this.#playHitSound();
        break;
      case "superEffective":
        this.#playSuperEffectiveSound();
        break;
      case "notVeryEffective":
        this.#playNotVeryEffectiveSound();
        break;
      case "critical":
        this.#playCriticalSound();
        break;
      case "faint":
        this.#playFaintSound();
        break;
      case "heal":
        this.#playHealSound();
        break;
      case "statUp":
        this.#playStatUpSound();
        break;
      case "statDown":
        this.#playStatDownSound();
        break;
      case "statusCondition":
        this.#playStatusSound();
        break;
      case "victory":
        this.#playVictorySound();
        break;
      case "defeat":
        this.#playDefeatSound();
        break;
      case "switch":
        this.#playSwitchSound();
        break;
      case "levelUp":
        this.#playLevelUpSound();
        break;
    }
  }

  /**
   * Play a Pokemon cry from the PokeAPI
   */
  async playPokemonCry(cryUrl: string): Promise<void> {
    if (!this.#audioContext || !this.#sfxGain || this.#isMuted || !cryUrl)
      return;

    await this.resume();

    try {
      const response = await fetch(cryUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.#audioContext.decodeAudioData(arrayBuffer);

      const source = this.#audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.#sfxGain);
      source.start();
    } catch {
      // Silently fail if cry can't be loaded
    }
  }

  /**
   * Play a music track from MP3 file using HTML Audio element
   */
  async playMusic(track: MusicTrack, loop = true): Promise<void> {
    // Don't restart if already playing this track
    if (this.#currentTrack === track && this.#isPlayingMusic) return;

    this.stopMusic();

    try {
      // Use preloaded audio if available, otherwise create new
      let audio = this.#preloadedAudio.get(track);
      if (audio) {
        // Reset the preloaded audio for reuse
        audio.currentTime = 0;
      } else {
        const url = `./assets/music/${track}.mp3`;
        audio = new Audio(url);
      }

      audio.loop = loop;
      audio.volume = this.#isMuted ? 0 : this.#musicVolume;

      this.#currentMusicElement = audio;

      // Handle track ending (if not looping)
      audio.onended = () => {
        if (this.#currentMusicElement === audio) {
          this.#isPlayingMusic = false;
          this.#currentMusicElement = null;
          this.#currentTrack = null;
        }
      };

      // Play the audio
      await audio.play();

      // Only set these after successful play
      this.#isPlayingMusic = true;
      this.#currentTrack = track;
    } catch {
      // Playback failed - reset state
      this.#isPlayingMusic = false;
      this.#currentTrack = null;
      this.#currentMusicElement = null;
    }
  }

  /**
   * Start playing battle music (procedurally generated) - fallback
   */
  async startBattleMusic(): Promise<void> {
    // Try to play the MP3 version first
    await this.playMusic("battle");
  }

  /**
   * Stop the current music
   */
  stopMusic(): void {
    this.#isPlayingMusic = false;
    this.#currentTrack = null;
    if (this.#currentMusic) {
      try {
        this.#currentMusic.stop();
      } catch {
        // Already stopped
      }
      this.#currentMusic = null;
    }
    if (this.#currentMusicElement) {
      this.#currentMusicElement.pause();
      this.#currentMusicElement = null;
    }
  }

  /**
   * Play victory fanfare (now plays the victory MP3)
   */
  async playVictoryMusic(): Promise<void> {
    await this.playMusic("victory", false);
  }

  /**
   * Toggle mute state
   */
  toggleMute(): boolean {
    this.#isMuted = !this.#isMuted;
    if (this.#masterGain) {
      this.#masterGain.gain.value = this.#isMuted ? 0 : 1;
    }
    if (this.#currentMusicElement) {
      this.#currentMusicElement.volume = this.#isMuted ? 0 : this.#musicVolume;
    }
    return this.#isMuted;
  }

  /**
   * Get current mute state
   */
  get isMuted(): boolean {
    return this.#isMuted;
  }

  /**
   * Set music volume (0-1)
   */
  setMusicVolume(volume: number): void {
    this.#musicVolume = Math.max(0, Math.min(1, volume));
    if (this.#musicGain) {
      this.#musicGain.gain.value = this.#musicVolume;
    }
  }

  /**
   * Set SFX volume (0-1)
   */
  setSfxVolume(volume: number): void {
    this.#sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.#sfxGain) {
      this.#sfxGain.gain.value = this.#sfxVolume;
    }
  }

  /**
   * Clean up audio resources
   */
  dispose(): void {
    this.stopMusic();
    if (this.#audioContext) {
      this.#audioContext.close();
      this.#audioContext = null;
    }
  }

  // ============ Private Sound Generation Methods ============

  #playTone(
    frequencies: number[],
    duration: number,
    type: OscillatorType = "square",
    volume: number = 0.3,
  ): void {
    if (!this.#audioContext || !this.#sfxGain) return;

    const now = this.#audioContext.currentTime;
    frequencies.forEach((freq) => {
      this.#scheduleNote(freq, now, duration, type, volume);
    });
  }

  #scheduleNote(
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ): void {
    if (!this.#audioContext || !this.#sfxGain) return;

    const osc = this.#audioContext.createOscillator();
    const gain = this.#audioContext.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.#sfxGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  #playAttackSound(): void {
    if (!this.#audioContext) return;
    const now = this.#audioContext.currentTime;

    // Whoosh sound
    this.#scheduleNote(400, now, 0.05, "sawtooth", 0.2);
    this.#scheduleNote(300, now + 0.03, 0.05, "sawtooth", 0.15);
    this.#scheduleNote(200, now + 0.06, 0.05, "sawtooth", 0.1);
  }

  #playHitSound(): void {
    if (!this.#audioContext || !this.#sfxGain) return;

    // White noise burst for impact
    const bufferSize = this.#audioContext.sampleRate * 0.1;
    const buffer = this.#audioContext.createBuffer(
      1,
      bufferSize,
      this.#audioContext.sampleRate,
    );
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = this.#audioContext.createBufferSource();
    noise.buffer = buffer;

    const gain = this.#audioContext.createGain();
    gain.gain.setValueAtTime(0.3, this.#audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      this.#audioContext.currentTime + 0.1,
    );

    noise.connect(gain);
    gain.connect(this.#sfxGain);
    noise.start();
  }

  #playSuperEffectiveSound(): void {
    if (!this.#audioContext) return;
    const now = this.#audioContext.currentTime;

    // Rising triumphant sound
    this.#scheduleNote(600, now, 0.1, "square", 0.25);
    this.#scheduleNote(800, now + 0.1, 0.1, "square", 0.25);
    this.#scheduleNote(1000, now + 0.2, 0.15, "square", 0.3);
  }

  #playNotVeryEffectiveSound(): void {
    if (!this.#audioContext) return;
    const now = this.#audioContext.currentTime;

    // Dull thud
    this.#scheduleNote(200, now, 0.15, "triangle", 0.2);
    this.#scheduleNote(150, now + 0.05, 0.1, "triangle", 0.15);
  }

  #playCriticalSound(): void {
    if (!this.#audioContext) return;
    const now = this.#audioContext.currentTime;

    // Sharp crack
    this.#scheduleNote(1200, now, 0.05, "square", 0.3);
    this.#scheduleNote(800, now + 0.05, 0.05, "square", 0.25);
    this.#scheduleNote(1000, now + 0.1, 0.1, "square", 0.3);
  }

  #playFaintSound(): void {
    if (!this.#audioContext) return;
    const now = this.#audioContext.currentTime;

    // Descending sad sound
    this.#scheduleNote(400, now, 0.15, "triangle", 0.25);
    this.#scheduleNote(300, now + 0.15, 0.15, "triangle", 0.2);
    this.#scheduleNote(200, now + 0.3, 0.2, "triangle", 0.15);
    this.#scheduleNote(100, now + 0.5, 0.3, "triangle", 0.1);
  }

  #playHealSound(): void {
    if (!this.#audioContext) return;
    const now = this.#audioContext.currentTime;

    // Pleasant ascending chime
    this.#scheduleNote(523, now, 0.1, "sine", 0.2);
    this.#scheduleNote(659, now + 0.1, 0.1, "sine", 0.2);
    this.#scheduleNote(784, now + 0.2, 0.1, "sine", 0.2);
    this.#scheduleNote(1047, now + 0.3, 0.2, "sine", 0.25);
  }

  #playStatUpSound(): void {
    if (!this.#audioContext) return;
    const now = this.#audioContext.currentTime;

    // Quick ascending
    this.#scheduleNote(400, now, 0.08, "square", 0.2);
    this.#scheduleNote(600, now + 0.08, 0.08, "square", 0.2);
    this.#scheduleNote(800, now + 0.16, 0.1, "square", 0.25);
  }

  #playStatDownSound(): void {
    if (!this.#audioContext) return;
    const now = this.#audioContext.currentTime;

    // Quick descending
    this.#scheduleNote(600, now, 0.08, "square", 0.2);
    this.#scheduleNote(400, now + 0.08, 0.08, "square", 0.2);
    this.#scheduleNote(300, now + 0.16, 0.1, "square", 0.15);
  }

  #playStatusSound(): void {
    if (!this.#audioContext) return;
    const now = this.#audioContext.currentTime;

    // Wobble sound
    this.#scheduleNote(300, now, 0.1, "triangle", 0.2);
    this.#scheduleNote(350, now + 0.1, 0.1, "triangle", 0.2);
    this.#scheduleNote(300, now + 0.2, 0.1, "triangle", 0.2);
    this.#scheduleNote(250, now + 0.3, 0.15, "triangle", 0.15);
  }

  #playVictorySound(): void {
    if (!this.#audioContext) return;
    const now = this.#audioContext.currentTime;

    // Triumphant fanfare
    this.#scheduleNote(523, now, 0.15, "square", 0.25);
    this.#scheduleNote(659, now + 0.15, 0.15, "square", 0.25);
    this.#scheduleNote(784, now + 0.3, 0.15, "square", 0.25);
    this.#scheduleNote(1047, now + 0.45, 0.4, "square", 0.3);
  }

  #playDefeatSound(): void {
    if (!this.#audioContext) return;
    const now = this.#audioContext.currentTime;

    // Sad descending
    this.#scheduleNote(400, now, 0.2, "triangle", 0.2);
    this.#scheduleNote(350, now + 0.2, 0.2, "triangle", 0.18);
    this.#scheduleNote(300, now + 0.4, 0.2, "triangle", 0.15);
    this.#scheduleNote(250, now + 0.6, 0.3, "triangle", 0.12);
  }

  #playSwitchSound(): void {
    if (!this.#audioContext) return;
    const now = this.#audioContext.currentTime;

    // Whoosh + chime
    this.#scheduleNote(300, now, 0.05, "sawtooth", 0.15);
    this.#scheduleNote(500, now + 0.05, 0.05, "sawtooth", 0.15);
    this.#scheduleNote(700, now + 0.1, 0.1, "sine", 0.2);
  }

  #playLevelUpSound(): void {
    if (!this.#audioContext) return;
    const now = this.#audioContext.currentTime;

    // Celebratory arpeggio
    const notes = [523, 659, 784, 1047, 784, 1047];
    notes.forEach((freq, i) => {
      this.#scheduleNote(freq, now + i * 0.08, 0.1, "square", 0.2);
    });
  }
}

/** Singleton audio service instance */
export const audioService = new AudioService();
