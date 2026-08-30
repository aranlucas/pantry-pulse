#include <Arduino.h>
#include <ArduinoJson.h>
#include <algorithm>
#include <HTTPClient.h>
#include <MFRC522.h>
#include <Preferences.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#if __has_include("../config.h")
#include "../config.h"
#else
#error "Copy config.example.h to config.h before building"
#endif

namespace {
constexpr unsigned long kWifiRetryMs = 5000;
constexpr unsigned long kDuplicateScanWindowMs = 2500;
constexpr unsigned long kButtonDebounceMs = 45;
constexpr unsigned long kHttpTimeoutMs = 8000;
constexpr unsigned long kOutboxRetryMinMs = 1000;
constexpr unsigned long kOutboxRetryMaxMs = 60000;
constexpr size_t kMaxOutboxEvents = 24;
constexpr char kLegacyOutboxKey[] = "events";

enum class ScanMode { Restock, Consume };
enum class SendResult { Accepted, Retry, Drop };

MFRC522 reader(RFID_SS_PIN, RFID_RST_PIN);
Preferences preferences;
JsonDocument outbox;
ScanMode mode = ScanMode::Consume;
String lastTag;
unsigned long lastScanAt = 0;
unsigned long lastWifiAttemptAt = 0;
unsigned long lastButtonChangeAt = 0;
bool lastButtonReading = HIGH;
bool stableButtonState = HIGH;
bool endpointConfigured = false;
unsigned long nextOutboxAttemptAt = 0;
unsigned long outboxRetryMs = kOutboxRetryMinMs;
uint32_t nextSequence = 1;

String outboxSlotKey(size_t slot) {
  char key[5];
  snprintf(key, sizeof(key), "e%02u", static_cast<unsigned>(slot));
  return String(key);
}

bool outboxSlotUsed(size_t slot) {
  const String key = outboxSlotKey(slot);
  return preferences.isKey(key.c_str());
}

struct StoredEvent {
  String tag;
  String eventId;
  String mode;
  size_t slot;
  uint32_t sequence;
};

uint32_t eventSequence(JsonObjectConst event, uint32_t fallback) {
  const uint32_t sequence = event["sequence"] | fallback;
  return sequence == 0 ? fallback : sequence;
}

bool eventComesBefore(const StoredEvent& left, const StoredEvent& right) {
  return left.sequence < right.sequence;
}

void sortStoredEvents(StoredEvent* events, size_t count) {
  std::sort(events, events + count, eventComesBefore);
}

void appendStoredEvent(JsonArray events, const StoredEvent& stored) {
  JsonObject event = events.add<JsonObject>();
  event["tag"] = stored.tag;
  event["eventId"] = stored.eventId;
  event["mode"] = stored.mode;
  event["slot"] = stored.slot;
  event["sequence"] = stored.sequence;
}

bool persistEvent(size_t slot, JsonObjectConst event) {
  JsonDocument record;
  record["tag"] = event["tag"] | "";
  record["eventId"] = event["eventId"] | "";
  record["mode"] = event["mode"] | "consume";
  record["slot"] = slot;
  record["sequence"] = event["sequence"] | 0;

  String encoded;
  serializeJson(record, encoded);
  const String key = outboxSlotKey(slot);
  const size_t written = preferences.putString(key.c_str(), encoded);
  if (written != encoded.length()) {
    Serial.printf("Could not persist outbox slot %u\n", static_cast<unsigned>(slot));
    preferences.remove(key.c_str());
    return false;
  }

  // NVS writes are checked by both returned length and readback before the
  // corresponding event is admitted to the in-memory queue.
  if (preferences.getString(key.c_str(), "") != encoded) {
    Serial.printf("Outbox slot %u failed readback verification\n", static_cast<unsigned>(slot));
    preferences.remove(key.c_str());
    return false;
  }
  return true;
}

bool removePersistedEvent(size_t slot) {
  const String key = outboxSlotKey(slot);
  if (!preferences.isKey(key.c_str())) return true;
  if (!preferences.remove(key.c_str()) || preferences.isKey(key.c_str())) {
    Serial.printf("Could not remove outbox slot %u\n", static_cast<unsigned>(slot));
    return false;
  }
  return true;
}

void flashStatus(int pulses, int onMs = 90, int offMs = 90) {
  for (int pulse = 0; pulse < pulses; ++pulse) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    delay(onMs);
    digitalWrite(STATUS_LED_PIN, LOW);
    delay(offMs);
  }
}

