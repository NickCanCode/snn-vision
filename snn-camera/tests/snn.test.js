// Checks the SNN brain works. Run:  node --test tests/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { SpikingGrid } = require("../js/snn.js");

// The easiest way to watch one neuron: a 1 x 1 brain fed 1-pixel pictures.
function oneNeuron(polarity = "brighter") {
  const brain = new SpikingGrid({ gridW: 1, gridH: 1, polarity });
  return { brain, show: (brightness) => brain.step([brightness], 1, 1) };
}

// The 4 rows of the "why the leak matters" table in the README:
test("big change (0.8): fires right away", () => {
  const { brain, show } = oneNeuron();
  show(0);
  assert.notEqual(show(0.8 * 255), null);
  assert.equal(brain.v[0], 0, "starts over at 0 after firing");
});

test("medium change twice (0.3 + 0.3): fires on the 2nd frame", () => {
  const { show } = oneNeuron();
  show(0);
  assert.equal(show(0.3 * 255), null);       // charge 0.3, not enough
  assert.notEqual(show(0.6 * 255), null);    // 0.3 x 0.8 + 0.3 = 0.54, fire!
});

test("tiny flicker every frame (0.05): never fires", () => {
  const { brain, show } = oneNeuron();
  show(0);
  for (let i = 1; i <= 19; i++) assert.equal(show(i * 0.05 * 255), null);
  assert.ok(brain.v[0] < 0.25, "charge levels off below 0.25");
});

test("LED stays on: the charge leaks away and it never fires", () => {
  const { show } = oneNeuron();
  show(0);
  show(0.3 * 255);
  for (let i = 0; i < 20; i++) assert.equal(show(0.3 * 255), null);
});

test("Reacts to: darker, brighter, any", () => {
  for (const [polarity, from, to, fires] of [["darker", 255, 0, true], ["darker", 0, 255, false],
    ["brighter", 0, 255, true], ["brighter", 255, 0, false], ["any", 0, 255, true], ["any", 255, 0, true]]) {
    const { brain, show } = oneNeuron(polarity);
    show(from);
    show(to);
    assert.equal(brain.spikeCount === 1, fires, `${polarity} ${from} -> ${to}`);
  }
});

test("it clicks the middle of a dot that appears, and ignores it once it sits still", () => {
  const brain = new SpikingGrid();
  const pic = new Uint8Array(640 * 480).fill(255);
  brain.step(pic, 640, 480);
  for (let y = 0; y < 480; y++) for (let x = 0; x < 640; x++) if ((x - 205) ** 2 + (y - 333) ** 2 <= 900) pic[y * 640 + x] = 0;
  const target = brain.step(pic, 640, 480);
  assert.ok(Math.hypot(target.x - 205, target.y - 333) < 6);
  assert.equal(brain.step(pic, 640, 480), null);
});

// These answers came from running the real Python brain (snn/snn_core.py) on the exact same pictures.
test("gives the same answers as the Python brain", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const spots = [[120, 90], [500, 360], [320, 240], [60, 420], [580, 40]];
  const pictures = Array.from({ length: 15 }, (_, t) => {
    const pic = new Uint8Array(640 * 480).fill(255);
    const [cx, cy] = spots[Math.floor(t / 3)];
    for (let y = 0; y < 480; y++) for (let x = 0; x < 640; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= 900) pic[y * 640 + x] = 0;
    for (let k = 0; k < 400; k++) pic[Math.floor(random() * 640 * 480)] = Math.floor(random() * 180);
    return pic;
  });
  const python = {
    darker: { 3: [500, 360], 6: [320, 240], 9: [60, 420], 12: [580, 40] },
    brighter: { 3: [120, 90], 6: [500, 360], 9: [320, 240], 12: [60, 420] },
  };
  for (const polarity of ["darker", "brighter"]) {
    const brain = new SpikingGrid({ polarity });
    pictures.forEach((pic, t) => {
      const got = brain.step(pic, 640, 480);
      const want = python[polarity][t];
      assert.deepEqual(got && [got.x, got.y], want ?? null, `${polarity}, picture ${t}`);
    });
  }
});

test("ignore(): a spot told to ignore changes doesn't fire when the dot leaves", () => {
  const brain = new SpikingGrid({ polarity: "any" });
  const blank = new Uint8Array(640 * 480).fill(30);
  const withDot = blank.slice();
  for (let y = 0; y < 480; y++) for (let x = 0; x < 640; x++) if ((x - 300) ** 2 + (y - 200) ** 2 <= 900) withDot[y * 640 + x] = 235;
  brain.step(blank, 640, 480);
  assert.ok(brain.step(withDot, 640, 480), "sees the dot appear");
  brain.ignore(300, 200, 48, 3, 640, 480);
  assert.equal(brain.step(blank, 640, 480), null, "doesn't fire when it leaves");
});
