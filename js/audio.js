/* 用 WebAudio 合成的音效，无需音频文件。iOS 需在用户首次触摸后 unlock() */
(function (root) {
  "use strict";

  const Sfx = {
    ctx: null,
    master: null,
    muted: false,

    unlock: function () {
      if (!this.ctx) {
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.9;
          this.master.connect(this.ctx.destination);
        } catch (e) {
          this.ctx = null;
          return;
        }
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    },

    ready: function () {
      return this.ctx && !this.muted;
    },

    tone: function (freq, dur, type, vol, slide, when) {
      if (!this.ready()) return;
      const ctx = this.ctx,
        t0 = ctx.currentTime + (when || 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (slide)
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(40, freq + slide),
          t0 + dur,
        );
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },

    noise: function (dur, vol, freq) {
      if (!this.ready()) return;
      const ctx = this.ctx,
        t0 = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++)
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(freq || 1200, t0);
      filter.frequency.exponentialRampToValueAtTime(200, t0 + dur);
      const g = ctx.createGain();
      g.gain.value = vol || 0.3;
      src.connect(filter);
      filter.connect(g);
      g.connect(this.master);
      src.start(t0);
    },

    swap: function () {
      this.tone(600, 0.08, "triangle", 0.08, 200);
    },
    select: function () {
      this.tone(880, 0.05, "sine", 0.06);
    },
    invalid: function () {
      this.tone(220, 0.09, "square", 0.05, -40);
      this.tone(180, 0.12, "square", 0.05, -40, 0.09);
    },
    match: function (combo) {
      const steps = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
      const semi = steps[Math.min(combo - 1, steps.length - 1)];
      const f = 523.25 * Math.pow(2, semi / 12);
      this.tone(f, 0.16, "sine", 0.16);
      this.tone(f * 2, 0.12, "triangle", 0.05, 0, 0.03);
    },
    create: function () {
      this.tone(660, 0.1, "triangle", 0.1);
      this.tone(990, 0.18, "triangle", 0.1, 0, 0.08);
    },
    blast: function (big) {
      this.noise(big ? 0.6 : 0.35, big ? 0.45 : 0.3, big ? 900 : 1600);
      this.tone(big ? 120 : 200, 0.3, "sine", 0.2, -80);
    },
    zap: function () {
      this.tone(1400, 0.25, "sawtooth", 0.04, -1100);
      this.noise(0.2, 0.15, 3000);
    },
    shuffle: function () {
      for (let i = 0; i < 6; i++)
        this.tone(400 + i * 90, 0.06, "triangle", 0.06, 0, i * 0.05);
    },
    win: function () {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        this.tone(f, 0.3, "triangle", 0.14, 0, i * 0.12),
      );
      this.tone(1318.5, 0.6, "sine", 0.1, 0, 0.5);
    },
    lose: function () {
      [392, 349.23, 311.13, 261.63].forEach((f, i) =>
        this.tone(f, 0.35, "triangle", 0.12, 0, i * 0.18),
      );
    },
    tick: function () {
      this.tone(1200, 0.04, "sine", 0.05);
    },
    // 冰块被敲：清脆的高频声，碎掉时更响
    ice: function (broken) {
      this.noise(broken ? 0.25 : 0.12, broken ? 0.3 : 0.18, 5000);
      this.tone(broken ? 2200 : 1800, 0.12, "triangle", 0.08, -600);
      if (broken) this.tone(2900, 0.15, "sine", 0.06, -900, 0.05);
    },
  };

  root.Sfx = Sfx;
})(window);
