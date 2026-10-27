// Talks to the 2 Arduinos over USB, right from Chrome (no Python needed).
//   Board Arduino  (arduino/board/board.ino): lights the LEDs. There's a magnet inside each hole.
//   Arm Arduino    (arduino/arm/arm.ino): 2 servos, and a hall sensor on the tip that says "T" when it touches a magnet
// Only works in Chrome, opened with "Start SNN Camera.command".
(function () {
  "use strict";

  // Where the arm goes for each hole: [base servo angle, arm servo angle]. Hole 0 first, hole 8 last.
  // These are the guesses from wack-a-fly's arm.py. Tune them: change a number, reload, try that hole.
  const PRESETS = [
    [20, 40], [38, 40], [55, 40],
    [72, 40], [90, 40], [108, 40],
    [125, 40], [142, 40], [160, 40],
  ];
  const HOME = [90, 90];   // where the arm rests between rounds

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const armCommand = (base, arm) => `M${base},${arm}\n`;          // what arm.ino understands
  const isTouch = (line) => line.trim() === "T";                   // the arm's tip just touched a magnet

  // One USB connection to one Arduino.
  class Link {
    constructor() {
      this.port = null;
      this.writer = null;
      this.listeners = [];
      this.onClose = () => {};
    }

    get connected() { return !!this.writer; }

    // Ask Chrome for a port (it shows a list to pick from), open it, and wait for the Arduino to wake up.
    async open() {
      if (!navigator.serial) throw new Error('This needs Chrome, opened with "Start SNN Camera.command".');
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 9600 });
      await sleep(2000);   // an Arduino restarts when you connect to it, so give it a moment
      this.writer = this.port.writable.getWriter();
      this.readLines();
    }

    write(text) {
      if (!this.writer) throw new Error("Not connected");
      return this.writer.write(new TextEncoder().encode(text));
    }

    onLine(fn) { this.listeners.push(fn); }

    // Wait for the Arduino to send this exact line (or give up). Other lines (like "T") are skipped.
    waitFor(text, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.listeners = this.listeners.filter((f) => f !== once); reject(new Error("The Arduino didn't answer")); }, timeoutMs);
        const once = (line) => {
          if (line !== text) return;
          clearTimeout(timer);
          this.listeners = this.listeners.filter((f) => f !== once);
          resolve();
        };
        this.listeners.push(once);
      });
    }

    // Keep reading what the Arduino sends, one line at a time.
    async readLines() {
      let buffer = "";
      try {
        const reader = this.port.readable.pipeThrough(new TextDecoderStream()).getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let end;
          while ((end = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, end).trim();
            buffer = buffer.slice(end + 1);
            if (line) [...this.listeners].forEach((fn) => fn(line));
          }
        }
      } catch { /* unplugged */ }
      this.writer = null;
      this.onClose();
    }
  }

  class RealBoard {
    constructor(link) { this.link = link; }
    light(hole) { this.link.write(String(hole)); }   // '0'-'8' = light that hole
    off() { this.link.write("x"); }                  // 'x' = all off
  }

  class RealArm {
    constructor(link) { this.link = link; }
    async move([base, arm]) {
      const there = this.link.waitFor("OK", 10000);   // arm.ino says "OK" once it's there
      await this.link.write(armCommand(base, arm));
      await there;
    }
    goTo(hole) { return this.move(PRESETS[hole]); }
    home() { return this.move(HOME); }
  }

  // Pretend versions for the simulator.
  class SimBoard {
    constructor() { this.lit = null; }
    light(hole) { this.lit = hole; }
    off() { this.lit = null; }
  }

  class SimArm {
    constructor() { this.at = null; this.onTouch = () => {}; }
    async goTo(hole) { this.at = hole; await sleep(600); this.onTouch(); }   // swing over, then the tip touches the magnet
    async home() { this.at = null; await sleep(400); }
  }

  const api = { PRESETS, HOME, armCommand, isTouch, Link, RealBoard, RealArm, SimBoard, SimArm };
  if (typeof module === "object") module.exports = api;   // so the tests can use it
  else window.Hardware = api;
})();
