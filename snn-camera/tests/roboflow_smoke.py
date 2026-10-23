# Checks your Roboflow model really answers. Needs internet and your key in snn-camera/.env.
# Run:  python3 tests/roboflow_smoke.py
import base64
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402


def dot_picture():
    """A 640 x 480 white picture with a black dot at (400, 200), saved as PNG. No extra libraries needed."""
    rows = b"".join(b"\0" + b"".join(b"\0\0\0" if (x - 400) ** 2 + (y - 200) ** 2 <= 900 else b"\xff\xff\xff" for x in range(640)) for y in range(480))
    chunk = lambda tag, data: struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 640, 480, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


server.load_env()
if not server.api_key():
    sys.exit("SKIP: no ROBOFLOW_API_KEY in snn-camera/.env")
best = server.run_workflow(base64.b64encode(dot_picture()).decode())[0]
assert abs(best["x"] - 400) < 30 and abs(best["y"] - 200) < 30, best
print(f"PASS: found a {best['class']} at ({best['x']:.0f}, {best['y']:.0f}), {best['confidence']:.0%} sure")
