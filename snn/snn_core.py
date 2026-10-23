# The SNN "brain". It only notices things that CHANGE, like your eyes noticing movement.
import numpy as np

GRID_W, GRID_H = 64, 48   # the picture gets squished into 64 x 48 squares. Each square = 1 neuron.
THRESHOLD = 0.5           # how "full" a neuron has to get before it fires
DECAY = 0.8               # every frame a neuron keeps 80% of its charge (the other 20% leaks away)

v = np.zeros((GRID_H, GRID_W))                    # how charged up each neuron is right now
prev = None                                       # the last picture, so we can see what changed
spikes = np.zeros((GRID_H, GRID_W), dtype=bool)   # which neurons fired this frame
events = np.zeros((GRID_H, GRID_W))               # how much each square changed this frame


def step(frame_gray, brighter=False):
    """Give it one black-and-white picture. It gives back (x, y) to click, or None.
    brighter=False: reacts to spots getting darker (black dots).
    brighter=True:  reacts to spots getting brighter (LEDs turning on)."""
    global v, prev, spikes, events

    # 1. Squish the picture down to 64 x 48 by averaging blocks of pixels.
    h, w = frame_gray.shape
    small = frame_gray[: h - h % GRID_H, : w - w % GRID_W]   # cut off leftover edge pixels
    small = small.reshape(GRID_H, h // GRID_H, GRID_W, w // GRID_W).mean(axis=(1, 3))

    # The very first picture has nothing to compare to, so just remember it.
    if prev is None:
        prev = small
        return None

    # 2. How much did each square change? 0 = not at all, 1 = went fully black <-> white.
    change = (small - prev) if brighter else (prev - small)
    events = np.clip(change / 255, 0, 1)
    prev = small

    # 3. Charge up the neurons. Old charge leaks a bit, new change gets added.
    v = v * DECAY + events
    spikes = v >= THRESHOLD   # full enough? FIRE!
    v[spikes] = 0             # neurons that fired start over at 0

    # 4. Click the middle of all the neurons that fired.
    if not spikes.any():
        return None
    ys, xs = np.nonzero(spikes)
    cell_w, cell_h = w / GRID_W, h / GRID_H
    return (xs.mean() + 0.5) * cell_w, (ys.mean() + 0.5) * cell_h
