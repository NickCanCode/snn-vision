# The Wack-a-Fly screen (Minecraft style). Shows the board camera the way each model sees it,
# plus a score table, an efficiency table, and a button to switch between SNN and YOLO.
# Run: python gui.py
import base64
import time
import tkinter as tk
import tkinter.font as tkfont
from tkinter import ttk

import cv2
import numpy as np

import camera
import snn.snn_core as snn

MODELS = ["SNN", "YOLO"]
SCORE_ROWS = ["Hits", "Misses", "Hit rate", "Avg time (ms)"]
EFF_ROWS = ["Work grows with", "Big O", "Looked at this frame", "Share of picture", "Time per frame (ms)"]
W, H = 400, 300   # size of each picture

# Minecraft colours
DIRT, GRASS = "#79553A", "#5D9B32"
STONE, STONE_DARK, STONE_LIGHT = "#8B8B8B", "#373737", "#C6C6C6"
BUTTON, BUTTON_HOVER, GOLD = "#6F6F6F", "#7D88C2", "#FFFF55"

WORDS = (
    "Frame: one picture from the camera.   Pixel: one dot in that picture.   "
    "Neuron: one square in the SNN's 64 x 48 grid.\n"
    "Red = that spot changed.   White = a neuron fired.   "
    "Big O: how the work grows. O(pixels) = always the whole picture. O(changes) = only what moved.\n"
    "Honest note: this SNN runs on a normal laptop, so it still checks every square. "
    "On a real brain-like chip, squares that don't change cost nothing."
)


def pick_font():
    """Use a blocky pixel font if you have one installed."""
    installed = tkfont.families()
    for name in ("Minecraft", "Minecraftia", "Press Start 2P", "VT323", "Monaco"):
        if name in installed:
            return name
    return "Courier"


def make_table(parent, rows, font):
    """A grey table: one row per stat, one column per model, all starting as '-'."""
    table = ttk.Treeview(parent, columns=["stat"] + MODELS, show="headings", height=len(rows))
    table.heading("stat", text="")
    table.column("stat", width=170, anchor="w")
    for model in MODELS:
        table.heading(model, text=model)
        table.column(model, width=140, anchor="center")
    for row in rows:
        table.insert("", "end", iid=row, values=[row, "-", "-"])
    return table


def set_cell(table, row, model, value):
    values = list(table.item(row, "values"))
    values[MODELS.index(model) + 1] = value
    table.item(row, values=values)


def panel(img, title, picked):
    """Resize a picture, draw the 9 hole boxes (thick yellow = the hole the model picked) and a title."""
    sx, sy = W / img.shape[1], H / img.shape[0]
    img = cv2.resize(img, (W, H), interpolation=cv2.INTER_NEAREST)
    half = camera.BOX // 2
    for i, (x, y) in enumerate(camera.HOLES):
        color, thick = ((85, 255, 255), 4) if i == picked else ((70, 70, 70), 2)
        cv2.rectangle(img, (int((x - half) * sx), int((y - half) * sy)), (int((x + half) * sx), int((y + half) * sy)), color, thick)
    cv2.putText(img, title, (12, 27), cv2.FONT_HERSHEY_DUPLEX, 0.7, (63, 63, 63), 2)    # shadow
    cv2.putText(img, title, (10, 25), cv2.FONT_HERSHEY_DUPLEX, 0.7, (255, 255, 255), 2)
    return cv2.copyMakeBorder(img, 4, 4, 4, 4, cv2.BORDER_CONSTANT, value=(55, 55, 55))


def which_hole(x, y):
    """A spot in the camera picture -> which hole it's in (or None)."""
    for i, (hx, hy) in enumerate(camera.HOLES):
        if abs(x - hx) <= camera.BOX // 2 and abs(y - hy) <= camera.BOX // 2:
            return i
    return None


