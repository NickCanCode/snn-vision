// Game arm Arduino: 2 servos + magnet sensor on the arm tip.
//
// Commands from the computer (9600 baud):
//   'M90,45'   move servos to base,arm angles (0-180), replies "OK" when there
//   'P3'       move to preset 3 from the presets table below, replies "OK" when there
//   'R'        read magnet sensor, replies "1" (magnet) or "0"
//
// Sends on its own:
//   "T"        the tip just touched a magnet (sent the moment it happens, even in the middle of a move)

#include <Servo.h>

const int SERVO_PINS[2] = {11, 12};       // base (rotate), arm (up/down)
const int HALL_PIN = A0;                   // digital hall sensor (A3144 / KY-003): LOW = magnet
const int STEP_MS = 8;                     // ms per degree; bigger = slower, smoother arm

// Each preset = {base angle, arm angle}. Preset 0 is row 0, preset 1 is row 1, ...
int presets[][2] = {
  {0,   90},
  {45,  90},
  {90,  90},
  {135, 90},
  {180, 90},
};
int count = sizeof(presets) / sizeof(presets[0]);

Servo servos[2];
int pos[2] = {90, 90};
bool touching = false;   // is the tip on a magnet right now?

// Say "T" the moment the tip lands on a magnet (once per touch, not over and over).
void checkTouch() {
  bool magnet = digitalRead(HALL_PIN) == LOW;
  if (magnet && !touching) {
    Serial.println("T");
  }
  touching = magnet;
}

// Move all servos one degree at a time so the arm doesn't jerk.
void moveTo(int target[2]) {
  bool moving = true;
  while (moving) {
    moving = false;
    for (int i = 0; i < 2; i++) {
      if (pos[i] != target[i]) {
        pos[i] += (target[i] > pos[i]) ? 1 : -1;
        servos[i].write(pos[i]);
        moving = true;
      }
    }
    checkTouch();
    delay(STEP_MS);
  }
}

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(50);   // don't wait a whole second for more digits after a number
  for (int i = 0; i < 2; i++) {
    servos[i].attach(SERVO_PINS[i]);
    servos[i].write(pos[  i]);
  }
  pinMode(HALL_PIN, INPUT_PULLUP);
}

void loop() {
  checkTouch();
  if (!Serial.available()) {
    return;
  }
  char c = Serial.read();

  if (c == 'M') {
    int target[2];
    for (int i = 0; i < 2; i++) {
      target[i] = constrain(Serial.parseInt(), 0, 180);
    }
    moveTo(target);
    Serial.println("OK");
  } else if (c == 'P') {
    int n = Serial.parseInt();
    if (n >= 0 && n < count) {
      moveTo(presets[n]);
    }
    Serial.println("OK");
  } else if (c == 'R') {
    Serial.println(digitalRead(HALL_PIN) == LOW ? 1 : 0);
  }
  // anything else (newlines, commas) is ignored
}
