// Click the Dot: a dot shows up somewhere random. Click it, and the next one comes half a second later.
// (Copied from yoloAimPrototype1/clickthedot, plus optional "screen noise" speckles.)
(function () {
  "use strict";

  class ClickTheDot {
    constructor({ width = 640, height = 480 } = {}) {
      this.width = width;
      this.height = height;
      this.radius = 30;
      this.respawnDelay = 500;         // ms between a hit and the next dot
      this.noise = 0;                  // 0 = clean screen, 1 = lots of flickering speckles
      this.background = "#ffffff";     // the app changes these two per brain
      this.dotColor = "#000000";
      this.dot = null;                 // {id, x, y, r, bornAt} or null when the screen is empty
      this.nextId = 1;
      this.nextSpawnAt = 0;
      this.speckles = [];
    }

    // Clear the screen; the next dot comes after `delay` ms.
    respawn(now, delay = this.respawnDelay) {
      this.dot = null;
      this.nextSpawnAt = now + delay;
    }

    // Called every frame: bring a new dot when it's time, and re-roll the noise speckles.
    update(now) {
      if (!this.dot && now >= this.nextSpawnAt) {
        const r = this.radius;
        this.dot = {
          id: this.nextId++, r, bornAt: now,
          x: r + Math.random() * (this.width - 2 * r),
          y: r + Math.random() * (this.height - 2 * r),
        };
      }
      const light = this.background === "#ffffff";
      this.speckles = Array.from({ length: Math.round(this.noise * 500) }, () => ({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: 2 + Math.random() * 4,
        shade: light ? Math.round(Math.random() * 200) : 60 + Math.round(Math.random() * 195),   // darker specks on white, lighter on dark
      }));
    }

    // Paint the game screen.
    draw(ctx) {
      ctx.fillStyle = this.background;
      ctx.fillRect(0, 0, this.width, this.height);
      for (const s of this.speckles) {
        ctx.fillStyle = `rgb(${s.shade},${s.shade},${s.shade})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
      if (this.dot) {
        ctx.beginPath();
        ctx.arc(this.dot.x, this.dot.y, this.dot.r, 0, Math.PI * 2);
        ctx.fillStyle = this.dotColor;
        ctx.fill();
      }
    }

    isOnDot(x, y) {
      return !!this.dot && Math.hypot(x - this.dot.x, y - this.dot.y) <= this.dot.r;
    }

    // Someone clicked at (x, y). A hit removes the dot. Gives back {hit, reaction ms, dot}.
    click(x, y, now) {
      const dot = this.dot;
      if (!this.isOnDot(x, y)) return { hit: false, dot };
      this.respawn(now);
      return { hit: true, reaction: now - dot.bornAt, dot };
    }
  }

  window.ClickTheDotGame = { ClickTheDot };
})();
