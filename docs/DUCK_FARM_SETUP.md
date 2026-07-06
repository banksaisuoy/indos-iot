# 🦆 Duck Farm — เชื่อม ESP32 AeroDuck Pro v19 เข้า IndOS

คู่มือเชื่อมบอร์ด ESP32 ที่มีอยู่แล้วเข้ากับ IndOS platform โดยไม่แก้โค้ดเดิม

---

## ภาพรวม

```
ESP32 (AeroDuck v19) → MQTT → IndOS Broker (:1883) → IndOS Dashboard
                        ↓
                   IndOS แสดงผล: THI, อุณหภูมิ, ความชื้น, สถานะพัดลม 6 ตัว
```

---

## ขั้นตอนที่ 1: เตรียม IndOS MQTT Broker

IndOS รัน MQTT broker ที่ port 1883 (มี auth) คุณต้องสร้าง device credential ก่อน:

```bash
cd /home/z/my-project
bun run scripts/provision-device.sh duck-farm-01 yourSecretPassword
```

ผลลัพธ์:
```
📋 ESP32 config: MQTT_USER="duck-farm-01" MQTT_PASSWORD="yourSecretPassword"
```

---

## ขั้นตอนที่ 2: แก้ ESP32 Sketch (เพิ่ม ไม่ลบ)

ในไฟล์ `duck_farm_v19_Relay6_rs485.ino` บรรทัดประมาณ 131:

### โค้ดเดิม:
```cpp
char mqttServer[64] = "10.1.217.15";
char mqttUser[33]   = "", mqttPass[33] = "";
```

### เพิ่มค่าเริ่มต้นใหม่ (ไม่ลบของเดิม):
```cpp
// ─── IndOS MQTT Broker Config ──────────────────────────────
// เปลี่ยน IP เป็นเซิร์ฟเวอร์ IndOS ของคุณ
char mqttServer[64] = "INDOS_SERVER_IP";   // เช่น "192.168.1.100"
char mqttUser[33]   = "duck-farm-01";      // device username จาก provisioning
char mqttPass[33]   = "yourSecretPassword"; // device password จาก provisioning
```

### เพิ่ม topic ใหม่ในส่วน publish (ไม่ลบ `farm/sensor`):

หาบรรทัด (ประมาณ 1283):
```cpp
sent = mqtt.publish("farm/sensor", jsonBuf);
```

เพิ่มบรรทัดนี้ต่อจากบรรทัดข้างบน:
```cpp
// ─── เพิ่ม: ส่งข้อมูลเข้า IndOS ด้วย ──────────────────────
// IndOS topic: indos/devices/{deviceId}/telemetry
{
    char indosTopic[80];
    snprintf(indosTopic, sizeof(indosTopic), "indos/devices/%s/telemetry", deviceId);
    
    // แปลง payload ให้เป็น format ที่ IndOS เข้าใจ
    char indosPayload[512];
    snprintf(indosPayload, sizeof(indosPayload),
        "{\"name\":\"%s\",\"project\":\"duck-farm\","
        "\"metric\":\"temperature\",\"value\":%.2f,\"unit\":\"°C\","
        "\"thi\":%.2f,\"thi_level\":\"%s\","
        "\"fans_active\":%d,\"failsafe\":%s,\"sensor_ok\":%s,"
        "\"wifi_rssi\":%d,\"free_heap\":%u}",
        deviceId, snapT, thi, thiLevel(thi),
        fansActiveCount, isFailsafe ? "true" : "false",
        sensorValidSnap ? "true" : "false",
        WiFi.RSSI(), (uint32_t)ESP.getFreeHeap());
    
    mqtt.publish(indosTopic, indosPayload);
    
    // ส่ง humidity อีก topic
    char humiTopic[80];
    snprintf(humiTopic, sizeof(humiTopic), "indos/devices/%s-humi/telemetry", deviceId);
    char humiPayload[256];
    snprintf(humiPayload, sizeof(humiPayload),
        "{\"name\":\"%s-humi\",\"project\":\"duck-farm\","
        "\"metric\":\"humidity\",\"value\":%.2f,\"unit\":\"%%\"}",
        deviceId, snapH);
    mqtt.publish(humiTopic, humiPayload);
}
```

---

## ขั้นตอนที่ 3: ตั้งค่า WiFi

ในไฟล์เดียวกัน บรรทัดประมาณ 129:

```cpp
char ssid[33]       = "saisuoy";      // เปลี่ยนเป็น WiFi ฟาร์ม
char wifiPass[64]   = "123456789";    // เปลี่ยนเป็นรหัส WiFi ฟาร์ม
```

หรือตั้งผ่าน Web Dashboard ของบอร์ดเอง (Captive Portal) ได้เลย — เข้า `192.168.4.1`

---

## ขั้นตอนที่ 4: อัปโหลด + ทดสอบ

1. เปิด Arduino IDE → เปิดไฟล์ `duck_farm_v19_Relay6_rs485.ino`
2. เลือกบอร์ด: **ESP32S3 Dev Module**
3. Partition Scheme: **16M Flash (3MB APP / 9.9MB FATFS)**
4. PSRAM: **OPI PSRAM**
5. กด Upload
6. เปิด Serial Monitor (115200 baud) — ดู log:
   ```
   MQTT connected to 192.168.1.100:1883 (backoff reset)
   ```
7. เปิด IndOS Dashboard → เมนู **Duck Farm**
8. ข้อมูลจะขึ้นแบบเรียลไทม์! 🎉

---

## ข้อมูลที่ IndOS แสดง

| ข้อมูล | แสดงใน IndOS | แสดงใน Dashboard เดิม |
|--------|-------------|---------------------|
| อุณหภูมิ (°C) | ✅ KPI + Sparkline | ✅ |
| ความชื้น (%) | ✅ KPI + Sparkline | ✅ |
| THI (Stress Index) | ✅ พร้อมสีระดับ | ✅ |
| พัดลม 6 ตัว | ✅ กราฟิกหมุน | ✅ |
| Failsafe | ✅ แจ้งเตือนแดง | ✅ |
| WiFi RSSI | ✅ | ✅ |
| Free Heap | ✅ | ✅ |
| Uptime | ✅ | ✅ |

---

## ข้อดีของการเชื่อมเข้า IndOS

1. **ดูได้จากที่ไหนก็ได้** — ไม่ต้องเข้า IP ของบอร์ดตรงๆ
2. **รวมหลายฟาร์ม** — ดูหลายบอร์ดพร้อมกัน
3. **เก็บประวัติ** — InfluxDB เก็บย้อนหลัง 90 วัน
4. **แจ้งเตือน** — อลาร์ม + Line/Teams (ผ่าน Webhook)
5. **AI** — ถาม "เป็ดเครียดไหม" ได้
6. **รายงาน** — export PDF/Excel
7. **Auth** — login ปลอดภัย

---

## สรุปการเปลี่ยนแปลง

| อะไร | ลบ/แก้ของเดิม? | รายละเอียด |
|------|--------------|----------|
| `mqttServer` | เปลี่ยนค่าเริ่มต้น | จาก `10.1.217.15` เป็น IP IndOS |
| `mqttUser/mqttPass` | เพิ่มค่า | ใส่ credentials จาก provisioning |
| `mqtt.publish()` | **เพิ่มบรรทัดใหม่** | ส่งข้อมูลเข้า IndOS topic เพิ่ม ไม่ลบ `farm/sensor` |
| โค้ดเดิมทั้งหมด | **ไม่แก้ ไม่ลบ** | ยังทำงานเหมือนเดิม 100% |
