# MQTT Integration Guide

- [Overview](#overview)
- [External References](#external-references)
- [MQTT Topics](#mqtt-topics)
- [Command Reference](#command-reference)
  - [MOVE](#move)
  - [HOME](#home)
  - [WAKE](#wake)
  - [SLEEP](#sleep)
  - [GET ALL](#get-all)
  - [`GET <resource>`](#get-resource)
  - [SET](#set)
  - [NET:STATUS](#netstatus)
  - [NET:RESET](#netreset)
  - [NET:LIST](#netlist)
  - [NET:SET](#netset)
  - [MQTT:GET_CONFIG](#mqttget_config)
  - [MQTT:SET_CONFIG](#mqttset_config)
  - [HELP](#help)
- [Status Telemetry](#status-telemetry)
- [Client Integration Tips](#client-integration-tips)

## Overview

Our UI orchestrates Mirror Array tile drivers over MQTT. Each tile driver runs the firmware from the kinetic mirror stack and exposes the same command surface as the USB serial transport, but wrapped in JSON envelopes and published to broker topics. Commands are correlated via `cmd_id`, respond with `ack`/`done`/`error` states, and reuse the shared error code catalog (`E01`–`E12`, `NET_*`, `MQTT_*`). The React app should use this guide to publish control messages, subscribe for responses, and render live status.

Behavior guarantees from the latest protocol:

- Long-running commands emit a single `ack` followed by a completion (`done` or `error`). Short commands skip the `ack`.
- Responses on `devices/<tile_driver_mac>/cmd/resp` use QoS 1. If the same `cmd_id` is published again, firmware replays cached responses rather than re-running the command.
- Validation failures publish a single completion with `status: "error"` (no `ack`).
- Short commands that complete immediately (e.g., `HELP`, `WAKE`, `SLEEP`, `GET`, `SET`, `NET:STATUS`, `NET:SET`) send only a `status:"done"` completion with no `ack`.

## Scope & Supported Subset

This guide is a reference to the full firmware MQTT protocol. The UI in this repository uses only a subset of commands; consult [requirements.md](requirements.md) for what is in scope for this app.

## External References

- Core firmware repository: https://github.com/szerintedmi/kinetic-mirror-matrix-esp32
- Command schema documentation: https://github.com/szerintedmi/kinetic-mirror-matrix-esp32/blob/main/docs/mqtt-command-schema.md
- Status snapshot schema: https://github.com/szerintedmi/kinetic-mirror-matrix-esp32/blob/main/docs/mqtt-status-schema.md

## MQTT Topics

- `devices/<tile_driver_id>/cmd`  
  QoS 1, retain=false. Publish JSON command envelopes. `<tile_driver_id>` is the device MAC address rendered in lowercase without separators.
- `devices/<tile_driver_id>/cmd/resp`  
  QoS 1, retain=false. Firmware publishes one `ack` (for async actions) and one completion payload per command. Duplicate QoS1 deliveries replay cached responses without re-running the command.
- `devices/<tile_driver_id>/status`  
  QoS 0, retain=false. High-frequency telemetry snapshots. Broker Last Will on the same topic emits `{"node_state":"offline","motors":{}}`.

Every command payload follows:

```jsonc
{
  "cmd_id": "<uuid optional>",
  "action": "MOVE",
  "params": {
    /* per-command */
  },
  "meta": {
    /* reserved, optional */
  },
}
```

Responses mirror:

```jsonc
{
  "cmd_id": "<uuid>",
  "action": "MOVE",
  "status": "ack" | "done" | "error",
  "result": { /* success payload */ },
  "warnings": [ { "code": "E10", "message": "..."} ],
  "errors": [ { "code": "E04", "message": "BUSY" } ]
}
```

If `cmd_id` is omitted, the firmware assigns one and echoes it in responses; clients must correlate by this field. Validation failures skip the `ack` step and publish a single `status:"error"` completion.

## Command Reference

### MOVE

- **Purpose:** Drive one or all motors to an absolute step position, auto-waking beforehand and re-sleeping after completion.
- **Params:**
  - `target_ids`: numeric id (`0`–`7`) or `"ALL"`.
  - `position_steps`: absolute step count.
  - Optional overrides: `speed_sps`, `accel_sps2`.
- **Responses:**
  - ACK `result.est_ms` (estimated duration).
  - Completion `result.actual_ms` (milliseconds spent).
  - Errors: `E02 BAD_ID`, `E07 POS_OUT_OF_RANGE`, `E10/E11` thermal budget, `E04 BUSY`.

### HOME

- **Purpose:** Execute bump-stop homing sequence, establishing zero per motor.
- **Params:**
  - `target_ids`: numeric or `"ALL"`.
  - Optional overrides: `overshoot_steps`, `backoff_steps`, `speed_sps`, `accel_sps2`, `full_range_steps`.
- **Responses:**
  - ACK with `est_ms`.
  - Completion with `actual_ms`.
  - Errors: `E02`, `E03 BAD_PARAM`, `E04 BUSY`.

### WAKE

- **Purpose:** Power on one or more motor drivers without motion.
- **Params:** `target_ids`.
- **Responses:** Single completion (`status:"done"`). Thermal limits may emit warnings (`E12 THERMAL_NO_BUDGET_WAKE`).

### SLEEP

- **Purpose:** Power down drivers for selected motors.
- **Params:** `target_ids`.
- **Responses:** Single completion. No ACK stage.

### GET ALL

- **Purpose:** Retrieve all controller configuration values (motion defaults, thermal state, memory metrics).
- **Params:** `{ "resource": "ALL" }`.
- **Responses:** Completion `result` map containing keys such as `SPEED`, `ACCEL`, `THERMAL_LIMITING`, `max_budget_s`, `free_heap_bytes`.

### `GET <resource>`

- **Purpose:** Fetch a specific configuration or diagnostic value.
- **Params:** `resource` (case-insensitive token like `"SPEED"`, `"THERMAL_LIMITING"`, `"LAST_OP_TIMING"`).
- **Responses:** Completion `result` contains the requested key/value pair. Unsupported resources trigger `E03 BAD_PARAM`.

### SET

- **Purpose:** Update motion defaults or thermal settings.
- **Params:** One or more of `speed_sps`, `accel_sps2`, `decel_sps2`, `thermal_limiting` (e.g., `"ON"`/`"OFF"`).
- **Responses:** Completion echoes applied fields; invalid combinations return `E03 BAD_PARAM`.

### NET:STATUS

- **Purpose:** Inspect Wi-Fi onboarding state.
- **Params:** none.
- **Responses:** Completion `result` includes `sub_action:"STATUS"`, `state` (`"CONNECTED"`, `"AP_ACTIVE"`, etc.), `ssid`, `ip`, `rssi`.

### NET:RESET

- **Purpose:** Reset networking and reopen SoftAP onboarding mode.
- **Params:** none.
- **Responses:**
  - ACK `result.state:"CONNECTING"`.
  - Completion `result` with `state:"AP_ACTIVE"`, SoftAP SSID, IP.
  - Errors such as `NET_BUSY_CONNECTING` halt the transition.

### NET:LIST

- **Purpose:** Scan for nearby Wi-Fi networks (AP-only).
- **Params:** none.
- **Responses:**
  - ACK indicates scanning; scan results stream on the same response topic.
  - No `done` completion is sent (results are delivered during the ACK phase).
  - Errors: `NET_SCAN_AP_ONLY` if called outside AP mode.

### NET:SET

- **Purpose:** Persist Wi-Fi credentials.
- **Params:** `ssid`, `pass`.
- **Responses:** Completion with `sub_action:"SET"`. Validation failures raise `NET_BAD_PARAM`; save issues raise `NET_SAVE_FAILED`.

### MQTT:GET_CONFIG

- **Purpose:** Inspect active MQTT broker settings stored on the device.
- **Params:** none.
- **Responses:** Completion `result` includes `host`, `port`, `user`, `pass`.

Example request:

```json
{
  "cmd_id": "d3...",
  "action": "MQTT:GET_CONFIG"
}
```

Example completion:

```json
{
  "cmd_id": "d3...",
  "action": "MQTT:GET_CONFIG",
  "status": "done",
  "result": {
    "host": "\"192.168.1.25\"",
    "port": "1883",
    "user": "\"mirror\"",
    "pass": "\"steelthread\""
  }
}
```

### MQTT:SET_CONFIG

- **Purpose:** Update MQTT broker settings, or reset to firmware defaults.
- **Params:** Any of `host`, `port`, `user`, `pass`; or `{ "reset": true }` to revert to defaults.
- **Responses:** Completion echoes the applied settings; failures may return `MQTT_BAD_PARAM` or `MQTT_CONFIG_SAVE_FAILED`.

Example request:

```json
{
  "cmd_id": "c8...",
  "action": "MQTT:SET_CONFIG",
  "params": { "host": "lab-broker.local", "port": 1884, "user": "lab", "pass": "newsecret" }
}
```

Reset to defaults:

```json
{
  "cmd_id": "e1...",
  "action": "MQTT:SET_CONFIG",
  "params": { "reset": true }
}
```

### HELP

- **Purpose:** Return a human-readable list of supported serial commands; MQTT returns the same content in a JSON array.
- **Params:** none.
- **Responses:** Single completion (`status:"done"`) with `result.lines` array; no `ack`.

Example request:

```json
{
  "cmd_id": "aa...",
  "action": "HELP"
}
```

Example completion (truncated):

```json
{
  "cmd_id": "aa...",
  "action": "HELP",
  "status": "done",
  "result": {
    "lines": [
      "HELP",
      "MOVE:<id|ALL>,<abs_steps>",
      "HOME:<id|ALL>[,<overshoot>][,<backoff>][,<full_range>]",
      "NET:RESET",
      "MQTT:GET_CONFIG",
      "MQTT:SET_CONFIG host=<host> port=<port> user=<user> pass=\"<pass>\"",
      "..."
    ]
  }
}
```

## Status Telemetry

- Subscribe to `devices/<tile_driver_id>/status` for live motor data. Payload fields:
  - `node_state`: `"ready"` for live publishes; `"offline"` is sent by the broker Last Will with an empty `motors` object.
  - `ip`: current IPv4 (defaults to `"0.0.0.0"`).
  - `motors`: map keyed by stringified ids (`"0"`–`"7"`). Each object includes: `id`, `position`, `moving`, `awake`, `homed`, `steps_since_home`, thermal metrics (`budget_s`, `ttfc_s`), motion settings (`speed`, `accel`), and timing values (`est_ms`, `started_ms`, `actual_ms`).
- Cadence: 1 Hz when idle; 5 Hz while any motor moves; immediate publishes on state changes. Duplicate payloads between ticks are suppressed via hashing.

## Client Integration Tips

- Use a single MQTT client instance to publish commands and subscribe to both `cmd/resp` and `status`.
- Track outstanding commands in app state keyed by `cmd_id`; display ACK latency and completion status.
- Respect no-queue semantics: wait for completion before sending another MOVE/HOME to the same node or handle `E04 BUSY` gracefully.
- Surface error/warning codes directly to users; see upstream error catalog for `E*`, `NET_*`, and `MQTT_*` codes.
- STATUS is not a JSON command over MQTT; rely on `devices/<node_id>/status` for snapshots. `NET:LIST` streams results in the ACK phase and does not send a `done`.
- Device-side MQTT configuration (MQTT:\* commands) is out of scope for this UI. Configure only the UI’s own broker connection (host/port/path) locally, as described in docs/requirements.md.
