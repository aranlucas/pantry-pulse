#pragma once

// Copy this file to config.h. Never commit the real token or Wi-Fi password.
static constexpr char WIFI_SSID[] = "your-network";
static constexpr char WIFI_PASSWORD[] = "your-password";
static constexpr char WORKER_BASE_URL[] = "https://pantry-pulse.example.workers.dev";
static constexpr char WORKER_HOST[] = "pantry-pulse.example.workers.dev";
static constexpr char DEVICE_TOKEN[] = "replace-with-the-device-token";
static constexpr char DEVICE_ID[] = "pantry-station-1";

// Paste the PEM root CA that validates your Worker hostname. Keeping this
// explicit makes certificate rotation visible and avoids insecure TLS mode.
static constexpr char TLS_ROOT_CA[] = R"CERT(
-----BEGIN CERTIFICATE-----
PASTE YOUR ROOT CA CERTIFICATE HERE
-----END CERTIFICATE-----
)CERT";

static constexpr int RFID_SS_PIN = 5;
static constexpr int RFID_RST_PIN = 22;
static constexpr int MODE_BUTTON_PIN = 27;
static constexpr int STATUS_LED_PIN = 2;
