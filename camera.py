# Looks at the Wack-a-Fly board through the camera and cuts out a little square around each hole.
# Run it on its own (python camera.py) to check the squares line up with your board.
import cv2
import numpy as np

CAMERA = 0   # 0 = the Mac's own camera. Try 1 or 2 for a USB camera or an iPhone.
BOX = 80     # how big the square around each hole is, in pixels

# Where each of the 9 holes is in the camera picture (x, y). Change these to match your board.
HOLES = [
    (110, 120), (320, 120), (530, 120),
    (110, 240), (320, 240), (530, 240),
    (110, 360), (320, 360), (530, 360),
]


def split(frame):
    """Cut a square around each hole and blow it up to 160 x 160. Gives back 9 small pictures."""
    holes = []
    for x, y in HOLES:
        crop = frame[y - BOX // 2 : y + BOX // 2, x - BOX // 2 : x + BOX // 2]
        holes.append(cv2.resize(crop, (160, 160)))
    return holes


if __name__ == "__main__":
    cam = cv2.VideoCapture(CAMERA)
    while True:
        ok, frame = cam.read()
        if not ok:
            print("No picture from camera", CAMERA, "- try a different CAMERA number at the top")
            break

        holes = split(frame)
        grid = np.vstack([np.hstack(holes[0:3]), np.hstack(holes[3:6]), np.hstack(holes[6:9])])   # 3 x 3 like the board
        gray = cv2.cvtColor(grid, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (11, 11), 0)                     # blur out tiny specks
        _, gray = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)     # keep only the bright bits (lit LEDs)

        cv2.imshow("camera", frame)
        cv2.imshow("holes", gray)

        # The brightest hole is the one with its LED on.
        brightness = [cv2.cvtColor(h, cv2.COLOR_BGR2GRAY).mean() for h in holes]
        print("lit hole:", brightness.index(max(brightness)))

        if cv2.waitKey(1) == ord("q"):   # press q to quit
            break
