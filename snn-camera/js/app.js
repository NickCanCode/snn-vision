// The app: runs the game or the webcam, feeds every frame to the picked brain, and draws everything.
//   Brains: SNN (only sees change), YOLO (sees everything, every frame), Roboflow (your trained dot model)
//   Things to look at: Click the Dot, or your webcam
(() => {
  "use strict";

  const W = 640, H = 480;            // every picture gets turned into 640 x 480 first, like the Python camera
  const CAMERA_FPS = 30;             // how often the brain looks at the game
  const DOT_TIMEOUT = 4000;          // if the brain never clicks a dot, give up on it after 4 seconds
  const AUTO_SWITCH = 20000;         // Auto-switch flips between game and webcam every 20 seconds
  const GRIDS = { "32x24": [32, 24], "64x48": [64, 48], "128x96": [128, 96] };
  const NAME = { snn: "SNN", yolo: "YOLO", roboflow: "Roboflow", you: "You" };

  // The SNN's screen follows "Reacts to": Darker = the original black dot on white (a new dot makes it darker),
  // Brighter or Any = a gold dot on a dark screen. YOLO and Roboflow always get black on white.
  const SCREENS = { dark: { background: "#1e1e1e", dotColor: "#ffff55" }, light: { background: "#ffffff", dotColor: "#000000" } };
  // Marker colours: bright ones for the dark screen, darker ones so they show up on white.
  const COLORS = {
    dark: { snn: "#55ff55", yolo: "#55ffff", roboflow: "#ffaa00", you: "#8fa8ff", miss: "#ff5555", gray: "#aaaaaa", shadow: "#000" },
    light: { snn: "#15803d", yolo: "#0e7490", roboflow: "#c2410c", you: "#1d4ed8", miss: "#dc2626", gray: "#6b7280", shadow: "#fff" },
  };

  // ---------- Settings (remembered next time you open the app) ----------
  const settings = {
    brain: "snn",
    grid: "64x48",
    threshold: 0.5,
    decay: 0.8,
    polarity: { game: "brighter", webcam: "any" },   // gold dot on dark = the screen gets BRIGHTER
    conf: { yolo: 0.05, roboflow: 0.25 },            // the store-bought YOLO is unsure about a plain dot, so it needs a low bar
    player: "ai",
    noise: 0,
    mirror: true,
    cameraId: "",
  };
  try { Object.assign(settings, JSON.parse(localStorage.getItem("snn-camera") || "{}")); } catch { /* fine, use defaults */ }
  const save = () => { try { localStorage.setItem("snn-camera", JSON.stringify(settings)); } catch { /* fine */ } };

  // ---------- Page bits ----------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const gameCanvas = $("#game-canvas"), viewCanvas = $("#view-canvas"), video = $("#video");
  const gameCtx = gameCanvas.getContext("2d"), viewCtx = viewCanvas.getContext("2d");
  const setText = (sel, text) => { if ($(sel).textContent !== text) $(sel).textContent = text; };
  const status = (text) => setText("#status", text);
  const message = (text) => { $("#view-message").textContent = text; $("#view-message").hidden = !text; };
  const ms = (t) => `${Math.max(0, Math.round(t))} ms`;

  // ---------- Clock that stops while paused (or while the tab is hidden) ----------
  let pausedAt = null, pausedTotal = 0, userPaused = false;
  const now = () => (pausedAt ?? performance.now()) - pausedTotal;
  const isPaused = () => userPaused || document.hidden;

  // ---------- The picture the brains look at ----------
  const frame = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const frameCtx = frame.getContext("2d", { willReadFrequently: true });

  // ---------- The SNN ----------
  const snn = new SNNCore.SpikingGrid({ threshold: settings.threshold, decay: settings.decay });
  let redFade, whiteFade, neuronPic, neuronCtx, neuronPixels;   // fading red/white so you can see them
  let lastTarget = null;   // where the brain last wanted to click, for the crosshair
  let lastFire = -1e9;

  function setGrid(key) {
    settings.grid = GRIDS[key] ? key : "64x48";
    const [gw, gh] = GRIDS[settings.grid];
    snn.configure({ gridW: gw, gridH: gh });
    redFade = new Float32Array(snn.size);
    whiteFade = new Float32Array(snn.size);
    neuronPic = Object.assign(document.createElement("canvas"), { width: gw, height: gh });
    neuronCtx = neuronPic.getContext("2d");
    neuronPixels = neuronCtx.createImageData(gw, gh);
    gridLines = null;
    setText("#neuron-count", `${gw} x ${gh} neurons`);
  }

  function runSNN(t) {
    const gray = SNNCore.toGray(frameCtx.getImageData(0, 0, W, H).data);
    const target = snn.step(gray, W, H);
    // Paint one pixel per neuron: green = charging, red = changed, white = fired.
    const d = neuronPixels.data;
    for (let i = 0; i < snn.size; i++) {
      redFade[i] = Math.max(redFade[i] * 0.72, Math.min(1, snn.events[i] * 4));   // fades over a few frames
      whiteFade[i] = snn.spikes[i] ? 1 : whiteFade[i] * 0.72;
      let r = 10, g = 10, b = 10;
      const mix = (k, cr, cg, cb) => { r += (cr - r) * k; g += (cg - g) * k; b += (cb - b) * k; };
      mix(Math.min(1, snn.v[i] / snn.threshold) * 0.8, 111, 191, 79);
      if (redFade[i] > 0.03) mix(redFade[i], 255, 90, 79);
      if (whiteFade[i] > 0.03) mix(whiteFade[i], 255, 255, 255);
      d.set([r, g, b, 255], i * 4);
    }
    neuronCtx.putImageData(neuronPixels, 0, 0);
    if (snn.spikeCount) lastFire = t;
    if (target) lastTarget = { ...target, at: t };
    return target;
  }

  // ---------- YOLO and Roboflow (the "detector" brains) ----------
  const detectors = { yolo: new YOLO.Detector(), roboflow: new Roboflow.RoboflowClient() };
  const detector = () => detectors[settings.brain];
  const detectorPic = Object.assign(document.createElement("canvas"), { width: W, height: H });   // the picture it last looked at
  let boxes = [], detectorError = "", round = 0, detectorDone = [];
  const roboflowOff = () => settings.brain === "roboflow" && mode === "webcam";   // it only knows dots, so no webcam

  function loadDetector() {
    const brain = settings.brain;
    detectorError = "";
    refresh();
    detector().load().then(refresh).catch((err) => {
      if (settings.brain === brain) { detectorError = err.message; refresh(); }
    });
  }

  // Ask the detector about the current picture (skipped if it's still busy with the last one).
  function runDetector(onBoxes) {
    const d = detector(), brain = settings.brain, myRound = round;
    if (!d.ready || d.busy || roboflowOff()) return;
    d.busy = true;
    const pic = frameCtx.getImageData(0, 0, W, H);
    d.detect(pic.data, W, H, settings.conf[brain]).then((found) => {
      if (myRound !== round || settings.brain !== brain) return;   // old answer, ignore it
      detectorPic.getContext("2d").putImageData(pic, 0, 0);
      boxes = found;
      detectorDone.push(now());
      if (found[0]) lastTarget = { x: (found[0].x1 + found[0].x2) / 2, y: (found[0].y1 + found[0].y2) / 2, at: now() };
      onBoxes(found);
    }).catch((err) => {
      message(`${NAME[brain]} failed: ${err.message}`);
      setTimeout(() => message(""), 3000);
    }).finally(() => { d.busy = false; });
  }

  // Start the brain over: forget charge, boxes, and bring a fresh dot.
  function resetBrain() {
    snn.reset();
    redFade.fill(0);
    whiteFade.fill(0);
    boxes = [];
    round++;
    lastTarget = null;
    if (mode === "game") freshDot();
  }

  // ---------- Click the Dot ----------
  const game = new ClickTheDotGame.ClickTheDot({ width: W, height: H });
  const score = Object.fromEntries(["snn", "yolo", "roboflow", "you"].map((k) => [k, { hits: 0, misses: 0, totalMs: 0 }]));
  let effects = [], nextLook = 0, watchedDot = { id: 0, ms: 0 };
  let ink = COLORS.dark;

  function freshDot() {
    // Wait a few frames first, so the SNN sees the empty screen (a dot it never saw "appear" is invisible to it).
    game.respawn(now(), Math.max(game.respawnDelay, 3 * 1000 / CAMERA_FPS));
    watchedDot = { id: 0, ms: 0 };
  }

  const effect = (e) => effects.push({ ...e, at: now() });

  // A dot just got clicked, so it's about to vanish. Tell the SNN to ignore that spot for a few frames,
  // otherwise "Any" would see the dot leaving as a new change and click the empty spot.
  const forgetDot = (dot) => snn.ignore(dot.x, dot.y, dot.r * 1.6, 3, W, H);

  function why(who, target) {
    if (who !== "snn") return `${NAME[who]}'s box wasn't on the dot by the time it clicked.`;
    const dot = game.dot;
    if (snn.polarity === "any" && (!dot || Math.hypot(target.x - dot.x, target.y - dot.y) > dot.r * 2)) return "That spot changed because a dot just left it.";
    if (game.noise) return "Enough noise piled up in one spot to make it fire.";
    return "Something changed there, but it wasn't the dot.";
  }

  // The brain wants to click (x, y). If it's playing it clicks. In "You play" it just shows where it would have.
  function brainClick(who, target, t) {
    const dot = game.dot;
    if (settings.player === "ai") {
      const res = game.click(target.x, target.y, t);
      if (res.hit) {
        Object.assign(score[who], { hits: score[who].hits + 1, totalMs: score[who].totalMs + res.reaction });
        forgetDot(res.dot);
        effect({ kind: "hit", who, dot: res.dot, label: `${NAME[who]} ${ms(res.reaction)}` });
        status(`${NAME[who]} clicked it ${ms(res.reaction)} after it showed up.`);
      } else {
        score[who].misses++;
        effect({ kind: "miss", x: target.x, y: target.y, label: "miss" });
        status(`Miss. ${why(who, target)}`);
      }
    } else if (dot && game.isOnDot(target.x, target.y)) {
      if (watchedDot.id === dot.id) return;   // already counted this dot
      watchedDot = { id: dot.id, ms: t - dot.bornAt };
      Object.assign(score[who], { hits: score[who].hits + 1, totalMs: score[who].totalMs + watchedDot.ms });
      effect({ kind: "ghost", who, dot, label: `${NAME[who]} ${ms(watchedDot.ms)}` });
      status(`${NAME[who]} saw it after ${ms(watchedDot.ms)}. Your turn.`);
    } else {
      score[who].misses++;
      effect({ kind: "miss", x: target.x, y: target.y, label: `${NAME[who]} miss` });
    }
    showScore();
  }

  function gameTick(t) {
    game.update(t);
    const who = settings.brain, dot = game.dot;

    // The brain is playing but never clicked this dot: give up on it.
    if (settings.player === "ai" && dot && t - dot.bornAt > DOT_TIMEOUT) {
      score[who].misses++;
      effect({ kind: "timeout", dot, label: "missed" });
      status(who === "snn"
        ? "The SNN never fired on that dot. It showed up once, then stayed still, and the SNN only sees change."
        : `${NAME[who]} never found that dot above ${settings.conf[who].toFixed(2)} confidence.`);
      game.respawn(t);
      showScore();
    }

    // Like a camera, the brain only looks 30 times a second.
    if (t < nextLook) return;
    nextLook = Math.max(nextLook + 1000 / CAMERA_FPS, t);
    game.draw(frameCtx);
    if (who === "snn") {
      const target = runSNN(t);
      if (target) brainClick("snn", target, now());
    } else {
      runDetector((found) => {
        const b = found[0];   // the box it's most sure about
        if (mode === "game" && b) brainClick(who, { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 }, now());
      });
    }
  }

  function youClick(e) {
    if (mode !== "game" || isPaused()) return;
    if (settings.player !== "you") return status(`${NAME[settings.brain]} is playing. Pick You play to take over.`);
    const r = gameCanvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    const res = game.click(x, y, now());
    if (res.hit) {
      Object.assign(score.you, { hits: score.you.hits + 1, totalMs: score.you.totalMs + res.reaction });
      forgetDot(res.dot);
      effect({ kind: "hit", who: "you", dot: res.dot, label: `You ${ms(res.reaction)}` });
      status(`You: ${ms(res.reaction)}.` + (watchedDot.id === res.dot.id ? ` ${NAME[settings.brain]}: ${ms(watchedDot.ms)}.` : ""));
    } else {
      score.you.misses++;
      effect({ kind: "miss", x, y, label: "miss" });
    }
    showScore();
  }

  function showScore() {
    for (const [who, s] of Object.entries(score)) {
      setText(`#${who}-hits`, String(s.hits));
      setText(`#${who}-misses`, String(s.misses));
      setText(`#${who}-avg`, s.hits ? ms(s.totalMs / s.hits) : "-");
    }
  }

  // ---------- Webcam ----------
  let stream = null, cameraState = "off", cameraTry = 0, wasQuiet = null;
  let frameHook = null;   // our "tell me when a new webcam picture comes in" request

  async function startCamera() {
    if (stream) return;
    const myTry = ++cameraTry;
    cameraState = "starting";
    refresh();
    try {
      if (!navigator.mediaDevices) throw Object.assign(new Error(), { name: "Insecure" });
      const want = settings.cameraId ? { deviceId: { exact: settings.cameraId } } : { facingMode: "user" };
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, ...want } })
        .catch((err) => (settings.cameraId ? navigator.mediaDevices.getUserMedia({ video: true }) : Promise.reject(err)));   // saved camera gone? use any
      if (myTry !== cameraTry || mode !== "webcam") return s.getTracks().forEach((tr) => tr.stop());   // you left webcam mode while it was starting
      stream = s;
      video.srcObject = s;
      await video.play().catch(() => {});
      cameraState = "on";
      resetBrain();
      onVideoFrame();
      listCameras();
    } catch (err) {
      if (myTry !== cameraTry) return;
      cameraState = {
        NotAllowedError: "Camera access is blocked. Allow it with the camera icon in the address bar, and in System Settings > Privacy & Security > Camera.",
        NotFoundError: "No camera found. Plug one in or connect your iPhone.",
        NotReadableError: "The camera is busy. Close the other app using it (Zoom, FaceTime, python camera.py).",
        Insecure: 'This page can\'t use the camera. Open it with "Start SNN Camera.command".',
      }[err.name] || `The camera didn't start. ${err.message}`;
    }
    refresh();
  }

  function stopCamera() {
    cameraTry++;
    stream?.getTracks().forEach((tr) => tr.stop());
    stream = null;
    if (frameHook !== null) video.cancelVideoFrameCallback(frameHook);   // otherwise the next camera start would run everything twice
    frameHook = null;
    video.srcObject = null;
    cameraState = "off";
  }

  async function listCameras() {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    $("#camera-select").replaceChildren(new Option("Default", ""), ...cams.map((c, i) => new Option(c.label || `Camera ${i + 1}`, c.deviceId)));
    $("#camera-select").value = settings.cameraId;
  }

  // Runs once for every new webcam picture.
  function onVideoFrame() {
    if (!stream) return;
    frameHook = video.requestVideoFrameCallback(onVideoFrame);
    if (mode !== "webcam" || isPaused()) return;
    if (settings.brain !== "snn" && (!detector().ready || detector().busy || roboflowOff())) return;

    // Crop the webcam to 4:3, flip it like a mirror if asked, squeeze it into 640 x 480.
    const vw = video.videoWidth, vh = video.videoHeight;
    const cw = Math.min(vw, vh * 4 / 3), ch = cw * 3 / 4;
    frameCtx.save();
    if (settings.mirror) { frameCtx.translate(W, 0); frameCtx.scale(-1, 1); }
    frameCtx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, W, H);
    frameCtx.restore();

    if (settings.brain === "snn") {
      runSNN(now());
      if ((snn.active === 0) !== wasQuiet) {
        wasQuiet = snn.active === 0;
        status(wasQuiet ? "Nothing is changing, so the SNN sees nothing. Move to light it up." : "Only the parts that changed light up.");
      }
    } else {
      runDetector((found) => {
        const names = [...new Set(found.map((b) => b.name))].slice(0, 4).join(", ");
        status(names ? `YOLO found: ${names}. It checks every pixel every frame, even when nothing moves.` : "YOLO found nothing it knows. It still checked every pixel.");
      });
    }
  }

  // ---------- Switching things ----------
  let mode = "game", autoSwitchAt = AUTO_SWITCH;

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    setPaused(false);
    snn.configure({ polarity: settings.polarity[mode] });
    autoSwitchAt = now() + AUTO_SWITCH;
    wasQuiet = null;
    if (mode === "webcam") startCamera();
    else { stopCamera(); status(`${NAME[settings.brain]} is watching the game.`); }
    resetBrain();
    refresh();
  }

  function setBrain(next) {
    if (next === settings.brain) return;
    settings.brain = next;
    save();
    resetBrain();
    if (next !== "snn") loadDetector();
    status({
      snn: "The SNN only reacts to what changes.",
      yolo: "YOLO looks at the whole picture every frame, changed or not.",
      roboflow: "Your trained dot model, on Roboflow. Every frame goes to the internet and back.",
    }[next]);
    refresh();
  }

  function setPaused(paused) {
    userPaused = paused;
    syncPause();
  }

  function syncPause() {
    if (isPaused() && pausedAt === null) pausedAt = performance.now();
    if (!isPaused() && pausedAt !== null) { pausedTotal += performance.now() - pausedAt; pausedAt = null; }
    if (stream) isPaused() ? video.pause() : video.play().catch(() => {});
    $("#pause-button").textContent = userPaused ? "Resume" : "Pause";
    $$(".paused-badge").forEach((b) => (b.hidden = !userPaused));
  }

  // Make every button, label and hidden bit match the current settings.
  function refresh() {
    const isGame = mode === "game", isSnn = settings.brain === "snn";
    const screen = isSnn && settings.polarity.game !== "darker" ? "dark" : "light";
    if (game.background !== SCREENS[screen].background) effects = [];
    Object.assign(game, SCREENS[screen]);
    ink = COLORS[screen];

    const press = (sel, key, value) => $$(sel).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[key] === value)));
    press(".tab", "mode", mode);
    press("#brain-switch button", "brain", settings.brain);
    press("#player-switch button", "player", settings.player);
    press("#polarity-switch button", "polarity", settings.polarity[mode]);

    gameCanvas.hidden = !isGame;
    video.hidden = isGame;
    video.classList.toggle("mirrored", settings.mirror);
    for (const [sel, show] of [["#player-switch", isGame], ["#score-table", isGame], ["#noise-control", isGame],
      ["#mirror-toggle", !isGame], ["#camera-control", !isGame], ["#snn-legend", isSnn], ["#detector-legend", !isSnn]]) $(sel).hidden = !show;
    $$(".snn-only").forEach((c) => (c.hidden = !isSnn));
    $$(".detector-only").forEach((c) => (c.hidden = isSnn));

    // Camera message (only in webcam mode, only when it isn't working)
    $("#camera-message").hidden = isGame || cameraState === "on";
    setText("#camera-message-title", cameraState === "starting" ? "Starting camera..." : cameraState === "off" ? "Camera is off" : "Camera problem");
    setText("#camera-message-body", ["starting", "off", "on"].includes(cameraState) ? "" : cameraState);
    $("#camera-retry").hidden = cameraState === "starting";

    // Message over the brain's view
    if (isSnn) message("");
    else if (roboflowOff()) message("The Roboflow model only knows Click the Dot. Use SNN or YOLO for the webcam.");
    else message(detectorError || (detector().ready ? "" : `Loading ${NAME[settings.brain]}...`));

    setText("#input-title", isGame ? "Click the Dot" : "Webcam");
    setText("#view-title", `What ${isSnn ? "the SNN" : NAME[settings.brain]} sees`);
    setText("#ai-plays", `${NAME[settings.brain]} plays`);
    for (const b of ["snn", "yolo", "roboflow"]) setText(`#${b}-col`, NAME[b] + (settings.player === "you" && settings.brain === b ? " (watching)" : ""));

    // Knob values
    $("#threshold").value = settings.threshold;
    setText("#threshold-out", settings.threshold.toFixed(2));
    $("#decay").value = settings.decay;
    setText("#decay-out", `${Math.round(settings.decay * 100)}%`);
    $("#grid-select").value = settings.grid;
    const conf = settings.conf[settings.brain] ?? 0.25;
    $("#conf").value = conf;
    setText("#conf-out", conf.toFixed(2));
    $("#noise").value = settings.noise;
    setText("#noise-out", settings.noise ? `${Math.round(settings.noise * 100)}%` : "off");
    $("#mirror").checked = settings.mirror;
  }

  // ---------- Drawing ----------
  let gridLines = null;

  function fit(canvas) {   // make the canvas sharp on retina screens
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    gridLines = null;
  }

  function label(ctx, text, x, y, color) {
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const half = ctx.measureText(text).width / 2;
    x = Math.min(W - half - 6, Math.max(half + 6, x));   // keep it on screen
    ctx.fillStyle = ink.shadow;
    ctx.fillText(text, x + 2, y + 2);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawGame(t) {
    if (gameCanvas.hidden) return;
    const ctx = gameCtx;
    ctx.setTransform(gameCanvas.width / W, 0, 0, gameCanvas.height / H, 0, 0);
    game.draw(ctx);

    // Rings, X's and labels that fade out after a click
    effects = effects.filter((e) => t - e.at < 900);
    for (const e of effects) {
      const k = Math.max(0, (t - e.at) / 900), color = e.kind === "miss" ? ink.miss : e.kind === "timeout" ? ink.gray : ink[e.who];
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      const { x = e.dot?.x, y = e.dot?.y } = e, r = e.dot?.r ?? 10;
      ctx.beginPath();
      if (e.kind === "hit" || e.kind === "timeout") {            // a fading copy of the dot + a growing ring
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.fillStyle = game.dotColor;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.arc(x, y, r + 4 + k * 26, 0, Math.PI * 2);
      } else if (e.kind === "ghost") {                           // dashed ring: where the brain WOULD have clicked
        ctx.setLineDash([6, 5]);
        ctx.arc(x, y, r + 8, 0, Math.PI * 2);
      } else {                                                    // a miss: an X
        ctx.moveTo(x - 8, y - 8); ctx.lineTo(x + 8, y + 8);
        ctx.moveTo(x + 8, y - 8); ctx.lineTo(x - 8, y + 8);
      }
      ctx.stroke();
      label(ctx, e.label, x, y - r - 18 > 10 ? y - r - 18 : y + r + 18, color);
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawView(t) {
    const c = viewCanvas, ctx = viewCtx;
    if (settings.brain === "snn") {
      // The neurons, blown up into big blocks, with thin lines between them.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(neuronPic, 0, 0, c.width, c.height);
      if (!gridLines && c.width / snn.gridW >= 5) {
        gridLines = Object.assign(document.createElement("canvas"), { width: c.width, height: c.height });
        const g = gridLines.getContext("2d");
        g.fillStyle = "rgba(0,0,0,.6)";
        for (let i = 1; i < snn.gridW; i++) g.fillRect(Math.round(i * c.width / snn.gridW), 0, 1, c.height);
        for (let j = 1; j < snn.gridH; j++) g.fillRect(0, Math.round(j * c.height / snn.gridH), c.width, 1);
      }
      if (gridLines) ctx.drawImage(gridLines, 0, 0);
    } else {
      // The whole picture (because that's what YOLO looks at) with a box around everything it found.
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(detectorPic, 0, 0, c.width, c.height);
      const sx = c.width / W, sy = c.height / H, font = Math.max(9, Math.round(c.width / 70));
      ctx.lineWidth = Math.max(2, c.width / 300);
      ctx.font = `${font}px "Press Start 2P", monospace`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      for (const b of boxes) {
        const color = mode === "game" ? ink[settings.brain] : "#ffff55";
        ctx.strokeStyle = color;
        ctx.strokeRect(b.x1 * sx, b.y1 * sy, (b.x2 - b.x1) * sx, (b.y2 - b.y1) * sy);
        const text = `${b.name} ${Math.round(b.score * 100)}%`, ly = Math.max(0, b.y1 * sy - font - 8);
        ctx.fillStyle = "#000";
        ctx.fillRect(b.x1 * sx, ly, ctx.measureText(text).width + 8, font + 8);
        ctx.fillStyle = "#ffff55";
        ctx.fillText(text, b.x1 * sx + 4, ly + 4);
      }
    }
    // Crosshair where the brain wants to click
    if (lastTarget && t - lastTarget.at < 450) {
      const x = lastTarget.x / W * c.width, y = lastTarget.y / H * c.height, r = c.width / 20;
      ctx.save();
      ctx.globalAlpha = 1 - (t - lastTarget.at) / 450;
      ctx.strokeStyle = settings.brain === "snn" ? "#ffff55" : ink[settings.brain];
      ctx.lineWidth = Math.max(2, c.width / 300);
      ctx.beginPath();
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
      ctx.stroke();
      ctx.restore();
    }
  }

  // The little badge in the corner + the YOLO/Roboflow speed line.
  function drawBadge(t) {
    const d = detector();
    let state;
    if (mode === "webcam" && cameraState !== "on") state = "No input";
    else if (roboflowOff()) state = "Off";
    else if (d) state = !d.ready ? (detectorError ? "Error" : "Loading") : boxes.length ? `Found ${boxes.length}` : "Nothing";
    else state = t - lastFire < 250 ? "Firing" : snn.active ? "Seeing change" : "Quiet";
    setText("#network-chip", state);
    $("#network-chip").className = `badge ${state === "Firing" || state.startsWith("Found") ? "firing" : state === "Seeing change" ? "seeing" : ""}`;
    if (d?.ready) {
      detectorDone = detectorDone.filter((x) => x > t - 1000);
      const what = settings.brain === "yolo" ? "every pixel, every frame" : "trained on the dot, runs on Roboflow";
      setText("#detector-info", `${what} · ${Math.round(d.lastMs)} ms a frame · ${detectorDone.length} fps`);
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    const t = now();
    if (!isPaused()) {
      if (mode === "game") gameTick(t);
      if ($("#auto-switch").checked && t >= autoSwitchAt) setMode(mode === "game" ? "webcam" : "game");
    }
    setText("#auto-countdown", $("#auto-switch").checked ? `${Math.max(0, Math.ceil((autoSwitchAt - t) / 1000))}s` : "");
    drawGame(t);
    drawView(t);
    drawBadge(t);
  }

  // ---------- Buttons, sliders and keys ----------
  const onClick = (sel, fn) => $(sel).addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) fn(b.dataset, b); });
  const change = (fn) => { fn(); save(); refresh(); };

  $$(".tab").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  onClick("#brain-switch", (d) => setBrain(d.brain));
  $("#pause-button").addEventListener("click", () => setPaused(!userPaused));
  $("#auto-switch").addEventListener("change", () => (autoSwitchAt = now() + AUTO_SWITCH));
  onClick("#player-switch", (d) => change(() => { settings.player = d.player; freshDot(); }));
  onClick("#polarity-switch", (d) => change(() => {
    settings.polarity[mode] = d.polarity;
    snn.configure({ polarity: d.polarity });
    if (mode === "game") freshDot();   // a dot the SNN already saw would just sit there
  }));
  $("#threshold").addEventListener("input", (e) => change(() => snn.configure({ threshold: (settings.threshold = +e.target.value) })));
  $("#decay").addEventListener("input", (e) => change(() => snn.configure({ decay: (settings.decay = +e.target.value) })));
  $("#grid-select").addEventListener("change", (e) => change(() => { setGrid(e.target.value); resetBrain(); }));
  $("#conf").addEventListener("input", (e) => change(() => (settings.conf[settings.brain] = +e.target.value)));
  $("#noise").addEventListener("input", (e) => change(() => (game.noise = settings.noise = +e.target.value)));
  $("#reset-neurons").addEventListener("click", resetBrain);
  $("#neuron-defaults").addEventListener("click", () => change(() => {
    Object.assign(settings, { threshold: 0.5, decay: 0.8 });
    settings.polarity[mode] = mode === "game" ? "brighter" : "any";
    snn.configure({ threshold: 0.5, decay: 0.8, polarity: settings.polarity[mode] });
    setGrid("64x48");
    resetBrain();
  }));
  $("#mirror").addEventListener("change", (e) => change(() => { settings.mirror = e.target.checked; resetBrain(); }));
  $("#camera-retry").addEventListener("click", startCamera);
  $("#camera-select").addEventListener("change", (e) => change(() => { settings.cameraId = e.target.value; stopCamera(); startCamera(); }));
  gameCanvas.addEventListener("pointerdown", youClick);

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.target.tagName === "SELECT") return;
    const keys = { 1: () => setMode("game"), 2: () => setMode("webcam"), s: () => setBrain("snn"), y: () => setBrain("yolo"),
      b: () => setBrain("roboflow"), r: resetBrain, p: () => setPaused(!userPaused), " ": () => setPaused(!userPaused) };
    const fn = keys[e.key.toLowerCase()];
    if (!fn || (e.key === " " && ["BUTTON", "INPUT"].includes(e.target.tagName) && e.target.type !== "range")) return;
    e.preventDefault();
    fn();
  });
  // After clicking a button with the mouse, let go of it, so Space pauses instead of pressing it again.
  document.addEventListener("click", (e) => { if (e.detail) e.target.closest("button")?.blur(); });
  document.addEventListener("visibilitychange", syncPause);
  const watcher = new ResizeObserver(() => { fit(gameCanvas); fit(viewCanvas); });   // window resized? re-sharpen
  watcher.observe(gameCanvas);
  watcher.observe(viewCanvas);

  // ---------- Go! ----------
  snn.configure({ polarity: settings.polarity.game });
  game.noise = settings.noise;
  setGrid(settings.grid);
  fit(gameCanvas);
  fit(viewCanvas);
  freshDot();
  if (settings.brain !== "snn") loadDetector();
  status(`${NAME[settings.brain]} is watching the game.`);
  refresh();
  showScore();
  requestAnimationFrame(loop);

  // For poking at it from the browser console (and for the automatic checks).
  window.snnCamera = { snn, game, score, settings, detectors, setMode, setBrain, setPaused, resetBrain,
    get mode() { return mode; }, get cameraState() { return cameraState; } };
})();
