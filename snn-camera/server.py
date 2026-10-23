# The app's little web server. "Start SNN Camera.command" runs it for you.
#   1. It hands the app's files to the browser.
#   2. It talks to Roboflow for the app, so your secret Roboflow key never goes to the browser.
# Your key lives in the .env file next to this one:  ROBOFLOW_API_KEY=...
# Want to run Roboflow on your own computer instead of the internet? Add  ROBOFLOW_API_URL=http://localhost:9001
import json
import os
import sys
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORKFLOW = "nickcancode-s-workspace/workflows/clickthedot-vclickthedot-1-rfdetr-nas-t1-9602f1-logic"


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


def run_workflow(image_b64):
    """Send one picture (base64) to the Click the Dot model. Gives back boxes, most sure first."""
    if not api_key():
        raise RoboflowError("No Roboflow key. Put ROBOFLOW_API_KEY=... in snn-camera/.env", 503)
    url = os.environ.get("ROBOFLOW_API_URL", "https://serverless.roboflow.com").rstrip("/") + "/" + WORKFLOW
    body = json.dumps({"inputs": {"image": {"type": "base64", "value": image_b64}}}).encode()
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key()}"}

    for attempt in range(3):   # try up to 3 times, waiting a bit longer each time
        try:
            with urllib.request.urlopen(urllib.request.Request(url, body, headers), timeout=15) as res:
                answer = json.load(res)
            break
        except urllib.error.HTTPError as err:
            if err.code < 500 or attempt == 2:   # a bad key won't fix itself, so don't retry that
                raise RoboflowError(f"Roboflow said {err.code}", 401 if err.code in (401, 403) else 502) from None
        except OSError as err:   # no internet, timed out, ...
            if attempt == 2:
                raise RoboflowError(f"Can't reach Roboflow: {err}") from None
        time.sleep(0.5 * 2 ** attempt)

    boxes = find_boxes(answer.get("outputs", answer)) or []
    boxes = [{k: b.get(k) for k in ("x", "y", "width", "height", "confidence", "class")} for b in boxes]
    return sorted(boxes, key=lambda b: b["confidence"] or 0, reverse=True)


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
            return self.reply(200, {"configured": bool(api_key())})
        if self.secret():
            return self.send_error(404)
        super().do_GET()

    def do_HEAD(self):
        if self.secret():
            return self.send_error(404)
        super().do_HEAD()

    def do_POST(self):
        if self.path != "/api/roboflow":
            return self.send_error(404)
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 5_000_000:
                raise RoboflowError("Picture missing or too big", 413)
            image = json.loads(self.rfile.read(length)).get("image", "")
            started = time.perf_counter()
            boxes = run_workflow(image.split(",", 1)[-1])   # works with or without a "data:image/jpeg;base64," front
            self.reply(200, {"boxes": boxes, "ms": round((time.perf_counter() - started) * 1000)})
        except RoboflowError as err:
            self.reply(err.status, {"error": str(err)})
        except (ValueError, AttributeError):
            self.reply(400, {"error": 'Send {"image": "<base64>"}'})


if __name__ == "__main__":
    load_env()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"SNN Camera server on http://127.0.0.1:{port}  (Roboflow key: {'yes' if api_key() else 'no'})")
    try:
        ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
