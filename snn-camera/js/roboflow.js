// Roboflow brain (Board mode only): YOUR trained board model (yerrrrrrrrrr), on this Mac, your own Roboflow server
// or Roboflow's cloud. It looks at the 3 x 3 view and says which hole (class hole0 ... hole8).
// The page sends each picture to server.py, which adds your secret key and asks Roboflow.
// That way the key never ends up in the browser.
(function () {
  "use strict";

  class RoboflowClient {
    constructor() {
      this.ready = false;
      this.loading = null;
      this.busy = false;
      this.lastMs = 0;
      this.where = "Roboflow";   // or "this Mac" / "your Roboflow server"
    }

    // Check that server.py is running and has a key.
    load() {
      this.loading ??= (async () => {
        const status = await fetch("api/roboflow/status").then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!status) throw new Error('Roboflow needs the launcher: double-click "Start SNN Camera.command".');
        if (!status.configured) throw new Error("No Roboflow key. Put ROBOFLOW_API_KEY=... in snn-camera/.env and restart the launcher.");
        this.where = status.selfHosted === "this Mac" ? "this Mac" : status.selfHosted ? "your Roboflow server" : "Roboflow";
        this.ready = true;
      })().catch((err) => { this.loading = null; throw err; });
      return this.loading;
    }

    // Board mode: send a picture of the 3 x 3 view, get back the hole it sees (0-8), or null.
    async detectBoard(canvas, conf) {
      const best = (await this.ask("api/roboflow/board", canvas, conf))[0];
      const hole = best ? parseInt(String(best.name).replace(/\D/g, ""), 10) : NaN;   // "hole3" -> 3
      return hole >= 0 && hole <= 8 ? hole : null;
    }

    async ask(path, canvas, conf) {
      const start = performance.now();
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: canvas.toDataURL("image/jpeg", 0.85) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server said ${res.status}`);
      this.lastMs = performance.now() - start;
      return (data.boxes || [])
        .filter((b) => b.confidence >= conf)
        .map((b) => ({ x1: b.x - b.width / 2, y1: b.y - b.height / 2, x2: b.x + b.width / 2, y2: b.y + b.height / 2, score: b.confidence, name: b.class }));
    }
  }

  window.Roboflow = { RoboflowClient };
})();