const char* modeName(ScanMode selectedMode) {
  return selectedMode == ScanMode::Restock ? "restock" : "consume";
}

const char* modeName() { return modeName(mode); }

void printMode() {
  Serial.printf("Mode: %s\n", modeName());
  flashStatus(mode == ScanMode::Restock ? 2 : 1, 70, 70);
}

void updateModeButton() {
  const bool reading = digitalRead(MODE_BUTTON_PIN);
  const unsigned long now = millis();

  if (reading != lastButtonReading) {
    lastButtonChangeAt = now;
    lastButtonReading = reading;
  }

  if (now - lastButtonChangeAt < kButtonDebounceMs || reading == stableButtonState) return;

  stableButtonState = reading;
  if (stableButtonState == LOW) {
    mode = mode == ScanMode::Restock ? ScanMode::Consume : ScanMode::Restock;
    printMode();
  }
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;

  const unsigned long now = millis();
  if (now - lastWifiAttemptAt < kWifiRetryMs) return;
  lastWifiAttemptAt = now;

  Serial.println("Connecting to Wi-Fi...");
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

String uidString(const MFRC522::Uid& uid) {
  String result;
  result.reserve(uid.size * 2);
  constexpr char digits[] = "0123456789ABCDEF";

  for (byte index = 0; index < uid.size; ++index) {
    result += digits[(uid.uidByte[index] >> 4) & 0x0F];
    result += digits[uid.uidByte[index] & 0x0F];
  }
  return result;
}

String newEventId(const String& tag, ScanMode selectedMode) {
  char buffer[120];
  snprintf(
      buffer,
      sizeof(buffer),
      "%s:%08lX:%08lX:%s:%s",
      DEVICE_ID,
      static_cast<unsigned long>(millis()),
      static_cast<unsigned long>(esp_random()),
      tag.c_str(),
      modeName(selectedMode));
  return String(buffer);
}

SendResult sendScan(const String& tag, const String& eventId, ScanMode selectedMode) {
  if (!endpointConfigured) return SendResult::Retry;
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Scan held: Wi-Fi is offline");
    return SendResult::Retry;
  }

  WiFiClientSecure client;
  client.setCACert(TLS_ROOT_CA);

  HTTPClient http;
  http.setTimeout(kHttpTimeoutMs);
  const String endpoint = String(WORKER_BASE_URL) + "/api/device/scans";
  if (!http.begin(client, endpoint)) {
    Serial.println("Could not initialize HTTPS request");
    return SendResult::Retry;
  }

  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("Content-Type", "application/json");

  JsonDocument payload;
  payload["eventId"] = eventId;
  payload["tagUid"] = tag;
  payload["mode"] = modeName(selectedMode);
  payload["amount"] = 1;

  String requestBody;
  serializeJson(payload, requestBody);
  const int status = http.POST(requestBody);
  http.end();

  if (status >= 200 && status < 300) {
    Serial.printf("Recorded %s for tag %s (%d)\n", modeName(selectedMode), tag.c_str(), status);
    flashStatus(1, 220, 40);
    return SendResult::Accepted;
  }

  // A negative HTTPClient status means the request did not receive an HTTP
  // response. It is safe to retry because the Worker never had a response
  // that could be interpreted as a per-event rejection.
  if (status < 0 || status == 429 || status >= 500) {
    Serial.printf("Transient Worker failure for scan (%d); retrying\n", status);
    flashStatus(4, 45, 55);
    return SendResult::Retry;
  }

  if (status == 404) {
    Serial.printf("Tag %s is not linked. Open Pantry Pulse to link it.\n", tag.c_str());
    flashStatus(3, 80, 80);
  } else {
    Serial.printf("Worker rejected scan with HTTP %d\n", status);
    flashStatus(4, 45, 55);
  }
  return SendResult::Drop;
}

JsonArray outboxEvents() {
  if (!outbox["events"].is<JsonArray>()) outbox["events"].to<JsonArray>();
  return outbox["events"].as<JsonArray>();
}

