# The app's little web server. "Start SNN Camera.command" runs it for you.
#   1. It hands the app's files to the browser.
#   2. It talks to Roboflow for the app, so your secret Roboflow key never goes to the browser.
# Your key lives in the .env file next to this one:  ROBOFLOW_API_KEY=...
# Want to run Roboflow on your own computer instead of the internet? Add  ROBOFLOW_API_URL=http://localhost:9001
# Which board model Board mode uses (project/version on Roboflow):  ROBOFLOW_BOARD_MODEL=yerrrrrrrrrr/1
# Run the board model on THIS Mac (no internet, no Docker) with Roboflow's Python package:  ROBOFLOW_LOCAL=1
#   That package lives in its own venv, snn-camera/.venv (the launcher uses it when it's there):
#   python3.12 -m venv .venv && .venv/bin/pip install inference
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent


class RoboflowError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status   # what to tell the browser (401 = bad key, 502 = Roboflow problem, ...)


def load_env():
    """Read KEY=value lines from .env (unless they're already set)."""
    env = HERE / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def api_key():
    return os.environ.get("ROBOFLOW_API_KEY", "")


def self_hosted():
    """The Roboflow server you run yourself (like http://localhost:9001), or "" for Roboflow's cloud."""
    return os.environ.get("ROBOFLOW_API_URL", "").rstrip("/")


def board_model():
    return os.environ.get("ROBOFLOW_BOARD_MODEL", "yerrrrrrrrrr/1")


def run_here():
    """ROBOFLOW_LOCAL=1: run the board model on this Mac with Roboflow's Python package."""
    return os.environ.get("ROBOFLOW_LOCAL", "") == "1"


def find_boxes(thing):
    """Roboflow's answer is a big nested blob. Dig through it for the list of boxes."""
    if isinstance(thing, list):
        if thing and all(isinstance(b, dict) and {"x", "y", "width", "height"} <= b.keys() for b in thing):
            return thing
        thing = list(thing)
    elif isinstance(thing, dict):
        thing = list(thing.values())
    else:
        return None
    for part in thing:
        found = find_boxes(part)
        if found is not None:
            return found
    return None


def ask_roboflow(url, body, headers):
    """Send one request to Roboflow (cloud or your own server). Gives back boxes, most sure first."""
    if not api_key():
        raise RoboflowError("No Roboflow key. Put ROBOFLOW_API_KEY=... in snn-camera/.env", 503)
    for attempt in range(3):   # try up to 3 times, waiting a bit longer each time
        try:
            # 30 s: the first time, your own server has to download the model before it can answer
            with urllib.request.urlopen(urllib.request.Request(url, body, headers), timeout=30) as res:
                answer = json.load(res)
            break
        except urllib.error.HTTPError as err:
            if err.code < 500 or attempt == 2:   # a bad key won't fix itself, so don't retry that
                hint = " (no model there: is it trained? check ROBOFLOW_BOARD_MODEL)" if err.code == 404 else ""
                raise RoboflowError(f"Roboflow said {err.code}{hint}", 401 if err.code in (401, 403) else 502) from None
        except OSError as err:   # no internet, timed out, ...
            if attempt == 2:
                where = f"your Roboflow server at {self_hosted()} (is it running?)" if self_hosted() else "Roboflow"
                raise RoboflowError(f"Can't reach {where}: {err}") from None
        time.sleep(0.5 * 2 ** attempt)

    boxes = find_boxes(answer.get("outputs", answer)) or []
    boxes = [{k: b.get(k) for k in ("x", "y", "width", "height", "confidence", "class")} for b in boxes]
    return sorted(boxes, key=lambda b: b["confidence"] or 0, reverse=True)


local_model = None            # the board model, once it's loaded on this Mac
local_lock = threading.Lock()  # one picture at a time


def run_board_model_here(image_b64):
    """Run the board model on this Mac. The first time, Roboflow's package downloads it (needs internet once)."""
    global local_model
    # Use the plain CPU: the Mac's CoreML speed-up crashes on YOLO26 models (like yerrrrrrrrrr). Must be set before the import.
    os.environ.setdefault("ONNXRUNTIME_EXECUTION_PROVIDERS", "[CPUExecutionProvider]")
    try:
        import base64
        import cv2
        import numpy as np
        from inference import get_model
    except ImportError:
        raise RoboflowError("ROBOFLOW_LOCAL=1, but Roboflow's package isn't installed. "
                            "In snn-camera: python3.12 -m venv .venv && .venv/bin/pip install inference", 503) from None
    if not api_key():
        raise RoboflowError("No Roboflow key. Put ROBOFLOW_API_KEY=... in snn-camera/.env", 503)
    picture = cv2.imdecode(np.frombuffer(base64.b64decode(image_b64), np.uint8), cv2.IMREAD_COLOR)
    if picture is None:
        raise RoboflowError("That picture didn't open", 400)
    with local_lock:
        if local_model is None:
            local_model = get_model(board_model(), api_key=api_key())
        answer = local_model.infer(picture, confidence=0.1)[0]
    boxes = [{"x": p.x, "y": p.y, "width": p.width, "height": p.height, "confidence": p.confidence, "class": p.class_name}
             for p in answer.predictions]
    return sorted(boxes, key=lambda b: b["confidence"], reverse=True)


def run_board_model(image_b64):
    """Send one picture of the 3 x 3 board view (base64) to the board model. Its classes are hole0 ... hole8."""
    if run_here():
        return run_board_model_here(image_b64)
    url = f"{self_hosted() or 'https://detect.roboflow.com'}/{board_model()}?api_key={api_key()}"
    return ask_roboflow(url, image_b64.encode(), {"Content-Type": "application/x-www-form-urlencoded"})


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HERE), **kwargs)

    def log_message(self, *args):   # keep the Terminal window quiet
        pass

    def end_headers(self):
        if self.command in ("GET", "HEAD"):
            self.send_header("Cache-Control", "no-store")   # always send the newest files
        super().end_headers()

    def reply(self, status, data):
        raw = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def secret(self):
        """Never hand out .env (your key), hidden files, or this file."""
        name = Path(self.translate_path(self.path)).name
        return name.startswith(".") or name == "server.py"

    def do_GET(self):
        if self.path == "/api/roboflow/status":
            return self.reply(200, {"configured": bool(api_key()), "selfHosted": "this Mac" if run_here() else self_hosted(),
                                    "boardModel": board_model()})
        if self.secret():
            return self.send_error(404)
        super().do_GET()

    def do_HEAD(self):
        if self.secret():
            return self.send_error(404)
        super().do_HEAD()

    def do_POST(self):
        if self.path != "/api/roboflow/board":
            return self.send_error(404)
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 5_000_000:
                raise RoboflowError("Picture missing or too big", 413)
            image = json.loads(self.rfile.read(length)).get("image", "")
            started = time.perf_counter()
            boxes = run_board_model(image.split(",", 1)[-1])   # works with or without a "data:image/jpeg;base64," front
            self.reply(200, {"boxes": boxes, "ms": round((time.perf_counter() - started) * 1000)})
        except RoboflowError as err:
            self.reply(err.status, {"error": str(err)})
        except (ValueError, AttributeError):
            self.reply(400, {"error": 'Send {"image": "<base64>"}'})


if __name__ == "__main__":
    load_env()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"SNN Camera server on http://127.0.0.1:{port}  (Roboflow key: {'yes' if api_key() else 'no'}, "
          f"Roboflow at: {'this Mac' if run_here() else self_hosted() or 'the cloud'}, board model: {board_model()})")
    try:
        ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
