# ESP32 RFID station

This reference station uses an ESP32 and MFRC522 reader. A button toggles
between **consume** and **restock** before a tag is scanned.

## Wiring (ESP32 DevKit)

| MFRC522  | ESP32   |
| -------- | ------- |
| 3.3V     | 3V3     |
| GND      | GND     |
| SDA / SS | GPIO 5  |
| SCK      | GPIO 18 |
| MOSI     | GPIO 23 |
| MISO     | GPIO 19 |
| RST      | GPIO 22 |

Connect a normally-open mode button between GPIO 27 and GND. The built-in LED
on GPIO 2 reports state; all pins can be changed in `config.h`.

## Build and flash

```bash
cp config.example.h config.h
# Fill in Wi-Fi, Worker URL + matching host, device token, and the current TLS root CA.
pio run
pio run --target upload
pio device monitor
```

The firmware never logs its bearer token and only sends it when the HTTPS URL
matches the separately configured Worker hostname. A bounded, per-record outbox
in ESP32 NVS preserves up to 24 pending scans across Wi-Fi loss and reboots
without relying on one oversized serialized NVS value. Each record keeps one
event ID across retries, which works with the Worker's idempotency contract.
Transient network, rate-limit, and server failures retry with backoff. A
terminal per-event response (for example, an unlinked tag or negative stock)
is dropped so it cannot block later scans. The short duplicate-tag window also
protects against a card being held over the reader; a full outbox is signaled
visibly and refuses new scans until connectivity is restored.

No hardware is flashed automatically by this repository or its CI workflow.
