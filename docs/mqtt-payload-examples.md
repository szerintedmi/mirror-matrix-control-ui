# MQTT Payload Examples

## Broadcasted status

`devices/8857212316bc/status`

```json
{
  "node_state": "ready",
  "ip": "192.168.1.8",
  "motors": {
    "0": {
      "id": 0,
      "position": 1200,
      "moving": false,
      "awake": false,
      "homed": true,
      "steps_since_home": 6000,
      "budget_s": 90.0,
      "ttfc_s": 0.0,
      "speed": 300,
      "accel": 16000,
      "est_ms": 8019,
      "started_ms": 440952,
      "actual_ms": 8018
    },
    "1": {
      "id": 1,
      "position": 0,
      "moving": false,
      "awake": false,
      "homed": true,
      "steps_since_home": 0,
      "budget_s": 90.0,
      "ttfc_s": 0.0,
      "speed": 4000,
      "accel": 16000,
      "est_ms": 1778,
      "started_ms": 90800,
      "actual_ms": 1791
    },
    "2": {
      "id": 2,
      "position": 0,
      "moving": false,
      "awake": false,
      "homed": true,
      "steps_since_home": 0,
      "budget_s": 90.0,
      "ttfc_s": 0.0,
      "speed": 4000,
      "accel": 16000,
      "est_ms": 1778,
      "started_ms": 90800,
      "actual_ms": 1791
    },
    "3": {
      "id": 3,
      "position": 0,
      "moving": false,
      "awake": false,
      "homed": true,
      "steps_since_home": 0,
      "budget_s": 90.0,
      "ttfc_s": 0.0,
      "speed": 4000,
      "accel": 16000,
      "est_ms": 1778,
      "started_ms": 90800,
      "actual_ms": 1791
    },
    "4": {
      "id": 4,
      "position": 0,
      "moving": false,
      "awake": false,
      "homed": true,
      "steps_since_home": 0,
      "budget_s": 90.0,
      "ttfc_s": 0.0,
      "speed": 4000,
      "accel": 16000,
      "est_ms": 1778,
      "started_ms": 90800,
      "actual_ms": 1791
    },
    "5": {
      "id": 5,
      "position": 0,
      "moving": false,
      "awake": false,
      "homed": true,
      "steps_since_home": 0,
      "budget_s": 90.0,
      "ttfc_s": 0.0,
      "speed": 4000,
      "accel": 16000,
      "est_ms": 1778,
      "started_ms": 90800,
      "actual_ms": 1791
    },
    "6": {
      "id": 6,
      "position": 0,
      "moving": false,
      "awake": false,
      "homed": true,
      "steps_since_home": 0,
      "budget_s": 90.0,
      "ttfc_s": 0.0,
      "speed": 4000,
      "accel": 16000,
      "est_ms": 1778,
      "started_ms": 90800,
      "actual_ms": 1793
    },
    "7": {
      "id": 7,
      "position": 0,
      "moving": false,
      "awake": false,
      "homed": true,
      "steps_since_home": 0,
      "budget_s": 90.0,
      "ttfc_s": 0.0,
      "speed": 4000,
      "accel": 16000,
      "est_ms": 1778,
      "started_ms": 90800,
      "actual_ms": 1793
    }
  }
}
```

## Homing

`devices/8857212316bc/cmd`

```json
{
  "action": "HOME",
  "params": { "target_ids": "ALL" },
  "cmd_id": "8d6d3766-cafd-4f4f-9622-3feff1f105c0"
}
```

`devices/8857212316bc/cmd/resp`

```json
{
  "cmd_id": "8d6d3766-cafd-4f4f-9622-3feff1f105c0",
  "action": "HOME",
  "status": "ack",
  "result": { "est_ms": 1778 }
}
```

`devices/8857212316bc/cmd/resp`

```json
{
  "cmd_id": "8d6d3766-cafd-4f4f-9622-3feff1f105c0",
  "action": "HOME",
  "status": "done",
  "result": { "actual_ms": 1793, "started_ms": 90800 }
}
```

## MOVE

`devices/8857212316bc/cmd`

```json
{
  "action": "MOVE",
  "params": { "target_ids": 0, "position_steps": 1200 },
  "cmd_id": "12ee73f9-be7e-42f6-ab20-1b5c6bcc0662"
}
```

