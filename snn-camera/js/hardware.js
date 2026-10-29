// Talks to the 2 Arduinos over USB, right from Chrome (no Python needed).
//   Board Arduino  (arduino/board/board.ino): lights the LEDs. There's a magnet inside each hole.
//   Arm Arduino    (arduino/arm/arm.ino): 3 servos, and a hall sensor on the tip that says "T" when it touches a magnet
// Only works in Chrome, opened with "Start SNN Camera.command".
// The arm's angle for each hole lives in arm.ino (the holes table), so the app just says which hole.
(function () {
  "use strict";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const armCommand = (hole) => `H${hole}\n`;                       // arm.ino: lift, swing over the hole, tap it, lift
  const REST = "Z\n";                                              // arm.ino: go to rest between rounds
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
    async send(command) {
      const there = this.link.waitFor("OK", 10000);   // arm.ino says "OK" once it's done
      await this.link.write(command);
      await there;
    }
    goTo(hole) { return this.send(armCommand(hole)); }   // the tip's "T" arrives during this, before the "OK"
    home() { return this.send(REST); }
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

  const api = { armCommand, REST, isTouch, Link, RealBoard, RealArm, SimBoard, SimArm };
  if (typeof module === "object") module.exports = api;   // so the tests can use it
  else window.Hardware = api;
})();
