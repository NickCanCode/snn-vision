// Checks the board brains and the Arduino messages. Run:  node --test tests/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { squareOf, frameGuess, GRID, SIZE } = require("../js/board.js");
const { armCommand, sensorHole, PRESETS } = require("../js/hardware.js");
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

test("Arduino messages: arm moves and sensor reports", () => {
  assert.equal(armCommand(55, 40), "M55,40\n");
  assert.equal(PRESETS.length, 9);
  assert.equal(sensorHole("H4"), 4);
  assert.equal(sensorHole("H4\r"), 4);
  assert.equal(sensorHole("OK"), null);
  assert.equal(sensorHole("H9"), null);
});