void loadOutbox() {
  StoredEvent stored[kMaxOutboxEvents];
  bool occupied[kMaxOutboxEvents] = {};
  size_t count = 0;
  uint32_t largestSequence = 0;

  for (size_t slot = 0; slot < kMaxOutboxEvents; ++slot) {
    const String key = outboxSlotKey(slot);
    if (!preferences.isKey(key.c_str())) continue;

    const String encoded = preferences.getString(key.c_str(), "");
    JsonDocument record;
    if (encoded.isEmpty() || deserializeJson(record, encoded) != DeserializationError::Ok) {
      Serial.printf("Discarding malformed local outbox slot %u\n", static_cast<unsigned>(slot));
      preferences.remove(key.c_str());
      continue;
    }

    const String tag = record["tag"] | "";
    const String eventId = record["eventId"] | "";
    const String storedMode = record["mode"] | "consume";
    if (tag.isEmpty() || eventId.isEmpty()) {
      Serial.printf("Discarding incomplete local outbox slot %u\n", static_cast<unsigned>(slot));
      preferences.remove(key.c_str());
      continue;
    }

    const uint32_t sequence = eventSequence(record.as<JsonObjectConst>(), slot + 1);
    stored[count++] = {tag, eventId, storedMode, slot, sequence};
    occupied[slot] = true;
    largestSequence = max(largestSequence, sequence);
  }

  // Migrate queues written by the original single-string implementation. A
  // legacy record is skipped once its event ID is already present in a slot,
  // so a failed legacy-key removal cannot duplicate a successfully migrated
  // event on the next reboot.
  if (preferences.isKey(kLegacyOutboxKey)) {
    const String encoded = preferences.getString(kLegacyOutboxKey, "");
    JsonDocument legacy;
    bool migrationComplete = true;
    if (!encoded.isEmpty() && deserializeJson(legacy, encoded) == DeserializationError::Ok) {
      JsonArray legacyEvents = legacy["events"].as<JsonArray>();
      for (JsonObjectConst legacyEvent : legacyEvents) {
        const String tag = legacyEvent["tag"] | "";
        const String eventId = legacyEvent["eventId"] | "";
        const String storedMode = legacyEvent["mode"] | "consume";
        if (tag.isEmpty() || eventId.isEmpty()) continue;

        bool alreadyMigrated = false;
        for (size_t index = 0; index < count; ++index) {
          if (stored[index].eventId == eventId) {
            alreadyMigrated = true;
            break;
          }
        }
        if (alreadyMigrated) continue;

        size_t slot = kMaxOutboxEvents;
        for (size_t candidate = 0; candidate < kMaxOutboxEvents; ++candidate) {
          if (!occupied[candidate]) {
            slot = candidate;
            break;
          }
        }
        if (slot == kMaxOutboxEvents || count == kMaxOutboxEvents) {
          migrationComplete = false;
          break;
        }

        JsonDocument candidate;
        candidate["tag"] = tag;
        candidate["eventId"] = eventId;
        candidate["mode"] = storedMode;
        candidate["sequence"] = largestSequence == UINT32_MAX ? 1 : largestSequence + 1;
        if (!persistEvent(slot, candidate.as<JsonObjectConst>())) {
          migrationComplete = false;
          break;
        }

        const uint32_t sequence = candidate["sequence"] | 1;
        stored[count++] = {tag, eventId, storedMode, slot, sequence};
        occupied[slot] = true;
        largestSequence = sequence;
      }
    }

    if (migrationComplete) {
      if (!preferences.remove(kLegacyOutboxKey) || preferences.isKey(kLegacyOutboxKey)) {
        Serial.println("Migrated outbox, but could not remove its legacy NVS key");
      }
    } else {
      Serial.println("Legacy outbox migration is incomplete; it will resume later");
    }
  }

  sortStoredEvents(stored, count);
  JsonArray events = outboxEvents();
  for (size_t index = 0; index < count; ++index) appendStoredEvent(events, stored[index]);
  nextSequence = largestSequence == UINT32_MAX ? 1 : largestSequence + 1;
  Serial.printf("Loaded %u pending scan(s)\n", static_cast<unsigned>(outboxEvents().size()));
}

