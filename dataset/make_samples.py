"""Makes practice pictures for training YOLO on the board view (the right side of Board mode).

Each picture looks like a screenshot of that view: black, a 3 x 3 grid with grey lines and the hole
numbers in the corners, and the lit LED as a big lumpy white blob in one square (cut off where it
hits the square's edge). Sometimes the square has the yellow "picked" border, sometimes not.
The label says which square the blob is in, as the class:
class 0-8 = hole 0-8 (0 = top left, 8 = bottom right) = the arm preset to go to.

Some pictures have no light (the board is dark between rounds): their label file is empty.
Some have little white specks (glare), so the model learns to ignore them.

Run it with the numpy + OpenCV Python from the wack-a-fly project:
    ../wack-a-fly/vn/bin/python dataset/make_samples.py
It writes dataset/board-grid/ in the normal YOLO layout (images/, labels/, data.yaml), plus preview.jpg.
"""

import argparse
from pathlib import Path

import cv2
import numpy as np

# The view's size and where its grid sits, measured from a real screenshot (BGR colors).
W, H = 1074, 810
X0, Y0 = 129, 3          # top left corner of square 0
CELL = 270               # each square is 270 x 270
CAM = 80                 # each square is an 80 x 80 bit of the camera picture, zoomed up (like board.js)
GREY = (85, 85, 85)      # grid lines
YELLOW = (115, 255, 255)
DIGITS = cv2.imread(str(Path(__file__).parent / "digits.png"), cv2.IMREAD_GRAYSCALE)   # 0-8, cut from a screenshot


def blob(rng):
    """A lit LED as one square sees it: a big lumpy white blob, drawn small then zoomed up (so the edges are blocky)."""
    small = np.zeros((CAM, CAM), np.float32)
    r = rng.uniform(13, 42)                                   # how big the glow looks
    cx, cy = CAM / 2 + rng.uniform(-18, 18), CAM / 2 + rng.uniform(-18, 18)
    cv2.ellipse(small, (int(cx), int(cy)), (int(r * rng.uniform(0.8, 1.2)), int(r * rng.uniform(0.8, 1.2))),
                rng.uniform(0, 180), 0, 360, 255, -1)
    for _ in range(rng.integers(1, 5)):                        # lumps and smears off the side
        a, d = rng.uniform(0, 2 * np.pi), r * rng.uniform(0.4, 1.0)
        size = r * rng.uniform(0.2, 0.6)
        cv2.ellipse(small, (int(cx + np.cos(a) * d), int(cy + np.sin(a) * d)), (int(size), int(size * rng.uniform(0.5, 1))),
                    np.degrees(a), 0, 360, 255, -1)
    small = cv2.GaussianBlur(small, (0, 0), rng.uniform(1, 3))
    big = cv2.resize(small, (CELL, CELL), interpolation=cv2.INTER_LINEAR)
    return big > 128


def stroke_rect(img, x, y, size, width, color):
    """Like canvas strokeRect: a square outline, with the line centred on the edge."""
    a, b = width // 2, width - width // 2
    for (x1, y1, x2, y2) in ((x - a, y - a, x + size + b, y + b), (x - a, y + size - a, x + size + b, y + size + b),
                             (x - a, y - a, x + b, y + size + b), (x + size - a, y - a, x + size + b, y + size + b)):
        img[max(0, y1):max(0, y2), max(0, x1):max(0, x2)] = color


