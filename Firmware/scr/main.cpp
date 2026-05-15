  #include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ============================
// 1. NETWORK SETTINGS
// ============================
const char* ssid = "yue 4g";
const char* password = "yue56354321";

// ============================
// 2. JAVA BACKEND SETTINGS
// ============================
const char* serverUrl = "http://192.168.100.75:8080/api/tank/sync";

// ============================
// 3. HARDWARE IDENTITY
// ============================
const char* myTankId = "38283159";

// ============================
// 4. PIN DEFINITIONS
// ============================
const int trigPin = 5;
const int echoPin = 18;
const int relayPin = 19;

// ============================
// 5. GLOBAL VARIABLES
// ============================
float tankHeight = 100.0;
float lowLimit = 20.0;
float highLimit = 90.0;

String pumpCommand = "AUTO_OFF";

float lastWaterLevel = -1.0;

// ============================
// 6. MOVING AVERAGE FILTER
// ============================
const int numReadings = 10;

float readings[numReadings];
int readIndex = 0;
float total = 0;

// ============================
// WIFI CONNECT FUNCTION
// ============================
void connectToWiFi() {

  Serial.println();
  Serial.println("=================================");
  Serial.println("CONNECTING TO WIFI...");
  Serial.println("=================================");

  WiFi.mode(WIFI_STA);

  // Clear previous WiFi state
  WiFi.disconnect(true);

  delay(1000);

  WiFi.begin(ssid, password);

  int retries = 0;

  while (WiFi.status() != WL_CONNECTED && retries < 20) {

    delay(500);

    Serial.print(".");

    retries++;
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {

    Serial.println("=================================");
    Serial.println("WIFI CONNECTED SUCCESSFULLY!");
    Serial.println("=================================");

    Serial.print("ESP32 IP ADDRESS: ");
    Serial.println(WiFi.localIP());

  } else {

    Serial.println("=================================");
    Serial.println("FAILED TO CONNECT WIFI");
    Serial.println("RESTARTING ESP...");
    Serial.println("=================================");

    delay(3000);

    ESP.restart();
  }
}

// ============================
// SETUP
// ============================
void setup() {

  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println("=================================");
  Serial.println("SMART WATER TANK SYSTEM STARTING");
  Serial.println("=================================");

  // Initialize filter values
  for (int i = 0; i < numReadings; i++) {

    readings[i] = 0;
  }

  // Pin setup
  pinMode(trigPin, OUTPUT);

  pinMode(echoPin, INPUT);

  pinMode(relayPin, OUTPUT);

  // Active LOW relay
  digitalWrite(relayPin, HIGH);

  // Connect WiFi
  connectToWiFi();
}

// ============================
// LOOP
// ============================
void loop() {

  // ==========================
  // WIFI AUTO RECONNECT
  // ==========================
  if (WiFi.status() != WL_CONNECTED) {

    Serial.println();
    Serial.println("WIFI LOST!");
    Serial.println("RECONNECTING...");

    connectToWiFi();

    delay(3000);

    return;
  }

  // ==========================
  // ULTRASONIC SENSOR
  // ==========================
  total = total - readings[readIndex];

  digitalWrite(trigPin, LOW);

  delayMicroseconds(2);

  digitalWrite(trigPin, HIGH);

  delayMicroseconds(10);

  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000);

  float rawDistance = duration * 0.034 / 2;

  // Invalid reading protection
  if (rawDistance > 400 || rawDistance <= 0) {

    rawDistance = readings[(readIndex - 1 + numReadings) % numReadings];
  }

  readings[readIndex] = rawDistance;

  total = total + readings[readIndex];

  readIndex = (readIndex + 1) % numReadings;

  float distanceCm = total / (float)numReadings;

  // ==========================
  // WATER LEVEL COMPUTATION
  // ==========================
  float currentLevel =
      ((tankHeight - distanceCm) / tankHeight) * 100.0;

  if (currentLevel < 0)
    currentLevel = 0;

  if (currentLevel > 100)
    currentLevel = 100;

  // ==========================
  // ANALYTICS LOGIC
  // ==========================
  float volumeChange = 0.0;

  String actionLabel = "CONSUMPTION";

  if (lastWaterLevel != -1.0) {

    if (currentLevel > lastWaterLevel + 0.5) {

      volumeChange = currentLevel - lastWaterLevel;

      actionLabel = "AUTO REFILL TRIGGERED";
    }

    else if (lastWaterLevel > currentLevel + 0.5) {

      volumeChange = lastWaterLevel - currentLevel;

      actionLabel = "CONSUMPTION";
    }
  }

  lastWaterLevel = currentLevel;

  // ==========================
  // JSON PAYLOAD
  // ==========================
  StaticJsonDocument<256> doc;

  doc["tankId"] = myTankId;

  doc["rawDistance"] = distanceCm;

  doc["usageAmount"] = volumeChange;

  doc["action"] = actionLabel;

  String jsonString;

  serializeJson(doc, jsonString);

  // ==========================
  // SEND TO SPRING BOOT API
  // ==========================
  HTTPClient http;

  http.begin(serverUrl);

  http.addHeader("Content-Type", "application/json");

  Serial.println();
  Serial.println("SENDING DATA TO SERVER...");

  int httpResponseCode = http.POST(jsonString);

  // ==========================
  // SUCCESS RESPONSE
  // ==========================
  if (httpResponseCode == 200) {

    String responseBody = http.getString();

    StaticJsonDocument<300> resDoc;

    deserializeJson(resDoc, responseBody);

    pumpCommand = resDoc["pumpCommand"].as<String>();

    lowLimit = resDoc["lowLimit"].as<float>();

    highLimit = resDoc["highLimit"].as<float>();

    tankHeight = resDoc["tankHeight"].as<float>();

    // Relay Control
    if (pumpCommand == "AUTO_ON") {

      digitalWrite(relayPin, LOW);

    } else {

      digitalWrite(relayPin, HIGH);
    }

    Serial.println("=================================");
    Serial.println("SYNC SUCCESS");
    Serial.println("=================================");

    Serial.printf("DISTANCE: %.2f CM\n", distanceCm);

    Serial.printf("WATER LEVEL: %.1f %%\n", currentLevel);

    Serial.printf("PUMP COMMAND: %s\n", pumpCommand.c_str());

    Serial.printf("ACTION: %s\n", actionLabel.c_str());

  }

  // ==========================
  // HTTP FAILED
  // ==========================
  else {

    Serial.println("=================================");
    Serial.println("HTTP SYNC FAILED");
    Serial.println("=================================");

    Serial.print("HTTP ERROR CODE: ");

    Serial.println(httpResponseCode);
  }

  http.end();

  // ==========================
  // LOOP DELAY
  // ==========================
  delay(5000);
}