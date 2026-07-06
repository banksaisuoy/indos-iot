#!/usr/bin/env bash
# IndOS device provisioning script
# Usage: ./provision-device.sh <device-id> <password>
# Example: ./provision-device.sh esp32-sensor-02 mySecret123
set -euo pipefail
DEVICE_ID="${1:?Usage: provision-device.sh <device-id> <password>}"
PASSWORD="${2:?Usage: provision-device.sh <device-id> <password>}"
echo "🔧 Provisioning device: $DEVICE_ID"
HASH=$(node -e "const bcrypt=require('bcryptjs');console.log(bcrypt.hashSync(process.argv[1],10))" "$PASSWORD" 2>/dev/null || bun -e "import bcrypt from 'bcryptjs';console.log(bcrypt.hashSync(process.argv[1],10))" "$PASSWORD")
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEVICES_JSON="$SCRIPT_DIR/../mini-services/telemetry/devices.json"
node -e "
  const fs = require('fs');
  const file = process.argv[1];
  const devices = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : [];
  const idx = devices.findIndex(d => d.username === process.argv[2]);
  const entry = { username: process.argv[2], passwordHash: process.argv[3], project: 'default' };
  if (idx >= 0) devices[idx] = entry; else devices.push(entry);
  fs.writeFileSync(file, JSON.stringify(devices, null, 2));
  console.log('✅ Updated devices.json');
" "$DEVICES_JSON" "$DEVICE_ID" "$HASH"
echo "📋 ESP32 config: MQTT_USER=\"$DEVICE_ID\" MQTT_PASSWORD=\"$PASSWORD\""
echo "✅ Device '$DEVICE_ID' provisioned."