def sample(rng, hole):
    """One picture + its label lines. hole=None means the board is dark."""
    img = np.zeros((H, W, 3), np.uint8)
    labels = []

    if hole is not None:
        row, col = divmod(hole, 3)
        x, y = X0 + col * CELL, Y0 + row * CELL
        mask = blob(rng)
        mask = mask[: H - y, : W - x]                            # the bottom row runs off the picture
        img[y:y + mask.shape[0], x:x + mask.shape[1]][mask] = 255
        ys, xs = np.nonzero(mask)
        x1, x2, y1, y2 = x + xs.min(), x + xs.max() + 1, y + ys.min(), y + ys.max() + 1
        labels.append(f"{hole} {(x1 + x2) / 2 / W:.6f} {(y1 + y2) / 2 / H:.6f} {(x2 - x1) / W:.6f} {(y2 - y1) / H:.6f}")

    # Glare specks: small white dots here and there.
    for _ in range(rng.choice([0, 0, 0, 1, 1, 2, 3])):
        cv2.circle(img, (int(rng.uniform(X0, X0 + 3 * CELL)), int(rng.uniform(Y0, H))), int(rng.uniform(2, 5)), (255, 255, 255), -1)

    # The grid and numbers on top, in the same order the app draws them. The picked square is yellow (sometimes).
    picked = hole if hole is not None and rng.random() < 0.5 else None
    img[0:2, :] = (55, 55, 55)                                   # the panel's top edge
    for i in range(9):
        r, c = divmod(i, 3)
        x, y = X0 + c * CELL, Y0 + r * CELL
        stroke_rect(img, x, y, CELL, 4 if i == picked else 2, YELLOW if i == picked else GREY)
        d = DIGITS[:, i * 22:(i + 1) * 22]
        spot = img[y + 3:y + 25, x + 3:x + 25]
        spot[:] = np.where(d[:, :, None] > 0, d[:, :, None], spot)
    return img, labels


def make(out, count, val_part, seed):
    rng = np.random.default_rng(seed)
    out = Path(out)
    for split in ("train", "val"):
        (out / "images" / split).mkdir(parents=True, exist_ok=True)
        (out / "labels" / split).mkdir(parents=True, exist_ok=True)

    previews = []
    for i in range(count):
        split = "val" if i < count * val_part else "train"
        hole = None if rng.random() < 0.1 else i % 9   # about 1 in 10 is a dark board
        picture, labels = sample(rng, hole)
        name = f"board_{i:05d}"
        cv2.imwrite(str(out / "images" / split / f"{name}.png"), picture)
        (out / "labels" / split / f"{name}.txt").write_text("\n".join(labels) + ("\n" if labels else ""))
        if len(previews) < 16:
            previews.append(draw_label(picture, labels))

    names = "\n".join(f"  {i}: hole{i}" for i in range(9))
    (out / "data.yaml").write_text(f"path: {out.resolve()}\ntrain: images/train\nval: images/val\nnames:\n{names}\n")

    # A 4 x 4 sheet of examples with their labels drawn on, to check by eye.
    rows = [np.hstack(previews[r * 4:(r + 1) * 4]) for r in range(len(previews) // 4)]
    cv2.imwrite(str(out / "preview.jpg"), np.vstack(rows))
    print(f"Made {count} pictures in {out} ({int(count * val_part)} for checking, the rest for training).")


def draw_label(picture, labels):
    """A small copy of a picture with the label's box + hole number on top (in pink, so it's not mixed up with the yellow)."""
    img = picture.copy()
    for line in labels:
        c, x, y, w, h = line.split()
        x, w = float(x) * W, float(w) * W
        y, h = float(y) * H, float(h) * H
        cv2.rectangle(img, (int(x - w / 2), int(y - h / 2)), (int(x + w / 2), int(y + h / 2)), (255, 0, 255), 4)
        cv2.putText(img, f"hole {c}", (int(x - w / 2), int(y + h / 2) - 10), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 0, 255), 3)
    if not labels:
        cv2.putText(img, "dark", (X0 + 20, 80), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 255), 4)
    cv2.rectangle(img, (0, 0), (W - 1, H - 1), (40, 40, 40), 4)
    return cv2.resize(img, (W // 3, H // 3), interpolation=cv2.INTER_AREA)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--count", type=int, default=1800, help="how many pictures (default 1800)")
    p.add_argument("--val", type=float, default=0.15, help="part kept for checking, not training (default 0.15)")
    p.add_argument("--seed", type=int, default=1, help="same seed = same pictures")
    p.add_argument("--out", default=str(Path(__file__).parent / "board-grid"))
    a = p.parse_args()
    make(a.out, a.count, a.val, a.seed)
