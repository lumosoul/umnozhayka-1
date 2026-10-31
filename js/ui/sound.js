// Мягкие звуки на Web Audio API: короткие синусоиды и треугольники с плавной
// огибающей, тихая громкость. Никаких резких «ошибочных» гудков.

class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
  }

  /** Создаёт AudioContext по первому касанию (иначе iOS/Chrome не дадут играть). */
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      this.ctx = null;
    }
  }

  /** Включает или выключает звук. AudioContext создаётся позже — по первому касанию. */
  setEnabled(on) {
    this.enabled = !!on;
  }

  tone(freq, start, dur, { type = 'sine', gain = 0.12, glide = 0 } = {}) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.linearRampToValueAtTime(freq + glide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  play(name) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'tap': this.tone(660, 0, 0.06, { gain: 0.05 }); break;
      case 'correct':
        this.tone(784, 0, 0.18, { type: 'triangle', gain: 0.1 });
        this.tone(1175, 0.09, 0.26, { type: 'triangle', gain: 0.09 });
        break;
      case 'gentle':
        this.tone(440, 0, 0.22, { gain: 0.07 });
        this.tone(392, 0.12, 0.28, { gain: 0.06 });
        break;
      case 'star':
        [784, 988, 1175].forEach((f, i) => this.tone(f, i * 0.09, 0.22, { type: 'triangle', gain: 0.08 }));
        break;
      case 'fanfare':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.1, 0.3, { type: 'triangle', gain: 0.09 }));
        break;
      case 'page': this.tone(520, 0, 0.08, { gain: 0.04, glide: 120 }); break;
      case 'tick': this.tone(1000, 0, 0.04, { gain: 0.03 }); break;
      default: break;
    }
  }
}

export const sound = new Sound();
