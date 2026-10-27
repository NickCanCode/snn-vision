// Checks the board brains and the Arduino messages. Run:  node --test tests/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { squareOf, frameGuess, GRID, SIZE, Match } = require("../js/board.js");
const { armCommand, isTouch, PRESETS } = require("../js/hardware.js");
const { SpikingGrid } = require("../js/snn.js");

// A black 3 x 3 board picture with a white dot (a lit LED) in one square.
function boardPicture(litHole) {
  const bw = new Float32Array(GRID * GRID);
  if (litHole === null) return bw;
  const cx = (litHole % 3) * SIZE + SIZE / 2, cy = Math.floor(litHole / 3) * SIZE + SIZE / 2;
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= 40 * 40) bw[y * GRID + x] = 255;
  return bw;
}

test("squareOf: a point in the 3 x 3 picture -> its hole number", () => {
  assert.equal(squareOf(10, 10), 0);
  assert.equal(squareOf(GRID - 1, 10), 2);
  assert.equal(squareOf(GRID / 2, GRID / 2), 4);
  assert.equal(squareOf(GRID - 1, GRID - 1), 8);
});

test("frame-based brain finds the lit hole, and says nothing on a dark board", () => {
  for (let hole = 0; hole < 9; hole++) assert.equal(frameGuess(boardPicture(hole)), hole);
  assert.equal(frameGuess(boardPicture(null)), null);
});

test("SNN on the board: fires when a light turns ON in a square, not while it stays on", () => {
  const brain = new SpikingGrid({ polarity: "brighter" });
  brain.step(boardPicture(null), GRID, GRID);
  const p = brain.step(boardPicture(7), GRID, GRID);
  assert.ok(p, "sees the light come on");
  assert.equal(squareOf(p.x, p.y), 7);
  assert.equal(brain.step(boardPicture(7), GRID, GRID), null, "a light that stays on is old news");
});

test("Arduino messages: arm moves and the tip touches", () => {
  assert.equal(armCommand(55, 40), "M55,40\n");
  assert.equal(PRESETS.length, 9);
  assert.equal(isTouch("T"), true);
  assert.equal(isTouch("T\r"), true);
  assert.equal(isTouch("OK"), false);
});

// One round with a pretend board and arm: light -> brain sees it -> arm goes there -> tip touches -> light off.
async function playOneRound(armGoesTo) {
  const lights = [];
  const board = { light: (h) => lights.push(h), off: () => lights.push("off") };
  const match = new Match({ now: () => performance.now(), onChange: () => {} });
  const arm = {
    async goTo(hole) { arm.went = hole; match.touched(); },   // every hole has a magnet, so it always touches
    async home() { match.stop(); },
  };
  let scored;
  const playing = match.play("snn", { board, arm }, (...args) => (scored = args));
  while (match.lit === null) await new Promise((r) => setTimeout(r, 10));
  const lit = match.lit;
  match.saw(armGoesTo(lit));
  await playing;
  return { lit, lights, went: arm.went, scored };
}

test("a round: the arm goes to the hole the brain saw, and the touch turns the light off", async () => {
  const { lit, lights, went, scored } = await playOneRound((lit) => lit);
  assert.equal(went, lit);
  assert.deepEqual(lights.slice(0, 3), ["off", lit, "off"], "light on, then off when the tip touched");
  const [who, hit, seeMs, touchMs] = scored;
  assert.equal(who, "snn");
  assert.equal(hit, true);
  assert.ok(touchMs >= seeMs, "the touch comes after seeing it");
});

test("a round: the arm went to the wrong hole = miss, even though it touched", async () => {
  const { lit, went, scored } = await playOneRound((lit) => (lit + 1) % 9);
  assert.notEqual(went, lit);
  assert.equal(scored[1], false);
});
