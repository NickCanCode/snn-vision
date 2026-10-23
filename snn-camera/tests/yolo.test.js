// Checks the YOLO box-reading code. Run:  node --test tests/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { preprocess, decode, NAMES } = require("../js/yolo.js");

test("80 COCO class names, dot class is sports ball", () => {
  assert.equal(NAMES.length, 80);
  assert.equal(NAMES[32], "sports ball");
});

test("a 640 x 480 frame is letterboxed into 640 x 640 with grey bars", () => {
  const rgba = new Uint8ClampedArray(640 * 480 * 4).fill(255);
  const { data, scale, padX, padY } = preprocess(rgba, 640, 480);
  assert.equal(data.length, 3 * 640 * 640);
  assert.deepEqual([scale, padX, padY], [1, 0, 80]);
  assert.ok(Math.abs(data[0] - 114 / 255) < 1e-6, "top bar is grey");
  assert.equal(data[100 * 640 + 5], 1, "picture starts below the bar");
});

test("decode turns model output into boxes, keeps the best, drops overlaps", () => {
  const N = 3;
  const out = new Float32Array(84 * N);
  const set = (i, cx, cy, w, h, cls, s) => {
    out[i] = cx; out[N + i] = cy; out[2 * N + i] = w; out[3 * N + i] = h; out[(4 + cls) * N + i] = s;
  };
  set(0, 400, 280, 60, 60, 32, 0.6);   // the dot, in letterboxed coordinates (80 px bar on top)
  set(1, 402, 281, 58, 60, 32, 0.4);   // same dot again, should be removed by NMS
  set(2, 100, 300, 20, 20, 0, 0.1);    // under the confidence cut-off
  const boxes = decode(out, N, { scale: 1, padX: 0, padY: 80, w: 640, h: 480 }, 0.25);
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].name, "sports ball");
  assert.deepEqual([boxes[0].x1, boxes[0].y1, boxes[0].x2, boxes[0].y2], [370, 170, 430, 230]);
});
