// The physical Wack-a-Fly board: seeing it, and playing the game on it.
// (Ported from the wack-a-fly project: camera.py, gui.py and main.py.)
//
// How the brain sees the board:
//   cut a square around each of the 9 lights -> zoom each one in -> make it black and white
//   -> glue them into one 3 x 3 picture. Whichever square the light dot is in = the hole to hit.
(function () {
  "use strict";

  // Where each hole is in the 640 x 480 camera picture (x, y). Hole 0 is top left, hole 8 bottom right.
  // These are the starting guesses from camera.py. Use "Set holes" in the app to click your real ones.
  const HOLES = [
    [110, 120], [320, 120], [530, 120],
    [110, 240], [320, 240], [530, 240],
    [110, 360], [320, 360], [530, 360],
  ];
  const BOX = 80;            // size of the square cut out around each hole
  const SIZE = 192;          // each square gets zoomed up to 192 x 192 (like camera.py)
  const GRID = SIZE * 3;     // so the glued 3 x 3 picture is 576 x 576
  const WHITE = 180;         // brighter than this = white, the rest = black (like camera.py)
  const GAP = 20;            // frame-based brain: the lit square must beat the others by this much (like gui.py)

  // A point in the 3 x 3 picture -> which square (= which hole) it's in.
  function squareOf(x, y) {
    return Math.min(2, Math.floor(y / SIZE)) * 3 + Math.min(2, Math.floor(x / SIZE));
  }

  // The frame-based brain (stands in for YOLO): look at ALL 9 squares, every frame, and
  // pick the whitest one, but only if it's clearly whiter than the rest. A dark board = no answer.
  function frameGuess(bw) {
    const white = new Array(9).fill(0);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) white[squareOf(x, y)] += bw[y * GRID + x];
    }
    const mean = white.map((sum) => sum / (SIZE * SIZE));
    const best = mean.indexOf(Math.max(...mean));
    const others = (mean.reduce((a, b) => a + b, 0) - mean[best]) / 8;
    return mean[best] - others > GAP ? best : null;
  }

  // Makes the black-and-white 3 x 3 picture from a camera frame (browser only).
  class Vision {
    constructor() {
      this.canvas = Object.assign(document.createElement("canvas"), { width: GRID, height: GRID });
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
      this.bw = new Float32Array(GRID * GRID);
    }

    look(frame, holes) {
      const ctx = this.ctx;
      ctx.filter = "grayscale(1) blur(2px)";   // gray, and a little blur so specks don't count
      holes.forEach(([x, y], i) => {
        ctx.drawImage(frame, x - BOX / 2, y - BOX / 2, BOX, BOX, (i % 3) * SIZE, Math.floor(i / 3) * SIZE, SIZE, SIZE);
      });
      ctx.filter = "none";
      const img = ctx.getImageData(0, 0, GRID, GRID);
      for (let i = 0, j = 0; i < this.bw.length; i++, j += 4) {
        this.bw[i] = img.data[j] > WHITE ? 255 : 0;   // only the bright bits (lit LEDs) stay white
        img.data[j] = img.data[j + 1] = img.data[j + 2] = this.bw[i];
      }
      ctx.putImageData(img, 0, 0);   // keep the black-and-white version around so the app can show it
      return this.bw;
    }
  }

  // The pretend board for when the real one isn't plugged in: dark board, 9 holes, one glowing LED.
  function drawSimBoard(ctx, holes, lit, armAt) {
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(0, 0, 640, 480);
    holes.forEach(([x, y], i) => {
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.fillStyle = "#111";
      ctx.fill();
      if (i === lit) {
        const glow = ctx.createRadialGradient(x, y, 4, x, y, 34);
        glow.addColorStop(0, "#fffbe0");
        glow.addColorStop(0.45, "#ffe14d");
        glow.addColorStop(1, "rgba(255,200,0,0)");
        ctx.beginPath();
        ctx.arc(x, y, 34, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }
    });
    if (armAt != null) {   // the pretend arm's magnet tip, sitting on a hole
      const [x, y] = holes[armAt];
      ctx.beginPath();
      ctx.arc(x + 14, y - 14, 10, 0, Math.PI * 2);
      ctx.fillStyle = "#9aa0a6";
      ctx.fill();
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // One game on the board. The computer runs the game, and the board (screen and real) just shows it.
  // A round: light a hole -> the brain spots it -> the arm goes to that hole -> the tip touches the magnet -> light off.
  class Match {
    constructor({ now, onChange }) {
      this.now = now;   // the app's clock (it stops while paused, so the game pauses too)
      this.onChange = onChange;   // called with a status message whenever something happens
      this.running = false;
      this.lit = null;            // which hole is lit right now (null = board dark)
      this.result = null;         // {hole, guess, hit, at} of the last round, for drawing
      this.touchAt = null;        // when the arm's tip touched a magnet this round
      this.armMoving = false;     // only touches while the arm is on its way count
    }

    async wait(ms) {   // like sleep, but the clock stops while the app is paused
      const end = this.now() + ms;
      while (this.running && this.now() < end) await sleep(10);
    }

    // The brain spotted a light in this hole (or null). Only counts in a brain round, after the light came on.
    saw(hole) {
      if (this.who !== "you" && this.lit !== null && this.answer === undefined && hole !== null) this.answer = { hole, at: this.now() };
    }

    // You clicked a hole in the simulator. Only counts when YOU are playing.
    felt(hole) {
      if (this.who === "you" && this.lit !== null && this.answer === undefined) this.answer = { hole, at: this.now() };
    }

    // The arm's tip touched a magnet: that's the confirmation, so the light goes off right away.
    touched() {
      if (!this.armMoving || this.touchAt !== null) return;
      this.touchAt = this.now();
      this.board.off();
    }

    stop() {
      this.running = false;
    }

    // Play rounds until stopped. who: "snn", "frame" or "you". devices: {board, arm} (arm can be null).
    // record(who, hit, seeMs, touchMs) gets called once per round (touchMs is null without an arm).
    async play(who, devices, record) {
      this.running = true;
      this.who = who;
      this.board = devices.board;
      const arm = who === "you" ? null : devices.arm;   // when you play, you are the arm
      const timeout = who === "you" ? 5000 : 3000;   // people need longer than brains
      try {
        while (this.running) {
          devices.board.off();
          this.lit = null;
          await this.wait(1000);   // keep the board dark for a moment, so the SNN sees the light turn ON
          if (!this.running) break;

          // 1. Light a hole.
          const hole = Math.floor(Math.random() * 9);
          this.answer = undefined;
          this.touchAt = null;
          devices.board.light(hole);
          this.lit = hole;
          const litAt = this.now();
          this.onChange(who === "you" ? `Hole ${hole} is lit. Click it!` : `Hole ${hole} is lit...`);

          // 2. Wait for the brain (or you) to pick a hole, or give up after the timeout.
          while (this.running && this.answer === undefined && this.now() - litAt < timeout) await sleep(10);
          if (!this.running) break;
          const answer = this.answer ?? null;
          const see = answer ? answer.at - litAt : null;

          // 3. Send the arm to the picked hole (right or wrong) and wait for the tip to touch the magnet.
          let touch = null;
          if (arm && answer) {
            this.armMoving = true;
            this.onChange(`Hole ${hole} is lit · picked ${answer.hole} in ${Math.round(see)} ms · arm on its way...`);
            await arm.goTo(answer.hole);
            const end = this.now() + 1000;   // give the tip a moment to touch after the arm gets there
            while (this.running && this.touchAt === null && this.now() < end) await sleep(10);
            this.armMoving = false;
            if (!this.running) break;
            if (this.touchAt !== null) touch = this.touchAt - litAt;
          }

          // 4. Score it. With an arm, it only counts if the tip really touched.
          const hit = answer?.hole === hole && (!arm || touch !== null);
          this.result = { hole, guess: answer?.hole ?? null, hit, at: this.now() };
          record(who, hit, hit ? see : null, hit ? touch : null);
          devices.board.off();
          this.lit = null;
          this.onChange(answer === null
            ? `Hole ${hole} was lit, but nothing ${who === "you" ? "clicked it" : "was seen"}. Miss.`
            : `Hole ${hole} was lit · picked ${answer.hole} in ${Math.round(see)} ms`
              + (arm ? (touch !== null ? ` · touched in ${Math.round(touch)} ms` : " · the arm never touched") : "")
              + ` · ${hit ? "HIT" : "MISS"}`);

          if (arm && answer && this.running) await arm.home();
        }
      } catch (err) {
        this.onChange(`Stopped: ${err.message}`);
      } finally {
        this.running = false;
        this.armMoving = false;
        this.lit = null;
        try { devices.board.off(); } catch { /* board already gone */ }
      }
    }
  }

  const api = { HOLES, BOX, SIZE, GRID, WHITE, GAP, squareOf, frameGuess, Vision, drawSimBoard, Match };
  if (typeof module === "object") module.exports = api;   // so the tests can use it
  else window.Board = api;
})();