`devices/8857212316bc/cmd/resp`

```json
{
  "cmd_id": "12ee73f9-be7e-42f6-ab20-1b5c6bcc0662",
  "action": "MOVE",
  "status": "ack",
  "result": { "est_ms": 550 }
}
```

`devices/8857212316bc/cmd/resp`

```json
{
  "cmd_id": "12ee73f9-be7e-42f6-ab20-1b5c6bcc0662",
  "action": "MOVE",
  "status": "done",
  "result": { "actual_ms": 549, "started_ms": 311978 }
}
```

## Errors

### 1. Busy

`devices/8857212316bc/cmd`

```json
{
  "action": "MOVE",
  "params": { "target_ids": 0, "position_steps": 1200 },
  "cmd_id": "b4b99d4a-5656-4576-a620-cb3c276112a2"
}
```

`devices/8857212316bc/cmd/resp`

```json
{
  "cmd_id": "b4b99d4a-5656-4576-a620-cb3c276112a2",
  "action": "MOVE",
  "status": "error",
  "errors": [
    { "code": "E04", "reason": "BUSY", "message": "Controller is busy executing another command." }
  ]
}
```

### 2. Position out of range (error)

`devices/8857212316bc/cmd`

```json
{
  "action": "MOVE",
  "params": { "target_ids": 1, "position_steps": 1201 },
  "cmd_id": "66bf4c67-00d3-4b51-8e94-60371de5bd81"
}
```

`devices/8857212316bc/cmd/resp`

```json
{
  "cmd_id": "66bf4c67-00d3-4b51-8e94-60371de5bd81",
  "action": "MOVE",
  "status": "error",
  "errors": [
    {
      "code": "E07",
      "reason": "POS_OUT_OF_RANGE",
      "message": "Requested position is outside the allowed travel range."
    }
  ]
}
```

### 3. Thermal budget error when limiting is on (deafult)

If a command would result exceeding thermal budget and `THERMAL_LIMITING == "ON"` the command is rejected with error and not executed.

`devices/8857212316bc/cmd`

```json
{
  "action": "MOVE",
  "params": { "target_ids": 1, "position_steps": 1200 },
  "cmd_id": "d957e5e7-a07e-4e62-9be4-42234992cf0d"
}
```

`devices/8857212316bc/cmd/resp`

```json
{
  "cmd_id": "d957e5e7-a07e-4e62-9be4-42234992cf0d",
  "action": "MOVE",
  "status": "error",
  "errors": [
    {
      "code": "E11",
      "reason": "THERMAL_NO_BUDGET",
      "message": "Insufficient thermal budget to run the command.",
      "id": 1,
      "req_ms": 8019,
      "budget_s": 0,
      "ttfc_s": 148
    }
  ]
}
```

### 4. Thermal budet warning(s) when limiting is off

When `THERMAL_LIMITING == "OFF"` and the command execution will exceed thermal limits then commands executed and ack / done responses include warnings

`devices/8857212316bc/cmd`

```json
{
  "action": "MOVE",
  "params": { "target_ids": 1, "position_steps": -1200 },
  "cmd_id": "15e9147c-a9ef-4724-8a5d-6c4e6c8b31f6"
}
```

`devices/8857212316bc/cmd/resp`

```json
{
  "cmd_id": "15e9147c-a9ef-4724-8a5d-6c4e6c8b31f6",
  "action": "MOVE",
  "status": "ack",
  "result": { "est_ms": 8019 },
  "warnings": [
    { "code": "THERMAL_NO_BUDGET", "budget_s": 0, "id": 1, "req_ms": 8019, "ttfc_s": 69 }
  ]
}
```

`devices/8857212316bc/cmd/resp`

```json
{
  "cmd_id": "15e9147c-a9ef-4724-8a5d-6c4e6c8b31f6",
  "action": "MOVE",
  "status": "done",
  "warnings": [
    { "code": "THERMAL_NO_BUDGET", "budget_s": 0, "id": 1, "req_ms": 8019, "ttfc_s": 69 }
  ],
  "result": { "actual_ms": 8017, "started_ms": 1506008 }
}
```
