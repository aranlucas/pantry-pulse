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
on GPIO 2 reports state. SS, RST, button, and LED pins are configurable in
`config.h`; SCK, MOSI, and MISO use the default ESP32 SPI pins.

## Build and flash

Run from `firmware/esp32-rfid/`:

```bash
cp config.example.h config.h
# Fill in Wi-Fi, Worker URL + matching host, device token, and the current TLS root CA.
pio run
pio run --target upload
pio device monitor
```

## Offline scans and recovery

The HTTPS URL must match `WORKER_HOST`, and `TLS_ROOT_CA` must validate that
hostname. A mismatch leaves scans queued locally. The bearer token is never
logged; keep `config.h` out of Git.

The station preserves up to 24 pending scans in NVS across Wi-Fi loss and
reboots, reusing each event ID on retries. Network failures, HTTP 429, and server
errors retry with backoff. Other HTTP failures are dropped so later scans can
proceed; for an unlinked tag, link it in the dashboard and scan again.

A full outbox refuses new scans: restore connectivity, let it drain, then rescan
items that were refused. Watch `pio device monitor` for queued, rejected, or
dropped scans. A short duplicate-tag window protects against holding a card over
the reader.

CI builds the firmware but never flashes hardware.
