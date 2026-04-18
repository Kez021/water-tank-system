#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ============================================================
// STEP 1 — SET YOUR WIFI
// ============================================================
const char* ssid     = "YOUR_WIFI_NAME";      // <-- palitan ng pangalan ng WiFi mo
const char* password = "YOUR_WIFI_PASSWORD";  // <-- palitan ng password ng WiFi mo

// ============================================================
// STEP 2 — SET YOUR SERVER URL
// For LOCAL testing (laptop + IntelliJ running):
//   Find your laptop IP: open CMD → type ipconfig → look for IPv4
//   Then paste it here like: "http://192.168.1.5:8080/api/tank/sync"
// After Railway deployment:
//   "https://your-app-name.up.railway.app/api/tank/sync"
// ============================================================
const char* serverUrl = "http://YOUR_LAPTOP_IP:8080/api/tank/sync"; // <-- palitan

// ============================================================
// STEP 3 — SET YOUR TANK ID
// This must match the Tank ID registered in your system
// ============================================================
const char* myTankId = "62714172"; // <-- palitan kung nagbago

// ============================================================
// PIN DEFINITIONS (do not change unless you rewired)
// ============================================================
const int trigPin  = 5;
const int echoPin  = 18;
const int relayPin = 19;

// ============================================================
// DYNAMIC VARIABLES
// ============================================================
float tankHeight  = 100.0;
float lowLimit    = 20.0;
float highLimit   = 90.0;
String pumpCommand = "AUTO_OFF";
float lastWaterLevel = -1.0;

// Moving Average Filter (smooths sensor noise)
const int numReadings = 10;
float readings[numReadings];
int   readIndex = 0;
float total     = 0;

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);

  for (int i = 0; i < numReadings; i++) readings[i] = 0;

  pinMode(trigPin,  OUTPUT);
  pinMode(echoPin,  INPUT);
  pinMode(relayPin, OUTPUT);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected!");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

// ============================================================
// MAIN LOOP
// ============================================================
void loop() {
  if (WiFi.status() == WL_CONNECTED) {

    // STEP A: Moving Average Filter on ultrasonic readings
    total -= readings[readIndex];

    digitalWrite(trigPin, LOW);  delayMicroseconds(2);
    digitalWrite(trigPin, HIGH); delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    long duration    = pulseIn(echoPin, HIGH, 30000);
    float rawDistance = duration * 0.034 / 2;

    // Replace invalid readings with last known good value
    if (rawDistance > 400 || rawDistance <= 0) {
      rawDistance = readings[(readIndex - 1 + numReadings) % numReadings];
    }

    readings[readIndex] = rawDistance;
    total += readings[readIndex];
    readIndex = (readIndex + 1) % numReadings;
    float distanceCm = total / (float)numReadings;

    // STEP B: Calculate water level %
    float currentLevel = ((tankHeight - distanceCm) / tankHeight) * 100.0;
    if (currentLevel < 0)   currentLevel = 0;
    if (currentLevel > 100) currentLevel = 100;

    // STEP C: Detect consumption vs refill
    float volumeChange = 0.0;
    String actionLabel = "Consumption";

    if (lastWaterLevel != -1.0) {
      if (currentLevel > lastWaterLevel + 0.5) {
        volumeChange = currentLevel - lastWaterLevel;
        actionLabel  = "Auto Refill Triggered";
      } else if (lastWaterLevel > currentLevel + 0.5) {
        volumeChange = lastWaterLevel - currentLevel;
        actionLabel  = "Consumption";
      }
    }
    lastWaterLevel = currentLevel;

    // STEP D: Build JSON payload
    StaticJsonDocument<256> doc;
    doc["tankId"]      = myTankId;
    doc["rawDistance"] = distanceCm;
    doc["usageAmount"] = volumeChange;
    doc["action"]      = actionLabel;

    String jsonString;
    serializeJson(doc, jsonString);

    // STEP E: POST to Spring Boot backend
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    int httpResponseCode = http.POST(jsonString);

    if (httpResponseCode == 200) {
      String responseBody = http.getString();
      StaticJsonDocument<300> resDoc;
      deserializeJson(resDoc, responseBody);

      pumpCommand = resDoc["pumpCommand"].as<String>();
      lowLimit    = resDoc["lowLimit"].as<float>();
      highLimit   = resDoc["highLimit"].as<float>();
      tankHeight  = resDoc["tankHeight"].as<float>();

      if (pumpCommand == "AUTO_ON") {
        digitalWrite(relayPin, HIGH);
      } else {
        digitalWrite(relayPin, LOW);
      }

      Serial.printf("Sync OK | Dist: %.2fcm | Level: %.1f%% | Cmd: %s\n",
                    distanceCm, currentLevel, pumpCommand.c_str());
    } else {
      Serial.printf("Sync Failed. HTTP Code: %d\n", httpResponseCode);
    }
    http.end();

  } else {
    Serial.println("WiFi disconnected. Maintaining last state...");
    WiFi.begin(ssid, password);
  }

  delay(5000); // sync every 5 seconds
}
