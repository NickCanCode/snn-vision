// Sensor Arduino: 9 hall-effect sensors, one under each hole of the Wack-a-Fly board.
// When a magnet touches a hole, it tells the computer which hole.
//
// Sends to the computer (9600 baud):
//   "H4"   the magnet just touched hole 4 (holes are 0-8)
//
// Sensors are the on/off kind (A3144 / KY-003): LOW = magnet there.

// Which pin each hole's sensor is wired to. Hole 0 first, hole 8 last. Change to match your wiring.
const int SENSORS[9] = {2, 3, 4, 5, 6, 7, 8, 9, 10};
const int SETTLE_MS = 30;   // a magnet has to stay this long to count (stops jittery double reports)

bool touching[9];           // does each hole have the magnet right now?
unsigned long changedAt[9];

void setup() {
  Serial.begin(9600);
  for (int i = 0; i < 9; i++) {
    pinMode(SENSORS[i], INPUT_PULLUP);
    touching[i] = false;
    changedAt[i] = 0;
  }
}

void loop() {
  for (int i = 0; i < 9; i++) {
    bool magnet = digitalRead(SENSORS[i]) == LOW;
    if (magnet == touching[i]) {
      changedAt[i] = millis();          // nothing new, keep waiting
    } else if (millis() - changedAt[i] >= SETTLE_MS) {
      touching[i] = magnet;             // it really changed
      if (magnet) {                     // only report the moment the magnet arrives
        Serial.print("H");
        Serial.println(i);
      }
    }
  }
}
