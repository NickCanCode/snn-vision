// The SNN brain. The same steps as snn/snn_core.py, just in JavaScript.
// It only notices things that CHANGE, like your eyes noticing movement.
// One extra the Python one doesn't have: ignore(), to make a spot ignore changes for a few frames.
(function () {
  "use strict";

  const DEFAULTS = { gridW: 64, gridH: 48, threshold: 0.5, decay: 0.8, polarity: "darker" };

  class SpikingGrid {
    constructor(options = {}) {
      Object.assign(this, DEFAULTS);
      this.configure(options);
      this.reset();
    }

    // Change settings. A new grid size wipes the brain; the rest keeps it.
    configure({ gridW, gridH, threshold, decay, polarity } = {}) {
      const newSize = (gridW && gridW !== this.gridW) || (gridH && gridH !== this.gridH);
      if (polarity && !["darker", "brighter", "any"].includes(polarity)) throw new Error(`Unknown polarity: ${polarity}`);
      Object.assign(this, Object.fromEntries(Object.entries({ gridW, gridH, threshold, decay, polarity }).filter(([, v]) => v !== undefined)));
      if (newSize) this.reset();
    }

    get size() { return this.gridW * this.gridH; }

    // Forget everything and start fresh.
    reset() {
      this.v = new Float64Array(this.size);        // how charged up each neuron is
      this.ignoring = new Uint8Array(this.size);   // frames left that each neuron ignores changes
      this.events = new Float64Array(this.size);   // how much each square changed this frame
      this.spikes = new Uint8Array(this.size);     // 1 = that neuron fired this frame
      this.small = new Float64Array(this.size);    // the picture squished down to the grid
      this.prev = new Float64Array(this.size);     // the last squished picture
      this.hasPrev = false;
      this.active = 0;       // how many squares changed
      this.spikeCount = 0;   // how many neurons fired
    }

    // Give it one gray picture (numbers 0-255, w x h). Gives back {x, y} to click, or null.
    step(gray, w, h) {
      const GW = this.gridW, GH = this.gridH;
      const bw = Math.floor(w / GW), bh = Math.floor(h / GH);   // pixels per square
      if (bw < 1 || bh < 1) throw new Error(`Frame ${w}x${h} is smaller than the ${GW}x${GH} grid`);

      // 1. Squish: average each block of pixels into one square (leftover edge pixels are skipped).
      const small = this.small.fill(0);
      for (let y = 0; y < GH * bh; y++) {
        for (let x = 0; x < GW * bw; x++) small[((y / bh) | 0) * GW + ((x / bw) | 0)] += gray[y * w + x];
      }
      for (let i = 0; i < small.length; i++) small[i] /= bw * bh;

      // The first picture has nothing to compare to, so just remember it.
      if (!this.hasPrev) {
        this.prev.set(small);
        this.hasPrev = true;
        return null;
      }

      let active = 0, fired = 0, sumX = 0, sumY = 0;
      for (let i = 0; i < small.length; i++) {
        // 2. How much did this square change, in the direction we care about? (0 to 1)
        const diff = small[i] - this.prev[i];
        const change = this.polarity === "brighter" ? diff : this.polarity === "darker" ? -diff : Math.abs(diff);
        const event = Math.min(1, Math.max(0, change / 255));
        this.events[i] = event;
        if (event > 0.02) active++;

        // Told to ignore this spot for now? Then skip it.
        if (this.ignoring[i]) {
          this.ignoring[i]--;
          this.v[i] = 0;
          this.spikes[i] = 0;
          continue;
        }

        // 3. Old charge leaks a bit, new change gets added. Full enough? FIRE and start over at 0.
        const charge = this.v[i] * this.decay + event;
        this.spikes[i] = charge >= this.threshold ? 1 : 0;
        this.v[i] = this.spikes[i] ? 0 : charge;
        if (this.spikes[i]) { fired++; sumX += i % GW; sumY += (i / GW) | 0; }
      }
      this.prev.set(small);
      this.active = active;
      this.spikeCount = fired;

      // 4. Click the middle of all the neurons that fired.
      if (!fired) return null;
      return { x: (sumX / fired + 0.5) * (w / GW), y: (sumY / fired + 0.5) * (h / GH) };
    }

    // Make the neurons around (x, y) ignore changes for the next few frames.
    // The game uses this after a dot gets clicked: it's about to vanish there, and that's not news.
    ignore(x, y, radius, frames, w, h) {
      const cw = w / this.gridW, ch = h / this.gridH;
      for (let i = 0; i < this.size; i++) {
        const cx = ((i % this.gridW) + 0.5) * cw, cy = (((i / this.gridW) | 0) + 0.5) * ch;
        if (Math.hypot(cx - x, cy - y) <= radius) this.ignoring[i] = frames;
      }
    }
  }

  // Color pixels (RGBA) -> gray, the same way OpenCV does it.
  function toGray(rgba, out = new Float32Array(rgba.length / 4)) {
    for (let i = 0, j = 0; j < rgba.length; i++, j += 4) out[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    return out;
  }

  const api = { SpikingGrid, toGray, DEFAULTS };
  if (typeof module === "object") module.exports = api;   // so the tests can use it
  else window.SNNCore = api;
})();
