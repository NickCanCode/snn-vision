# Checks your Roboflow board model really answers. Needs your key in snn-camera/.env.
# Run it with the same Python the launcher uses:
#   .venv/bin/python tests/roboflow_smoke.py     (board model on this Mac, ROBOFLOW_LOCAL=1)
#   python3 tests/roboflow_smoke.py              (board model on Roboflow's cloud)
import base64
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402

W, H, X0, Y0, CELL = 1074, 810, 129, 3, 270   # the board view's size and grid (like dataset/make_samples.py)


def board_picture(hole):
    """The right-hand board view, black with grey grid lines, and a lit LED (white blob) in one hole. Saved as PNG."""
    cx, cy = X0 + (hole % 3) * CELL + CELL // 2, Y0 + (hole // 3) * CELL + CELL // 2

    def pixel(x, y):
        if (x - cx) ** 2 + (y - cy) ** 2 <= 70 ** 2:
            return b"\xff\xff\xff"
        on_line = any(abs(x - (X0 + k * CELL)) <= 1 for k in range(4)) or any(abs(y - (Y0 + k * CELL)) <= 1 for k in range(3))
        return b"\x55\x55\x55" if on_line and X0 - 1 <= x <= X0 + 3 * CELL + 1 else b"\0\0\0"

    rows = b"".join(b"\0" + b"".join(pixel(x, y) for x in range(W)) for y in range(H))
    chunk = lambda tag, data: struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


server.load_env()
if not server.api_key():
    sys.exit("SKIP: no ROBOFLOW_API_KEY in snn-camera/.env")
boxes = server.run_board_model(base64.b64encode(board_picture(4)).decode())
assert boxes, "the model found nothing"
best = boxes[0]
assert best["class"] == "hole4", best
where = "this Mac" if server.run_here() else "Roboflow's cloud"
print(f"PASS: {server.board_model()} on {where} says {best['class']}, {best['confidence']:.0%} sure")
