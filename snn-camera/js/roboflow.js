// Roboflow brain: YOUR trained Click the Dot model (the one yolo_bot.py uses), living on Roboflow's computers.
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
      this.canvas = document.createElement("canvas");
    }

    // Check that server.py is running and has a key.
    load() {
      this.loading ??= (async () => {
        const status = await fetch("api/roboflow/status").then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!status) throw new Error('Roboflow needs the launcher: double-click "Start SNN Camera.command".');
        if (!status.configured) throw new Error("No Roboflow key. Put ROBOFLOW_API_KEY=... in snn-camera/.env and restart the launcher.");
        this.ready = true;
      })().catch((err) => { this.loading = null; throw err; });
      return this.loading;
    }

    // Send one picture, get back boxes (same shape as YOLO's), most sure first.
    async detect(rgba, w, h, conf = 0.25) {
      const start = performance.now();
      Object.assign(this.canvas, { width: w, height: h });
      this.canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
      const res = await fetch("api/roboflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: this.canvas.toDataURL("image/jpeg", 0.85) }),
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