bool enqueueScan(const String& tag, const String& eventId, ScanMode selectedMode) {
  JsonArray events = outboxEvents();
  if (events.size() >= kMaxOutboxEvents) {
    Serial.println("Outbox full: scan was not accepted. Restore connectivity before scanning again.");
    flashStatus(6, 45, 45);
    return false;
  }

  size_t slot = kMaxOutboxEvents;
  for (size_t candidate = 0; candidate < kMaxOutboxEvents; ++candidate) {
    if (!outboxSlotUsed(candidate)) {
      slot = candidate;
      break;
    }
  }
  if (slot == kMaxOutboxEvents) {
    Serial.println("Outbox storage is full: scan was not accepted.");
    flashStatus(6, 45, 45);
    return false;
  }

  JsonDocument candidate;
  candidate["tag"] = tag;
  candidate["eventId"] = eventId;
  candidate["mode"] = modeName(selectedMode);
  candidate["sequence"] = nextSequence;
  if (!persistEvent(slot, candidate.as<JsonObjectConst>())) {
    flashStatus(7, 45, 45);
    return false;
  }

  StoredEvent stored = {tag, eventId, modeName(selectedMode), slot, nextSequence};
  appendStoredEvent(events, stored);
  if (nextSequence == UINT32_MAX) {
    nextSequence = 1;
  } else {
    ++nextSequence;
  }
  Serial.printf("Queued %s for tag %s (%u pending)\n", modeName(selectedMode), tag.c_str(), static_cast<unsigned>(events.size()));
  return true;
}

void processOutbox() {
  JsonArray events = outboxEvents();
  if (events.isNull() || events.size() == 0 || !endpointConfigured) return;

  const unsigned long now = millis();
  if (static_cast<long>(now - nextOutboxAttemptAt) < 0) return;

  JsonObject event = events[0];
  const String tag = event["tag"] | "";
  const String eventId = event["eventId"] | "";
  const String storedMode = event["mode"] | "consume";
  const ScanMode selectedMode = storedMode == "restock" ? ScanMode::Restock : ScanMode::Consume;

  if (tag.isEmpty() || eventId.isEmpty()) {
    Serial.println("Discarding malformed local outbox record");
    const size_t slot = event["slot"] | kMaxOutboxEvents;
    if (!removePersistedEvent(slot)) return;
    events.remove(0);
    return;
  }

  const SendResult result = sendScan(tag, eventId, selectedMode);
  if (result == SendResult::Accepted || result == SendResult::Drop) {
    const size_t slot = event["slot"] | kMaxOutboxEvents;
    if (slot >= kMaxOutboxEvents) {
      Serial.println("Outbox record has no valid persistence slot; retaining it");
      return;
    }
    if (!removePersistedEvent(slot)) return;
    events.remove(0);
    if (result == SendResult::Drop) {
      Serial.printf("Dropped terminal scan failure for tag %s\n", tag.c_str());
    }
    outboxRetryMs = kOutboxRetryMinMs;
    nextOutboxAttemptAt = now;
    return;
  }

  nextOutboxAttemptAt = now + outboxRetryMs;
  outboxRetryMs = min(outboxRetryMs * 2, kOutboxRetryMaxMs);
}

void handleCard() {
  if (!reader.PICC_IsNewCardPresent() || !reader.PICC_ReadCardSerial()) return;

  const String tag = uidString(reader.uid);
  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();

  const unsigned long now = millis();
  if (tag == lastTag && now - lastScanAt < kDuplicateScanWindowMs) return;

  lastTag = tag;
  lastScanAt = now;
  const ScanMode selectedMode = mode;
  const String eventId = newEventId(tag, selectedMode);
  enqueueScan(tag, eventId, selectedMode);
}
}  // namespace

void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(MODE_BUTTON_PIN, INPUT_PULLUP);
  digitalWrite(STATUS_LED_PIN, LOW);

  SPI.begin();
  reader.PCD_Init();
  preferences.begin("pantry-pulse", false);
  loadOutbox();
  const String baseUrl = String(WORKER_BASE_URL);
  const String expectedOrigin = String("https://") + WORKER_HOST;
  endpointConfigured = baseUrl == expectedOrigin || baseUrl.startsWith(expectedOrigin + "/");
  if (!endpointConfigured) {
    Serial.println(
        "Configuration error: WORKER_BASE_URL must be HTTPS and match WORKER_HOST. Scans will remain local.");
    flashStatus(8, 40, 40);
  }
  ensureWifi();

  Serial.println("Pantry Pulse RFID station ready");
  printMode();
}

void loop() {
  ensureWifi();
  updateModeButton();
  handleCard();
  processOutbox();
  delay(10);
}
