// Game arm Arduino: 3 servos + magnet sensor on the arm tip.
//   shoulder + elbow swing the tip over a hole, lift lowers the tip onto it.
// (Shoulder/elbow pins and the 9-spot table come from Coach's arm code.)
//
// Commands from the computer (9600 baud):
//   'H4'          hit hole 4: lift up, swing over hole 4, lower until the magnet, lift up. Replies "OK"
//   'Z'           go to rest (lift up first). Replies "OK"
//   'M90,90,30'   move servos to shoulder,elbow,lift angles (0-180), replies "OK". For finding the angles
//   'R'           read magnet sensor, replies "1" (magnet) or "0"
//
// Calibration (the app's "Calibrate arm" uses these). Saved in the Arduino's memory, so it survives unplugging:
//   'S4,105,75,30'  save hole 4 as shoulder,elbow,lift down. Replies "OK"
//   'U90'           save the lift-up angle. Replies "OK"
//   'G'             get everything, replies "C" + lift up + the 9 holes: "C90,45,30,30,60,45,30,..."
//
// Sends on its own:
//   "T"           the tip just touched a magnet (sent the moment it happens, even in the middle of a move)
//
// Holes are numbered like the app: 0 1 2 across the top row (as the camera sees the board), then 3 4 5, then 6 7 8.

#include <Servo.h>
#include <EEPROM.h>

const int SERVO_PINS[3] = {3, 5, 6};      // shoulder, elbow, lift
const int HALL_PIN = 9;                    // digital hall sensor (A3144 / KY-003): LOW = magnet
const int STEP_MS = 8;                     // ms per degree; bigger = slower, smoother arm
const int LIFT_STEP_MS = 15;               // lowering is slower, so the tip stops gently on the magnet
const byte SAVED = 0xA7;                   // EEPROM byte 0 = this once a calibration was saved

int liftUp = 90;                           // lift angle with the tip raised clear of the board

// Each hole = {shoulder, elbow, lift down}. These are only the starting guesses:
// once you calibrate with the app, the saved angles in the Arduino's memory are used instead.
// "Lift down" is just past where the tip touches; the arm stops early once it feels the magnet.
int holes[9][3] = {
  {45,  30, 30},   // 0
  {60,  45, 30},   // 1
  {75,  60, 30},   // 2
  {90,  60, 30},   // 3
  {105, 75, 30},   // 4
  {120, 90, 30},   // 5
  {135, 90, 30},   // 6
  {150, 105, 30},  // 7
  {165, 120, 30},  // 8
};
const int REST[2] = {90, 90};              // shoulder, elbow between rounds (with the lift up)

const int WAKE_MS = 400;                   // gap between switching on each servo

Servo servos[3];
int pos[3] = {REST[0], REST[1], 90};
bool touching = false;   // is the tip on a magnet right now?
bool awake = false;      // servos stay off (limp) after power-up until the first move

// Switch the servos on one at a time, lift first, instead of all at once at power-up.
// All 3 jumping together pulls so much power that the Arduino can restart over and over.
void wake() {
  if (awake) return;
  for (int i = 2; i >= 0; i--) {
    servos[i].write(pos[i]);   // set the angle before switching on, so it goes straight there
    servos[i].attach(SERVO_PINS[i]);
    delay(WAKE_MS);
  }
  awake = true;
}

// Memory layout: byte 0 = SAVED, byte 1 = lift up, then 3 bytes per hole. Angles are 0-180, so a byte each.
// Gives back false if it was never calibrated (then the guesses above are used).
bool loadCalibration() {
  if (EEPROM.read(0) != SAVED) return false;
  liftUp = EEPROM.read(1);
  for (int n = 0; n < 9; n++) {
    for (int i = 0; i < 3; i++) holes[n][i] = EEPROM.read(2 + n * 3 + i);
  }
  return true;
}

// Saves everything (update only writes bytes that changed, which is easy on the memory).
void saveCalibration() {
  EEPROM.update(1, liftUp);
  for (int n = 0; n < 9; n++) {
    for (int i = 0; i < 3; i++) EEPROM.update(2 + n * 3 + i, holes[n][i]);
  }
  EEPROM.update(0, SAVED);
}

// Say "T" the moment the tip lands on a magnet (once per touch, not over and over).
void checkTouch() {
  bool magnet = digitalRead(HALL_PIN) == LOW;
  if (magnet && !touching) {
    Serial.println("T");
  }
  touching = magnet;
}

// Move all servos one degree at a time so the arm doesn't jerk.
void moveTo(const int target[3]) {
  bool moving = true;
  while (moving) {
    moving = false;
    for (int i = 0; i < 3; i++) {
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

// Move just the lift, keeping shoulder and elbow where they are.
void lift(int angle) {
  int target[3] = {pos[0], pos[1], angle};
  moveTo(target);
}

// Lower the tip until it feels the magnet, or reaches the hole's "down" angle.
void lower(int down) {
  while (pos[2] != down && !touching) {
    pos[2] += (down > pos[2]) ? 1 : -1;
    servos[2].write(pos[2]);
    checkTouch();
    delay(LIFT_STEP_MS);
  }
}

// Lift up, swing over the hole, tap it, lift up again. Works from wherever the arm is.
void hit(int n) {
  lift(liftUp);
  int above[3] = {holes[n][0], holes[n][1], liftUp};
  moveTo(above);
  lower(holes[n][2]);
  delay(150);   // rest on the magnet a moment
  lift(liftUp);
}

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(50);   // don't wait a whole second for more digits after a number
  bool calibrated = loadCalibration();
  pos[2] = liftUp;
  pinMode(HALL_PIN, INPUT_PULLUP);   // the servos stay off until the first move: see wake()
  if (!calibrated) {   // never calibrated: start at shoulder 0, elbow 0 (lift up), a known spot to calibrate from
    pos[0] = 0;
    pos[1] = 0;
    wake();
  }
}

void loop() {
  checkTouch();
  if (!Serial.available()) {
    return;
  }
  char c = Serial.read();
  if (c == 'H' || c == 'Z' || c == 'M') wake();

  if (c == 'H') {
    int n = Serial.parseInt();
    if (n >= 0 && n < 9) {
      hit(n);
    }
    Serial.println("OK");
  } else if (c == 'Z') {
    lift(liftUp);
    int rest[3] = {REST[0], REST[1], liftUp};
    moveTo(rest);
    Serial.println("OK");
  } else if (c == 'S') {
    int n = Serial.parseInt();
    int angles[3];
    for (int i = 0; i < 3; i++) angles[i] = constrain(Serial.parseInt(), 0, 180);
    if (n >= 0 && n < 9) {
      for (int i = 0; i < 3; i++) holes[n][i] = angles[i];
      saveCalibration();
    }
    Serial.println("OK");
  } else if (c == 'U') {
    liftUp = constrain(Serial.parseInt(), 0, 180);
    saveCalibration();
    Serial.println("OK");
  } else if (c == 'G') {
    Serial.print("C");
    Serial.print(liftUp);
    for (int n = 0; n < 9; n++) {
      for (int i = 0; i < 3; i++) {
        Serial.print(",");
        Serial.print(holes[n][i]);
      }
    }
    Serial.println();
  } else if (c == 'M') {
    int target[3];
    for (int i = 0; i < 3; i++) {
      target[i] = constrain(Serial.parseInt(), 0, 180);
    }
    moveTo(target);
    Serial.println("OK");
  } else if (c == 'R') {
    Serial.println(digitalRead(HALL_PIN) == LOW ? 1 : 0);
  }
  // anything else (newlines, commas) is ignored
}
