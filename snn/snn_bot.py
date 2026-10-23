# Lets the SNN play Click the Dot on your real screen.
# Open the game on the LEFT half of your screen, run this, and keep your hands off the mouse.
import time

import numpy as np
import pyautogui

import snn.snn_core as brain

# Mac screenshots have 2x the pixels the mouse uses, so we fix that when clicking.
scale = pyautogui.screenshot().width / pyautogui.size().width

print("Starting in 3 seconds...")
time.sleep(3)

while True:
    screen = np.array(pyautogui.screenshot().convert("L"))   # take a black-and-white screenshot
    screen = screen[:, : screen.shape[1] // 2]               # only look at the left half

    target = brain.step(screen)   # the brain says "click here" or nothing
    if target is not None:
        x, y = target
        pyautogui.click(x / scale, y / scale)
        print("clicked", int(x / scale), int(y / scale))
