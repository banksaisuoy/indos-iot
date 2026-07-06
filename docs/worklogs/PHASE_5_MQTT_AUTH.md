# Phase 5 — MQTT Broker Authentication + ACL

**Status:** ✅ Complete

## Summary
Removed open MQTT broker risk. Added username/password auth + per-device topic ACL.

## Files Changed
- `mini-services/telemetry/index.ts` — added `broker.authenticate` (bcrypt), `broker.authorizePublish`, `broker.authorizeSubscribe`
- `mini-services/telemetry/package.json` — added bcryptjs
- `mini-services/telemetry/devices.json` (auto) — device credentials
- `src/components/indos/views/deployment-view.tsx` — ESP32 sketch updated with MQTT credentials
- `mosquitto.conf` — production auth config
- `mosquitto-acl.conf` (NEW) — per-device ACL
- `scripts/provision-device.sh` (NEW) — device provisioning

## Verification
- No creds → rejected, Wrong password → rejected, Valid creds → authenticated
- ACL prevents cross-device topic access
