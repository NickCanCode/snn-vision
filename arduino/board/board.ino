// Game board Arduino: 9 LEDs, one per hole.
//
// Commands from the computer (9600 baud):
//   '0'-'8'   light that hole's LED (others off)
//   'x'       all LEDs off

// The pin for each hole, in the computer's order: hole 0 is top left, hole 8 is bottom right.
// The board is wired like a number pad (light 1 = bottom left = pin 2), so the top row comes first here:
//   top row     pins  8  9 10   (lights 7 8 9)
//   middle row  pins  5  6  7   (lights 4 5 6)
//   bottom row  pins  2  3  4   (lights 1 2 3)
int leds[9] = {8, 9, 10, 5, 6, 7, 2, 3, 4};

void ledsOff() {
  for (int i = 0; i < 9; i++) {
    digitalWrite(leds[i], LOW);
  }
}

void setup() {
  Serial.begin(9600);
  for (int i = 0; i < 9; i++) {
    pinMode(leds[i], OUTPUT);
  }
}

void loop() {
  if (!Serial.available()) {
    return;
  }
  char c = Serial.read();

  if (c >= '0' && c <= '8') {
    ledsOff();
    digitalWrite(leds[c - '0'], HIGH);
  } else if (c == 'x') {
    ledsOff();
  }
  // anything else (newlines) is ignored
}
