# SNN Vision (Code Name: Wack-a-Fly)

Made by **Nick** ([@NickCanCode](https://github.com/NickCanCode)) for a Neuromorphic Computing class.

It shows two very different ways a computer can "see":

- **SNN** (spiking neural network). Works kind of like your brain. It only notices things that **change**.
- **YOLO**. A normal AI that looks at **the whole picture, every single time**, even if nothing happened.

This is the **SNN Vision app** (in `snn-camera/`). It has three modes:

- **Click the Dot**: a dot pops up and the brains race to click it.
- **Webcam**: point the brains at the real world and see what each one notices.
- **Board**: the physical Wack-a-Fly board. A hole lights up, a brain spots it through a camera, and a robot arm goes and taps it.

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

## Run it yourself

### What you need

| Thing | Why | Needed for |
|---|---|---|
| **Google Chrome** | runs the app (and is the browser allowed to talk to Arduinos) | everything |
| **Python 3** (`python3`, comes with most Macs) | runs the app's little server | YOLO, Roboflow, the real board |
| **Node.js** | runs the automatic checks | only `tests/` |
| **Python 3.12** + Roboflow's package | runs the Roboflow board model on your computer | only the Roboflow brain (see below) |
| **Arduino IDE** | puts the sketches on the 2 Arduinos | only the real board |

### Get it and open it

```bash
git clone https://github.com/NickCanCode/snn-vision.git
cd snn-vision/snn-camera
```

- **Mac:** double-click **`snn-camera/Start SNN Camera.command`** in Finder. It opens the app in its own Chrome window. **Keep the Terminal window that pops up open** while you use it (closing it turns the app off). If macOS says it can't open it, right-click it > **Open** once, or run `chmod +x "Start SNN Camera.command"`.
- **Windows / Linux (or by hand):** run `python3 server.py` in `snn-camera`, then open **http://127.0.0.1:8765** in Chrome.

That's enough for **Click the Dot** and **Webcam** with the SNN and YOLO, and the **Board** mode simulator with the SNN and Frame-based. No accounts, no keys, nothing to install.

(You can also just open `snn-camera/index.html` in Chrome. The SNN works that way, but YOLO, Roboflow and the Arduinos need the server.)

### Turn on the Roboflow brain (Board mode, optional)

The Roboflow brain is a model trained on the board view (hole0 to hole8). It runs **on your own computer** with Roboflow's Python package: no internet after the first download, about 45 ms a picture.

1. Put your Roboflow key in `snn-camera/.env` (copy `.env.example`). Find the key at app.roboflow.com/settings/api. **Never share or upload this file.** It's like a password.
2. Make the app its own Python 3.12 venv with Roboflow's package in it (about 2 GB, so it doesn't mess with your other Python stuff):
   ```bash
   cd snn-camera
   python3.12 -m venv .venv.nosync
   ln -s .venv.nosync .venv
   .venv/bin/pip install inference
   ```
   (The `.nosync` name stops iCloud from moving the venv off your Mac if the project is in Documents or Desktop. `.venv` is just a shortcut to it.)
3. In `snn-camera/.env`, add:
   ```
   ROBOFLOW_LOCAL=1
   ROBOFLOW_BOARD_MODEL=yerrrrrrrrrr/1
   ```
   `yerrrrrrrrrr/1` is my model and it's private, so **use your own** `project/version` (see **Training your own board model** below).
4. Restart the launcher. It uses `.venv` automatically when it's there. In Board mode, press **Roboflow**.

Leave out `ROBOFLOW_LOCAL=1` to use Roboflow's cloud instead (no venv needed, but every frame goes over the internet).

---

## The app

### The buttons

- **Click the Dot / Webcam / Board** (top): what the brain looks at. Board = the real Wack-a-Fly board (see **Physical demo** below).
- **SNN / YOLO** (top): which brain. Board mode also has **Roboflow** and **Frame-based**.
  - **SNN**: the change-only brain. The screen it plays depends on **Reacts to** (see below).
  - **YOLO**: the normal "look at everything" AI (`yolo11n`, from my earlier aim prototype). It's the store-bought version, so it doesn't really know what a dot is. It thinks it's a "sports ball". Plays the original black dot on white.
- **Theme** (top right): Minecraft, Light, Dark or NuVu. Only the page changes, not the game.
- **?** (top right): a quick table of how every brain works in every mode.
- **SNN plays / You play**: let the brain play, or play yourself and compare times.
- **Auto-switch**: flips between game and webcam every 20 seconds (good for leaving it running at a demo table).
- **Reacts to** (SNN only): which kind of change the neurons care about.
  - **Darker**: a spot getting darker. You get the original game, a black dot on white. A new dot makes its spot darker, so the SNN catches it. (This is how the Python SNN bot from Wack-a-Fly plays the real game.)
  - **Brighter**: a spot getting brighter. You get a gold dot on a dark screen. A new dot makes its spot brighter. (This is how Wack-a-Fly watches its LEDs turn on.)
  - **Any**: both, like a real "event camera". Same dark screen. A dot leaving is a change too, so after each click the SNN ignores that spot for a moment (it knows the dot is about to vanish there). This is the webcam's setting.
- **Threshold, Charge kept, Neurons** (SNN only): mess with the 4 steps above.
- **Confidence** (YOLO only): how sure it has to be before it clicks.
- **Screen noise**: adds flickery specks to the game.

Keys: `1` / `2` / `3` game, webcam or board, `S` / `Y` / `B` / `F` pick a brain (`B` = Roboflow, `F` = Frame-based, Board only), `T` next theme, `H` help, `Space` pause, `R` reset.

### What you'll see

On the right, **"What the SNN sees"**: black = nothing happening, **red** = that spot changed, **white** = a neuron fired, **green** = a neuron charging up. For YOLO you see the whole picture with boxes around what it found.

Rough speeds (time from a dot appearing to getting clicked):

| Brain | About |
|---|---|
| SNN | 20 ms |
| YOLO | 150 ms (it chews through every pixel) |
| You | 300 to 1000 ms |

### Fun things to try

- **SNN, Reacts to: Any.** Watch the right side. When a dot shows up you get red (changed) and white (fired). When it's clicked away you get red again, because that's a change too, but no white: the SNN was told to ignore that spot, so it doesn't click the empty space.
- **SNN, Threshold above 1.0.** New dots can't fill the bucket enough to fire, and a still dot never changes again, so the SNN misses them all.
- **Screen noise at about half.** Tons of red, almost no white: the leak drains the flicker. At full noise the specks pile up and it starts missing.
- **Webcam, hold totally still.** The SNN view goes black, even though the camera can still see you.

---

## Physical demo (the real board + arm)

The **Board** tab plays Wack-a-Fly for real. The computer runs the game, and the board just shows it:

1. The computer lights a hole (on screen **and** on the real board).
2. The brain spots it through the camera.
3. The arm goes to that hole.
4. The hall sensor on the arm's tip touches the magnet inside the hole: that's the confirmation. The light goes off and the round is scored.

The score shows both times: **Avg time** (light on -> brain saw it) and **Avg touch** (light on -> the arm's tip touched it). A round only counts as a hit if the arm went to the right hole **and** touched.

### How the brain sees the board

1. The camera picture gets **chopped into 9 squares**, one around each light.
2. Each square gets **zoomed in** and turned **black and white** (only the bright LED stays white).
3. The 9 squares get glued into one **3 x 3 picture** (that's what you see on the right).
4. Whichever square the white light dot is in = the hole to hit.

The boxes around the holes on the left are what gets cut out. **Drag a box** to move it onto its hole, and use the **Box size** slider to make all 9 bigger or smaller (just big enough for the LED's glow; if boxes overlap, one hole's light leaks into its neighbor).

Four brains can play:

- **SNN**: only reacts when a light turns **on** (a square suddenly gets brighter). A light that stays on is old news.
- **Frame-based**: a hand-written rule. Checks **all 9 squares, every single frame**, and picks the one that's clearly whitest.
- **Roboflow**: my trained board model (see **Run it yourself** to turn it on). Looks at the **whole 3 x 3 picture, every frame**, and answers hole0 to hole8. Runs on this computer, about 45 ms a picture.
- **YOLO**: meant to run a board model right in the browser, but there's no trained `models/board.onnx` yet, so use Roboflow for now.

**You play** (Simulator only): a hole lights up and you click it. If the real board is plugged in, it lights up too.

### What you need

| Thing | Sketch to upload (Arduino IDE) |
|---|---|
| Board Arduino: 9 LEDs on pins 2 to 10, a magnet inside each hole | `arduino/board/board.ino` (check the wiring first with `arduino/board_test/board_test.ino`) |
| Arm Arduino: shoulder servo on pin 3, elbow servo on pin 5, lift servo on pin 6, hall sensor (on/off kind) on the tip on pin 9 | `arduino/arm/arm.ino` |
| A camera pointed at the board | (none) |

Plug both Arduinos into the computer with USB.

**It only works in Chrome**, opened with `Start SNN Camera.command` (Chrome is the browser that's allowed to talk to Arduinos).

### First time with the real board

1. Open the app, press the **Board** tab, then **Camera**.
2. Press **Board** and **Arm** under "Arduinos". Each time Chrome shows a list: pick that Arduino. (They light up gold when connected.)
3. Press **Set holes**, then click the middle of each hole on the camera picture, in order: 0 1 2 across the top row, then 3 4 5, then 6 7 8.
4. Press **Calibrate arm**. It says "This is hole 0" (and lights it): drag **Shoulder** and **Elbow** until the tip is over the hole, lower **Lift** until it says "Touching the magnet", then press **Next hole**. Do all 9. Each hole is saved on the arm Arduino itself (it keeps them when unplugged), so you only redo this if the arm or board gets moved.
5. Pick a brain (**SNN**, **Frame-based** or **Roboflow**) and press **Start**.

No camera? Pick **Simulator** instead of Camera: the brain watches a drawn board instead. Whatever is plugged in still plays along: the real board lights the same hole as the screen, and the real arm moves (if "Use arm" is on). With nothing plugged in, a pretend arm does it on screen (the grey dot is the arm's tip).

**About the wiring:** the code calls the holes 0 to 8 starting **top left**. My board's lights are numbered 1 to 9 starting **bottom left**, like a number pad (pin 2 = bottom left). `board.ino` lists the pins in the code's order (`{8, 9, 10, 5, 6, 7, 2, 3, 4}`), so the wires don't have to move. If yours is wired differently, change that list (and the same one in `board_test.ino`).

### Training your own board model

`dataset/make_samples.py` makes practice pictures that look exactly like the right-hand board view (grid, numbers, lumpy white LED blobs, sometimes the yellow "picked" border, some dark boards and glare specks), already labeled hole0 to hole8:

```bash
python dataset/make_samples.py          # needs numpy + opencv-python; makes 1,800 pictures in dataset/board-grid
python dataset/make_samples.py --count 5000 --out ~/Downloads/board-dataset
```

Upload the folder (or a zip of it) to a Roboflow **object detection** project, create a version, and train. **Don't add flip, rotate, crop or mosaic augmentations**: the hole number depends on *where* the light is, so moving the picture around would give it the wrong label. Then put your `project/version` in `ROBOFLOW_BOARD_MODEL`.

(Tip: if your project lives in an iCloud-synced folder like Documents and your disk is nearly full, write the pictures somewhere else, like `~/Downloads`. Otherwise macOS moves them to iCloud and everything that reads them crawls.)

## What every file is

| File | What it does |
|---|---|
| `snn/snn_core.py` | The original Python SNN from Wack-a-Fly (the 4 steps above). The app's SNN is checked against it |
| `snn-camera/Start SNN Camera.command` | Double-click to open the app |
| `snn-camera/server.py` | The app's little server. Hands out the app and runs the Roboflow board model (keeps your key secret) |
| `snn-camera/.env.example` | Copy to `.env` and fill in: your Roboflow key and settings |
| `snn-camera/index.html`, `styles.css` | The app's page and its 4 themes (Minecraft, Light, Dark, NuVu) |
| `snn-camera/js/snn.js` | The SNN brain again, same steps, in JavaScript so it runs in the browser |
| `snn-camera/js/yolo.js` | Runs YOLO in the browser |
| `snn-camera/js/roboflow.js` | Sends the board view to the Roboflow board model (through `server.py`) |
| `snn-camera/js/game.js` | Click the Dot |
| `snn-camera/js/board.js` | The physical board: chopping the picture into 9 squares, the Frame-based brain, the simulator, the game rounds |
| `snn-camera/js/hardware.js` | Talks to the 2 Arduinos over USB (and the arm's angle for each hole) |
| `arduino/board/board.ino` | The board Arduino: lights the hole the computer says |
| `arduino/board_test/board_test.ino` | Lights each hole in turn, to check the LED wiring |
| `arduino/arm/arm.ino` | The arm Arduino: moves where the computer says, and says "T" when the tip touches a magnet |
| `snn-camera/js/app.js` | Runs everything: the game, the webcam, the board, the drawing, the buttons |
| `snn-camera/models/yolo11n.onnx` | The YOLO model file (made from `yolo11n.pt`) |
| `snn-camera/vendor/` | The engine that runs YOLO in the browser (onnxruntime, free to use) |
| `snn-camera/fonts/`, `textures/`, `icons/` | Pixel fonts, dirt and grass pictures, the app icon |
| `snn-camera/tests/` | Automatic checks (see below) |
| `dataset/make_samples.py`, `digits.png` | Makes labeled practice pictures for training a board model |

### Checking it still works

```bash
cd snn-camera
node --test tests/*.test.js         # checks the SNN and YOLO code (the SNN one also checks it matches the Python brain)
.venv/bin/python tests/roboflow_smoke.py   # checks your Roboflow board model says "hole4" for a lit hole 4 (needs your key)
```

---

## If something's broken

- **The app opens blank or half-empty, or Roboflow hangs, or it says "No Roboflow key" even though it's there.** The project is in an iCloud-synced folder (Documents or Desktop) and macOS moved files to iCloud, leaving empty placeholders. In Finder, right-click the file or folder > **Download Now**. The real fix: move the project out of Documents, or turn off **Optimize Mac Storage** in iCloud Drive settings.
- **YOLO or Roboflow says "needs the launcher".** You opened `index.html` directly. Use `Start SNN Camera.command` instead.
- **Roboflow says "No Roboflow key".** Put your key in `snn-camera/.env` (see above) and restart the launcher.
- **Roboflow says "isn't installed".** You turned on `ROBOFLOW_LOCAL=1` but there's no `snn-camera/.venv`. Make it (see **Run it yourself**), or remove that line to use the cloud.
- **Roboflow says "Roboflow said 404".** There's no trained model at `ROBOFLOW_BOARD_MODEL`. Check the project name and version number.
- **Board YOLO says "Couldn't load models/board.onnx".** There's no browser board model yet. Use Roboflow.
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
- **Venv**: a separate box of Python packages for one project, so it can't break the others.
- **Neuromorphic**: computer chips built to work like brains, only doing work when something changes. (Ours runs on a normal laptop, so it still checks every square. A real neuromorphic chip wouldn't.)

---

## AI use (partial generative AI disclosure)

Parts of this project were made with help from generative AI (Claude, by Anthropic). Here's the honest split:

**What I (Nick) did:** the idea and the research direction. Comparing an SNN with YOLO, how the SNN should see (only change, leak, threshold), using Click the Dot and the Wack-a-Fly board to test it, and training the Roboflow dot model. I also did the thinking behind the project and made the decisions along the way: what to build, what to keep or cut, how it should look, and checking that it actually made sense.

**What the AI helped with:** writing and cleaning up a lot of the code, especially the SNN Camera app (the browser translation of the SNN logic, ensuring secure and effective YOLO and Roboflow integration, adding a 'Minecraft' inspired theme), rapidly executing the automatic tests, answering questions and explaining new concepts, and drafting this README from my notes.

The AI worked from my directions, and I reviewed, tested, and altered what it made. The SNN in the app is checked against my original Python version (`snn/snn_core.py`) to make sure it gives the same answers.
