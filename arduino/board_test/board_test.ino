// Board light test: checks the 9 LEDs are wired right. No computer program needed.
//
// Upload it, then open Tools > Serial Monitor at 9600 baud and watch the board:
//   1. Lights holes 0 to 8 one at a time. The Serial Monitor says which hole should be lit,
//      so you can check each LED is in the right spot (0 = top left, 8 = bottom right).
//   2. Lights all 9 at once (if some go dim, the power can't keep up).
//   3. All off, then starts again.
// The board's "L" light blinks on pin 13 so you know the sketch is running.

int leds[9] = {8, 9, 10, 5, 6, 7, 2, 3, 4};   // same pins as board.ino: hole 0 (top left) first, wired like a number pad
const int STEP_MS = 600;                       // how long each hole stays lit

void allLeds(int level) {
  for (int i = 0; i < 9; i++) {
    digitalWrite(leds[i], level);
  }
}

void setup() {
  Serial.begin(9600);
  pinMode(13, OUTPUT);
  for (int i = 0; i < 9; i++) {
    pinMode(leds[i], OUTPUT);
  }
  allLeds(LOW);
}

void loop() {
  for (int i = 0; i < 9; i++) {
    Serial.print("Hole ");
    Serial.print(i);
    Serial.print(" (pin ");
    Serial.print(leds[i]);
    Serial.println(")");
    digitalWrite(leds[i], HIGH);
    digitalWrite(13, i % 2);
    delay(STEP_MS);
    digitalWrite(leds[i], LOW);
  }

  Serial.println("All on");
  allLeds(HIGH);
  delay(1500);

  Serial.println("All off");
  allLeds(LOW);
  delay(1000);
}