class Dashboard:
    def __init__(self, root, cam):
        self.root, self.cam = root, cam
        self.active = "SNN"                       # which model is playing
        self.results = {m: [] for m in MODELS}    # (hit, ms) for every round
        self.snn_pick = None
        self.ms = {m: 0.0 for m in MODELS}        # smoothed time per frame

        font = pick_font()
        style = ttk.Style()
        style.theme_use("clam")   # the Mac's own theme ignores colours
        style.configure("Treeview", background=STONE, fieldbackground=STONE, foreground="white", font=(font, 12), rowheight=28)
        style.configure("Treeview.Heading", background=STONE_DARK, foreground=GOLD, font=(font, 12, "bold"), relief="flat")

        root.title("Wack-a-Fly")
        root.configure(bg=DIRT)
        tk.Label(root, text="WACK-A-FLY", bg=GRASS, fg=GOLD, font=(font, 26, "bold"), pady=8).grid(row=0, column=0, columnspan=2, sticky="ew")

        # Left: the picture and one line about it
        left = tk.Frame(root, bg=STONE, highlightbackground=STONE_DARK, highlightthickness=4, padx=10, pady=10)
        left.grid(row=1, column=0, padx=12, pady=12, sticky="n")
        self.mirror = tk.Label(left, bg=STONE)
        self.mirror.pack()
        self.caption = tk.Label(left, bg=STONE, fg="white", font=(font, 14), wraplength=2 * W)
        self.caption.pack(pady=(10, 0))

        # Right: score table, efficiency table, switch button
        right = tk.Frame(root, bg=STONE, highlightbackground=STONE_DARK, highlightthickness=4, padx=10, pady=10)
        right.grid(row=1, column=1, padx=12, pady=12, sticky="n")
        tk.Label(right, text="SCORE", bg=STONE, fg=GOLD, font=(font, 14, "bold")).pack(anchor="w")
        self.score = make_table(right, SCORE_ROWS, font)
        self.score.pack(pady=(4, 12))
        tk.Label(right, text="EFFICIENCY", bg=STONE, fg=GOLD, font=(font, 14, "bold")).pack(anchor="w")
        self.eff = make_table(right, EFF_ROWS, font)
        self.eff.pack(pady=(4, 12))
        for model, grows, big_o in (("SNN", "how much moves", "O(changes)"), ("YOLO", "picture size", "O(pixels)")):
            set_cell(self.eff, "Work grows with", model, grows)
            set_cell(self.eff, "Big O", model, big_o)

        # A Label used as a button, because Mac buttons ignore colours
        self.switch = tk.Label(right, text="PLAYING: SNN", bg=BUTTON, fg="white", font=(font, 14, "bold"),
                               relief="raised", bd=4, padx=16, pady=8, cursor="hand2")
        self.switch.pack(fill="x")
        self.switch.bind("<Button-1>", lambda e: self.toggle())
        self.switch.bind("<Enter>", lambda e: self.switch.config(bg=BUTTON_HOVER))
        self.switch.bind("<Leave>", lambda e: self.switch.config(bg=BUTTON))

        tk.Label(root, text=WORDS, justify="left", wraplength=1150, bg=STONE_DARK, fg=STONE_LIGHT,
                 font=(font, 11), padx=12, pady=10).grid(row=2, column=0, columnspan=2, padx=12, pady=(0, 12), sticky="ew")
        self.tick()

    def toggle(self):
        self.active = "YOLO" if self.active == "SNN" else "SNN"
        self.switch.config(text=f"PLAYING: {self.active}")

    def tick(self):
        """Every frame: run BOTH models (so both columns stay live), but only show the one playing."""
        ok, frame = self.cam.read()
        if ok:
            views = {}
            for model, run in (("SNN", self.snn_view), ("YOLO", self.yolo_view)):
                start = time.perf_counter()
                views[model] = run(frame)
                self.ms[model] = 0.9 * self.ms[model] + 0.1 * (time.perf_counter() - start) * 1000   # smoothed so it's readable
                _, _, looked, share = views[model]
                set_cell(self.eff, "Looked at this frame", model, looked)
                set_cell(self.eff, "Share of picture", model, share)
                set_cell(self.eff, "Time per frame (ms)", model, f"{self.ms[model]:.1f}")

            img, caption, _, _ = views[self.active]
            self.caption.config(text=caption)
            self.photo = tk.PhotoImage(data=base64.b64encode(cv2.imencode(".png", img)[1].tobytes()))
            self.mirror.config(image=self.photo)
        self.root.after(30, self.tick)   # again in 30 ms

    def snn_view(self, frame):
        """Camera next to what the SNN gets: only the spots that changed."""
        point = snn.step(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), brighter=True)   # LEDs get brighter
        if point is not None:
            self.snn_pick = which_hole(*point)

        seen = np.zeros((snn.GRID_H, snn.GRID_W, 3), np.uint8)
        seen[..., 2] = np.clip(snn.events * 4 * 255, 0, 255).astype(np.uint8)   # changed = red
        seen[snn.spikes] = (255, 255, 255)                                       # fired = white

        total = snn.GRID_W * snn.GRID_H
        changed = int((snn.events > 0.02).sum())
        caption = (f"Change! {changed} of {total} neurons got input -> picked hole {self.snn_pick}" if changed
                   else "Nothing changed, so the SNN sees nothing and does nothing.")
        img = np.hstack([panel(frame, "Camera", None), panel(seen, "SNN sees: only change", self.snn_pick)])
        return img, caption, f"{changed:,} changed cells", f"{100 * changed / total:.1f}%"

    def yolo_view(self, frame):
        """Camera next to what YOLO gets: the whole picture, every frame."""
        # Stand-in until YOLO is trained on the board: the brightest hole wins.
        pick = int(np.argmax([cv2.cvtColor(c, cv2.COLOR_BGR2GRAY).mean() for c in camera.split(frame)]))
        h, w = frame.shape[:2]
        caption = f"Checks all {w * h:,} pixels every frame, changed or not -> picked hole {pick}"
        img = np.hstack([panel(frame, "Camera", None), panel(frame, "YOLO sees: everything", pick)])
        return img, caption, f"{w * h:,} pixels", "100%"

    def record(self, model, hit, ms):
        """The game loop calls this after each round, e.g. gui.record("SNN", hit=True, ms=240)."""
        self.results[model].append((hit, ms))
        res = self.results[model]
        hits = sum(h for h, _ in res)
        values = [hits, len(res) - hits, f"{100 * hits / len(res):.0f}%", f"{sum(t for _, t in res) / len(res):.0f}"]
        for row, value in zip(SCORE_ROWS, values):
            set_cell(self.score, row, model, value)


if __name__ == "__main__":
    cam = cv2.VideoCapture(camera.CAMERA)
    root = tk.Tk()
    Dashboard(root, cam)
    root.mainloop()
    cam.release()
