// YOLO brain: a YOLO model running right in the browser. Unlike the SNN, it looks at EVERY pixel of EVERY frame.
//   Click the Dot + webcam: the store-bought yolo11n from yoloAimPrototype1. It knows 80 everyday things
//     and calls the dot a "sports ball".
//   Board mode: models/board.onnx, trained on the 3 x 3 board view (dataset/make_samples.py). Its classes are
//     hole0 ... hole8, so what it finds = the hole to hit.
(function () {
  "use strict";

  const SIZE = 640;   // YOLO wants a 640 x 640 square picture
  const NAMES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
    "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
    "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard",
    "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
    "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone",
    "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
    "hair drier", "toothbrush",
  ];

  const BOARD_NAMES = Array.from({ length: 9 }, (_, i) => `hole${i}`);

  // Our 640 x 480 picture -> a 640 x 640 square with grey bars on top and bottom (like a movie on a TV).
  function preprocess(rgba, w, h) {
    const scale = Math.min(SIZE / w, SIZE / h);
    const nw = Math.round(w * scale), nh = Math.round(h * scale);
    const padX = Math.floor((SIZE - nw) / 2), padY = Math.floor((SIZE - nh) / 2);
    const plane = SIZE * SIZE;
    const data = new Float32Array(3 * plane).fill(114 / 255);   // grey bars
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const s = (Math.min(h - 1, Math.floor(y / scale)) * w + Math.min(w - 1, Math.floor(x / scale))) * 4;
        const d = (y + padY) * SIZE + (x + padX);
        data[d] = rgba[s] / 255;                 // red
        data[plane + d] = rgba[s + 1] / 255;     // green
        data[2 * plane + d] = rgba[s + 2] / 255; // blue
      }
    }
    return { data, scale, padX, padY };
  }

  // How much two boxes overlap (0 = not at all, 1 = the same box).
  function overlap(a, b) {
    const inter = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
    const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
    return union > 0 ? inter / union : 0;
  }

  // YOLO's raw answer is 8400 guesses. Keep the sure ones, drop doubles, give back boxes in our picture.
  function decode(out, guesses, { scale, padX, padY, w, h }, conf = 0.25, names = NAMES) {
    const found = [];
    for (let i = 0; i < guesses; i++) {
      let best = 0, cls = -1;
      for (let c = 0; c < names.length; c++) {   // which thing is it most sure about?
        const s = out[(4 + c) * guesses + i];
        if (s > best) { best = s; cls = c; }
      }
      if (best < conf) continue;       // not sure enough
      const cx = out[i], cy = out[guesses + i], bw = out[2 * guesses + i], bh = out[3 * guesses + i];
      found.push({
        x1: Math.max(0, (cx - bw / 2 - padX) / scale), y1: Math.max(0, (cy - bh / 2 - padY) / scale),
        x2: Math.min(w, (cx + bw / 2 - padX) / scale), y2: Math.min(h, (cy + bh / 2 - padY) / scale),
        score: best, cls, name: names[cls],
      });
    }
    found.sort((a, b) => b.score - a.score);
    // The same thing usually gets several boxes. Keep the best one of each pile.
    const kept = [];
    for (const box of found) {
      if (kept.length < 50 && kept.every((k) => k.cls !== box.cls || overlap(k, box) < 0.45)) kept.push(box);
    }
    return kept;
  }

  class Detector {
    constructor({ model = "models/yolo11n.onnx", names = NAMES } = {}) {
      this.model = model;
      this.names = names;
      this.session = null;
      this.loading = null;
      this.busy = false;
      this.lastMs = 0;
    }

    get ready() { return !!this.session; }

    // Load the AI engine (onnxruntime) and the model. Only works through the launcher, not a double-clicked file.
    load() {
      this.loading ??= (async () => {
        if (location.protocol === "file:") throw new Error('YOLO needs the launcher: double-click "Start SNN Camera.command".');
        if (!window.ort) {
          await new Promise((resolve, reject) => {
            const s = Object.assign(document.createElement("script"), { src: "vendor/onnxruntime-web/ort.wasm.min.js", onload: resolve });
            s.onerror = () => reject(new Error("Couldn't load the AI engine."));
            document.head.append(s);
          });
        }
        window.ort.env.wasm.wasmPaths = new URL("vendor/onnxruntime-web/", location.href).href;
        window.ort.env.wasm.numThreads = 1;
        this.session = await window.ort.InferenceSession.create(this.model, { executionProviders: ["wasm"] })
          .catch(() => { throw new Error(`Couldn't load ${this.model}. Is it there?`); });
      })().catch((err) => { this.loading = null; throw err; });
      return this.loading;
    }

    // Find things in a picture. Gives back boxes, most sure first.
    async detect(rgba, w, h, conf = 0.25) {
      const start = performance.now();
      const pre = preprocess(rgba, w, h);
      const input = new window.ort.Tensor("float32", pre.data, [1, 3, SIZE, SIZE]);
      const result = await this.session.run({ [this.session.inputNames[0]]: input });
      const out = result[this.session.outputNames[0]];
      this.lastMs = performance.now() - start;
      return decode(out.data, out.dims[2], { ...pre, w, h }, conf, this.names);
    }
  }

  const api = { Detector, preprocess, decode, NAMES, BOARD_NAMES };
  if (typeof module === "object") module.exports = api;   // so the tests can use it
  else window.YOLO = api;
})();
