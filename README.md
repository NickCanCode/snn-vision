# SNN Vision (Code Name: Wack-a-Fly)

Made by **Nick** ([@NickCanCode](https://github.com/NickCanCode)) for a Neuromorphic Computing class.

It shows two very different ways a computer can "see":

- **SNN** (spiking neural network). Works kind of like your brain. It only notices things that **change**.
- **YOLO**. A normal AI that looks at **the whole picture, every single time**, even if nothing happened.

This is the **SNN Vision app** (in `snn-camera/`). Watch the brains play a game called Click the Dot, or point them at your webcam.

It's derived from my other project, **[Wack-a-Fly](https://github.com/NickCanCode/wack-a-fly)**, where a camera watches a board with 9 LED holes and a robot arm hits whichever one lights up. The SNN in this app is a translation of that project's Python SNN, which is kept here in `snn/snn_core.py` so the app can be checked against it.

---

## So whats the big deal?

Imagine staring at a wall. Nothing happens. Then a fly lands on it.

- **YOLO** is like someone who takes a photo of the wall 30 times a second and studies **every inch** of every photo, looking for flies. Boring wall? Still studies every inch. That's a lot of work for nothing.
- **The SNN** is like your eyes. You don't study the wall. You just **notice the fly move**. If nothing changes, you do nothing.

That's it. That's the whole project.

---

## How the SNN actually works (4 steps)

Every time a new picture comes in, the SNN does this:

**1. Squish the picture.**
The picture gets shrunk into a grid of 64 x 48 squares (3,072 squares total). Each square is one **neuron**.

**2. Look only at what changed.**
Each neuron compares its square to last time: "did my spot just get brighter (or darker)?" No change = it gets nothing. A change = it gets an **event** (shown in **red** in the app).

**3. Charge up, and leak.**
Every neuron has a **charge**, like a bucket filling with water. Each frame:

```
charge = charge x 0.8 + event
```

The `x 0.8` is the **leak**: the bucket has a hole, so old water slowly drains out. The `+ event` is new water pouring in.

**4. Fire!**
When a bucket gets to 0.5 full, the neuron **fires** (shown in **white** in the app) and its bucket empties back to 0. The SNN clicks the middle of all the neurons that fired.

### Why the leak matters

The leak is how the SNN ignores junk (like flickery light) but still catches real stuff:

| What happens in a square | Bucket over a few frames | Fires? |
|---|---|---|
| Something big appears (event 0.8) | 0.8 | Yes, right away |
| Medium change twice (event 0.3) | 0.3, then 0.54 | Yes, on the 2nd frame |
| Tiny flicker every frame (event 0.05) | creeps up but never past 0.25 | Never |
| Thing just sits there (no change) | drains back to 0 | No |

That last row is the weird part: **once something stops moving, the SNN can't see it anymore.** It noticed it showing up, and that's all it needs.

---

## The app

### Open it

Double-click **`snn-camera/Start SNN Camera.command`** in Finder. It opens in its own window. **Keep the Terminal window that pops up open** while you use it (closing it turns the app off).

(You can also just open `snn-camera/index.html` in Chrome. The SNN works that way, but YOLO and Roboflow need the launcher.)

### The buttons

- **Click the Dot / Webcam** (top): what the brain looks at.
- **SNN / YOLO / Roboflow** (top): which brain.
  - **SNN**: the change-only brain. The screen it plays depends on **Reacts to** (see below).
  - **YOLO**: the normal "look at everything" AI (`yolo11n`, from my earlier aim prototype). It's the store-bought version, so it doesn't really know what a dot is. It thinks it's a "sports ball". Plays the original black dot on white.
  - **Roboflow**: **my own trained** dot finder (the one from my earlier aim prototype). It lives on Roboflow's computers on the internet, so it's the slowest. Game only.
- **SNN plays / You play**: let the brain play, or play yourself and compare times.
- **Auto-switch**: flips between game and webcam every 20 seconds (good for leaving it running at a demo table).
- **Reacts to** (SNN only): which kind of change the neurons care about.
  - **Darker**: a spot getting darker. You get the original game, a black dot on white. A new dot makes its spot darker, so the SNN catches it. (This is how the Python SNN bot from Wack-a-Fly plays the real game.)
  - **Brighter**: a spot getting brighter. You get a gold dot on a dark screen. A new dot makes its spot brighter. (This is how Wack-a-Fly watches its LEDs turn on.)
  - **Any**: both, like a real "event camera". Same dark screen. A dot leaving is a change too, so after each click the SNN ignores that spot for a moment (it knows the dot is about to vanish there). This is the webcam's setting.
- **Threshold, Charge kept, Neurons** (SNN only): mess with the 4 steps above.
- **Confidence** (YOLO and Roboflow only): how sure it has to be before it clicks.
- **Screen noise**: adds flickery specks to the game.

Keys: `1` / `2` game or webcam, `S` / `Y` / `B` pick a brain, `Space` pause, `R` reset.

### What you'll see

On the right, **"What the SNN sees"**: black = nothing happening, **red** = that spot changed, **white** = a neuron fired, **green** = a neuron charging up. For YOLO/Roboflow you see the whole picture with boxes around what it found.

Rough speeds (time from a dot appearing to getting clicked):

| Brain | About |
|---|---|
| SNN | 20 ms |
| YOLO | 150 ms (it chews through every pixel) |
| Roboflow | 300 to 500 ms (the picture goes over the internet and back) |
| You | 300 to 1000 ms |

### Fun things to try

- **SNN, Reacts to: Any.** Watch the right side. When a dot shows up you get red (changed) and white (fired). When it's clicked away you get red again, because that's a change too, but no white: the SNN was told to ignore that spot, so it doesn't click the empty space.
- **SNN, Threshold above 1.0.** New dots can't fill the bucket enough to fire, and a still dot never changes again, so the SNN misses them all.
- **Screen noise at about half.** Tons of red, almost no white: the leak drains the flicker. At full noise the specks pile up and it starts missing.
- **Webcam, hold totally still.** The SNN view goes black, even though the camera can still see you.

### Roboflow setup (only needed once)

Your Roboflow key goes in `snn-camera/.env` like this:

```
ROBOFLOW_API_KEY=your_key_here
```

(Find it at app.roboflow.com/settings/api. **Never share or upload this file.** It's like a password.) Then restart the launcher. Each picture costs a little bit of your Roboflow credits, about 3 a second while it plays.

---

## What every file is

| File | What it does |
|---|---|
| `snn/snn_core.py` | The original Python SNN from Wack-a-Fly (the 4 steps above). The app's SNN is checked against it |
| `snn-camera/Start SNN Camera.command` | Double-click to open the app |
| `snn-camera/server.py` | The app's little server. Hands out the app and talks to Roboflow (keeps your key secret) |
| `snn-camera/index.html`, `styles.css` | The app's page and Minecraft look |
| `snn-camera/js/snn.js` | The SNN brain again, same steps, in JavaScript so it runs in the browser |
| `snn-camera/js/yolo.js` | Runs YOLO in the browser |
| `snn-camera/js/roboflow.js` | Sends pictures to Roboflow (through `server.py`) |
| `snn-camera/js/game.js` | Click the Dot |
| `snn-camera/js/app.js` | Runs everything: the game, the webcam, the drawing, the buttons |
| `snn-camera/models/yolo11n.onnx` | The YOLO model file (made from `yolo11n.pt`) |
| `snn-camera/vendor/` | The engine that runs YOLO in the browser (onnxruntime, free to use) |
| `snn-camera/fonts/`, `textures/`, `icons/` | Pixel fonts, dirt and grass pictures, the app icon |
| `snn-camera/tests/` | Automatic checks (see below) |

### Checking it still works

```bash
cd snn-camera
node --test tests/*.test.js         # checks the SNN and YOLO code (the SNN one also checks it matches the Python brain)
python3 tests/roboflow_smoke.py     # checks your Roboflow model answers (needs internet + key)
```

---

## If something's broken

- **The app opens blank or half-empty.** Your Mac's disk is almost full, so macOS moves files to iCloud and leaves empty placeholders. The launcher tries to pull them back, but the real fix is freeing up disk space.
- **YOLO or Roboflow says "needs the launcher".** You opened `index.html` directly. Use `Start SNN Camera.command` instead.
- **Roboflow says "No Roboflow key".** Put your key in `snn-camera/.env` (see above) and restart the launcher.
- **Webcam says it's blocked.** Click the camera icon in the address bar and allow it. Also check System Settings > Privacy & Security > Camera.
- **Webcam says it's busy.** Another app is using it (Zoom, FaceTime, ...). Close that.

---

## Words

- **Frame**: one picture from the camera.
- **Pixel**: one dot in that picture.
- **Neuron**: one square in the SNN's grid.
- **Event**: a square that changed since last time (red).
- **Charge**: how full a neuron's bucket is.
- **Leak**: the bucket slowly draining (it keeps 80% each frame).
- **Threshold**: how full the bucket has to be to fire (0.5).
- **Spike / fire**: a neuron going off (white). Its bucket then empties.
- **Confidence**: how sure YOLO or Roboflow is about what it found (0 to 1).
- **Neuromorphic**: computer chips built to work like brains, only doing work when something changes. (Ours runs on a normal laptop, so it still checks every square. A real neuromorphic chip wouldn't.)

---

## AI use (partial generative AI disclosure)

Parts of this project were made with help from generative AI (Claude, by Anthropic). Here's the honest split:

**What I (Nick) did:** the idea and the research direction. Comparing an SNN with YOLO, how the SNN should see (only change, leak, threshold), using Click the Dot and the Wack-a-Fly board to test it, and training the Roboflow dot model. I also did the thinking behind the project and made the decisions along the way: what to build, what to keep or cut, how it should look, and checking that it actually made sense.

**What the AI helped with:** writing and cleaning up a lot of the code, especially the SNN Camera app (the browser translation of the SNN logic, ensuring secure and effective YOLO and Roboflow integration, adding a 'Minecraft' inspired theme), rapidly executing the automatic tests, answering questions and explaining new concepts, and drafting this README from my notes.

The AI worked from my directions, and I reviewed, tested, and altered what it made. The SNN in the app is checked against my original Python version (`snn/snn_core.py`) to make sure it gives the same answers.
