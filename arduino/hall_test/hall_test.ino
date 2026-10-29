// Hall sensor check for the arm Arduino. Nothing else: no servos.
// Upload, open Serial Monitor (9600 baud), and move a magnet near the sensor.
// It prints when the magnet comes and goes, and the Arduino's own light (pin 13) turns on while it feels one.
// If nothing changes, flip the magnet over: these sensors only feel one side.

const int HALL_PIN = 9;   // sensor S/OUT. + goes to 5V, - goes to GND

bool last = false;

void setup() {
  Serial.begin(9600);
  pinMode(HALL_PIN, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.println("Hall test ready. Bring a magnet near the sensor.");
}

void loop() {
  bool magnet = digitalRead(HALL_PIN) == LOW;
  digitalWrite(LED_BUILTIN, magnet ? HIGH : LOW);
  if (magnet != last) {
    Serial.println(magnet ? "MAGNET" : "no magnet");
    last = magnet;
  }

  // Every 2 seconds, say it's still alive (so you know the Arduino and Serial Monitor work).
  static unsigned long nextBeat = 0;
  if (millis() >= nextBeat) {
    Serial.print("... pin 9 reads ");
    Serial.println(magnet ? "MAGNET" : "no magnet");
    nextBeat = millis() + 2000;
  }
  delay(10);
}
