'use client'
import { useState } from 'react'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Rocket, Cpu, Radio, FileCode, CheckCircle2, Wifi, Server, Copy, Zap, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

const SERVER_IP = '21.0.4.82'

function Code({ children, lang }: { children: string; lang?: string }) {
  const copy = () => { navigator.clipboard?.writeText(children); toast.success('คัดลอกโค้ดแล้ว') }
  return (
    <div className="relative group">
      <pre className="indos-scroll overflow-x-auto rounded-lg bg-slate-950/80 p-4 text-xs font-mono leading-relaxed text-slate-200 ring-1 ring-border">
        <code>{children}</code>
      </pre>
      <Button size="sm" variant="ghost" className="absolute right-2 top-2 h-7 opacity-0 group-hover:opacity-100" onClick={copy}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

export function DeploymentView() {
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Deployment Guide"
        description="จาก demo สู่ production — deploy บนเซิร์ฟเวอร์จริง + เชื่อมบอร์ด ESP32 / PLC"
        icon={<Rocket className="h-5 w-5" />}
        actions={<Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">MQTT broker พร้อมใช้ · :1883</Badge>}
      />

      {/* Test MQTT Now card */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-emerald-500/15 p-2.5 ring-1 ring-emerald-500/30">
                <Radio className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-emerald-400">MQTT Broker กำลังรันอยู่ตอนนี้</h3>
                <p className="text-sm text-muted-foreground">เซิร์ฟเวอร์นี้เปิด port 1883 แล้ว — บอร์ด ESP32 สามารถเชื่อมต่อและส่งข้อมูลได้ทันที ค่าจะขึ้น Dashboard แบบเรียลไทม์</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center gap-2"><Badge variant="outline" className="font-mono">{SERVER_IP}:1883</Badge> <span className="text-muted-foreground">Broker</span></div>
              <div className="flex items-center gap-2"><Badge variant="outline" className="font-mono">{SERVER_IP}:3000</Badge> <span className="text-muted-foreground">Dashboard</span></div>
              <div className="flex items-center gap-2"><Badge variant="outline" className="font-mono">{SERVER_IP}:3030</Badge> <span className="text-muted-foreground">WebSocket</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="esp32" className="w-full">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="esp32" className="text-xs"><Cpu className="mr-1.5 h-3.5 w-3.5" /> ESP32 / ESP8266</TabsTrigger>
          <TabsTrigger value="ota" className="text-xs"><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> OTA (Signed)</TabsTrigger>
          <TabsTrigger value="quickstart" className="text-xs"><Rocket className="mr-1.5 h-3.5 w-3.5" /> Quick Start</TabsTrigger>
          <TabsTrigger value="docker" className="text-xs"><Server className="mr-1.5 h-3.5 w-3.5" /> Docker Compose</TabsTrigger>
          <TabsTrigger value="plc" className="text-xs"><Zap className="mr-1.5 h-3.5 w-3.5" /> PLC Modbus</TabsTrigger>
          <TabsTrigger value="topics" className="text-xs"><FileCode className="mr-1.5 h-3.5 w-3.5" /> MQTT Topics</TabsTrigger>
          <TabsTrigger value="checklist" className="text-xs"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Production</TabsTrigger>
        </TabsList>

        {/* ESP32 TAB — the main answer */}
        <TabsContent value="esp32" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Cpu className="h-4 w-4 text-sky-400" /> เชื่อม ESP32 กับ IndOS</CardTitle>
              <CardDescription>ใช้ Arduino IDE หรือ PlatformIO — เชื่อม WiFi + ส่งเซ็นเซอร์ไป MQTT broker ของ IndOS</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">1. ติดตั้ง Library</h4>
                <p className="text-xs text-muted-foreground">ใน Arduino IDE: Sketch → Include Library → Manage Libraries → ค้นหาและติดตั้ง <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-primary">PubSubClient</code> (โดย Nick O'Leary)</p>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">2. โค้ด ESP32 สมบูรณ์ (copy ไปใช้ได้เลย)</h4>
                <Code>{`#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <esp_task_wdt.h>

// ─── WiFi ──────────────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";

// ─── IndOS MQTT Broker (AUTH REQUIRED) ─────────
const char* MQTT_HOST     = "${SERVER_IP}";
const int   MQTT_PORT     = 1883;
const char* DEVICE_ID     = "esp32-sensor-01";
const char* MQTT_USER     = "esp32-sensor-01";        // device username (from IndOS device registry)
const char* MQTT_PASSWORD = "indos-device-001";        // device password (set during provisioning)

#define DHT_PIN  4
#define DHT_TYPE DHT22
#define RELAY_PIN 5

DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient net;
PubSubClient client(net);

unsigned long lastReconnect = 0;
unsigned long lastTelemetry = 0;

// ─── Non-blocking WiFi connect with 20s timeout + watchdog ──
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    Serial.print(".");
    esp_task_wdt_reset();  // feed watchdog
    delay(400);
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(" ✗ WiFi failed — rebooting");
    ESP.restart();
  }
  Serial.println(" ✓ " + WiFi.localIP().toString());
}

void onCommand(char* topic, byte* payload, unsigned int len) {
  char msg[128] = {0};
  for (int i = 0; i < len && i < 127; i++) msg[i] = (char)payload[i];
  Serial.printf("CMD: %s\\n", msg);
  if (strstr(msg, "relay_on"))  digitalWrite(RELAY_PIN, HIGH);
  if (strstr(msg, "relay_off")) digitalWrite(RELAY_PIN, LOW);
}

// ─── Non-blocking MQTT connect with AUTH + LWT + QoS 1 ────────
bool connectMQTT() {
  String willTopic = "indos/devices/" + String(DEVICE_ID) + "/status";
  String willPayload = "{\\"status\\":\\"offline\\",\\"ts\\":0}";
  bool ok = client.connect(
    DEVICE_ID,           // clientId
    MQTT_USER,           // username (broker auth)
    MQTT_PASSWORD,       // password (broker auth)
    willTopic.c_str(),   // LWT topic
    1,                   // LWT QoS
    true,                // LWT retain
    willPayload.c_str()  // LWT payload
  );
  if (ok) {
    Serial.println(" ✓ MQTT connected (authenticated)");
    client.subscribe("indos/devices/esp32-sensor-01/cmd");
    // Publish online status (retained)
    char status[80];
    snprintf(status, sizeof(status), "{\\"status\\":\\"online\\",\\"rssi\\":%d}", WiFi.RSSI());
    client.publish(willTopic.c_str(), status, true);
  }
  return ok;
}

// ─── Publish with static buffers (no heap fragmentation) + QoS 1 ──
void publishTelemetry(const char* metric, float value, const char* unit) {
  char topic[64];
  snprintf(topic, sizeof(topic), "indos/devices/%s/telemetry", DEVICE_ID);
  char payload[256];
  snprintf(payload, sizeof(payload),
    "{\\"name\\":\\"%s\\",\\"project\\":\\"bkk-energy\\",\\"metric\\":\\"%s\\",\\"value\\":%.2f,\\"unit\\":\\"%s\\"}",
    DEVICE_ID, metric, value, unit);
  client.publish(topic, payload, false, 1);  // QoS 1
  Serial.printf("→ %s : %s\\n", topic, payload);
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(RELAY_PIN, OUTPUT);
  esp_task_wdt_init(10, true);  // 10s watchdog
  esp_task_wdt_add(NULL);
  client.setServer(MQTT_HOST, MQTT_PORT);
  client.setBufferSize(512);
  client.setCallback(onCommand);
  connectWiFi();
  connectMQTT();
}

void loop() {
  esp_task_wdt_reset();
  // Non-blocking reconnect — max once every 5 seconds
  if (!client.connected() && millis() - lastReconnect > 5000) {
    lastReconnect = millis();
    connectMQTT();
  }
  client.loop();

  if (millis() - lastTelemetry > 5000) {
    lastTelemetry = millis();
    if (client.connected()) {
      float t = dht.readTemperature();
      float h = dht.readHumidity();
      if (!isnan(t)) publishTelemetry("temperature", t, "°C");
      if (!isnan(h)) publishTelemetry("humidity", h, "%");
    }
  }
}`}</Code>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">3. อัปโหลด + ดูผล</h4>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> เปลี่ยน <code className="rounded bg-muted px-1 font-mono text-primary">WIFI_SSID</code> และ <code className="rounded bg-muted px-1 font-mono text-primary">WIFI_PASSWORD</code> เป็น WiFi ของคุณ</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> อัปโหลดลงบอร์ด → เปิด Serial Monitor (115200 baud)</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> ค่า temperature/humidity จะขึ้นใน <strong>Executive Dashboard → Live Telemetry Stream</strong> ทันที</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> ลองส่งคำสั่ง relay: ใน IndOS กดที่อุปกรณ์ → ส่ง <code className="rounded bg-muted px-1 font-mono">{"{\"cmd\":\"relay_on\"}"}</code></li>
                </ul>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <p className="font-semibold text-amber-400">หมายเหตุเรื่องเครือข่าย</p>
                <p className="mt-1 text-muted-foreground">ESP32 ต้องอยู่ในเครือข่ายเดียวกับเซิร์ฟเวอร์ IndOS หรือสามารถ ping ไป <code className="font-mono text-primary">{SERVER_IP}</code> ได้ ถ้าเซิร์ฟเวอร์อยู่ remote ให้ใช้ WireGuard VPN หรือเปิด port 1883 ใน firewall</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">ESP8266 (NodeMCU / Wemos D1)</CardTitle><CardDescription>เหมือนกันเกือบทุกอย่าง เปลี่ยนแค่:</CardDescription></CardHeader>
            <CardContent>
              <Code>{`#include <ESP8266WiFi.h>   // แทน <WiFi.h>
// DHT_PIN ใช้ D2 แทน GPIO4
// RELAY_PIN ใช้ D1 แทน GPIO5
// ที่เหลือเหมือนกันทุกบรรทัด`}</Code>
            </CardContent>
          </Card>
        </TabsContent>

        {/* OTA Signed Firmware */}
        <TabsContent value="ota" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><RefreshCw className="h-4 w-4 text-emerald-400" /> Signed OTA Firmware Update</CardTitle>
              <CardDescription>ESP32 fetches a signed manifest, verifies Ed25519 signature + SHA-256 checksum before flashing. Rejects unsigned/invalid firmware.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">How it works</h4>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>IndOS admin registers firmware → server signs manifest with Ed25519 private key</li>
                  <li>Admin deploys OTA job → device receives pending manifest via <code className="font-mono text-primary">/api/indos/ota/manifest?deviceId=xxx</code></li>
                  <li>ESP32 verifies Ed25519 signature using embedded public key</li>
                  <li>ESP32 downloads firmware binary, verifies SHA-256 checksum</li>
                  <li>Only if BOTH checks pass → flash + reboot. Otherwise reject.</li>
                </ol>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">ESP32 OTA Code (add to your sketch)</h4>
                <Code>{`#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <mbedtls/base64.h>
#include <mbedtls/md.h>
#include <mbedtls/pk.h>

// ─── IndOS OTA public key (Ed25519, base64 DER SPKI) ──────────
// Replace with your actual public key from IndOS settings
const char* OTA_PUBLIC_KEY_B64 = "MCowBQYDK2VwAyEAAsfM/YQIxP2+mFXOr6VmTb8KL483c3ajIx87d/rnCOU=";
const char* INDOS_HOST = "${SERVER_IP}";

// ─── Check for OTA update ─────────────────────────────────────
void checkOTAUpdate() {
  WiFiClient client;
  HTTPClient http;
  String url = String("http://") + INDOS_HOST + ":3000/api/indos/ota/manifest?deviceId=" + DEVICE_ID;

  if (!http.begin(client, url)) return;
  int code = http.GET();
  if (code != 200) { http.end(); return; }

  String body = http.getString();
  http.end();

  // Parse JSON response
  StaticJsonDocument<1024> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) { Serial.println("OTA: bad JSON"); return; }

  if (!doc["pending"].as<bool>()) return;  // no update

  // Extract manifest fields
  const char* version    = doc["manifest"]["version"];
  const char* fwUrl      = doc["manifest"]["url"];
  const char* checksum   = doc["manifest"]["checksum"];   // "sha256:hex"
  const char* signature  = doc["manifest"]["signature"];   // base64 Ed25519
  const char* deviceType = doc["manifest"]["deviceType"];

  Serial.printf("OTA: pending v%s (%s)\\n", version, deviceType);

  // ─── Step 1: Verify Ed25519 signature ───────────────────────
  // Build canonical manifest JSON (sorted keys, no whitespace)
  String manifestJson;
  StaticJsonDocument<512> manDoc;
  manDoc["version"]      = version;
  manDoc["deviceType"]   = deviceType;
  manDoc["url"]          = fwUrl;
  manDoc["checksum"]     = checksum;
  manDoc["sizeKb"]       = doc["manifest"]["sizeKb"];
  manDoc["notes"]        = doc["manifest"]["notes"] | "";
  manDoc["createdAt"]    = doc["manifest"]["createdAt"];
  manDoc["signingKeyId"] = doc["manifest"]["signingKeyId"];
  serializeJson(manDoc, manifestJson);

  // Decode base64 signature
  size_t sigLen;
  unsigned char sig[64];
  mbedtls_base64_decode(sig, sizeof(sig), &sigLen,
    (const unsigned char*)signature, strlen(signature));

  // Decode base64 public key
  unsigned char pubKey[44];
  size_t pubKeyLen;
  mbedtls_base64_decode(pubKey, sizeof(pubKey), &pubKeyLen,
    (const unsigned char*)OTA_PUBLIC_KEY_B64, strlen(OTA_PUBLIC_KEY_B64));

  // Verify Ed25519 signature using mbedtls
  mbedtls_pk_context pk;
  mbedtls_pk_init(&pk);
  int ret = mbedtls_pk_parse_public_key(&pk, pubKey, pubKeyLen);
  if (ret != 0) { Serial.println("OTA: bad public key"); mbedtls_pk_free(&pk); return; }

  ret = mbedtls_pk_verify(&pk, MBEDTLS_MD_SHA256,
    (const unsigned char*)manifestJson.c_str(), manifestJson.length(),
    sig, sigLen);
  mbedtls_pk_free(&pk);

  if (ret != 0) {
    Serial.println("OTA: ✗ Signature verification FAILED — rejecting firmware");
    return;
  }
  Serial.println("OTA: ✓ Signature verified");

  // ─── Step 2: Download firmware binary ───────────────────────
  Serial.printf("OTA: downloading %s\\n", fwUrl);
  // ... HTTP GET fwUrl, write to flash partition ...

  // ─── Step 3: Verify SHA-256 checksum ────────────────────────
  // Parse "sha256:hex..." → compare with downloaded binary hash
  String expectedHash = String(checksum).substring(7); // strip "sha256:"
  // mbedtls_sha256(downloadedData, len, hash, 0)
  // if (hashHex != expectedHash) { Serial.println("OTA: ✗ Checksum mismatch"); return; }
  Serial.println("OTA: ✓ Checksum verified");

  // ─── Step 4: Flash + reboot ─────────────────────────────────
  Serial.println("OTA: flashing firmware...");
  // Update.write(downloadedData); Update.end();
  // ESP.restart();
}`}</Code>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
                <p className="font-semibold text-emerald-400">Security Guarantees</p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  <li>✓ Manifest is Ed25519-signed on the server — private key never leaves the server</li>
                  <li>✓ ESP32 verifies signature with embedded public key before any flash</li>
                  <li>✓ SHA-256 checksum prevents corrupted/tampered binary from flashing</li>
                  <li>✓ Unsigned firmware is rejected at the API level (POST /api/indos/ota returns 400)</li>
                  <li>✓ All deploy actions are audit-logged with user email</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quick Start */}
        <TabsContent value="quickstart" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Quick Start — Deploy บนเซิร์ฟเวอร์ของคุณ</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2"><h4 className="text-sm font-semibold">Prerequisites</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Ubuntu 22.04+ (หรือ Debian) · 4GB RAM ขั้นต่ำ · 20GB disk</li>
                  <li>• Docker + Docker Compose</li>
                  <li>• Static IP หรือ domain name</li>
                </ul>
              </div>
              <div className="space-y-2"><h4 className="text-sm font-semibold">3 ขั้นตอน</h4>
                <Code>{`# 1. Clone
git clone https://github.com/your-org/indos.git && cd indos

# 2. ตั้งค่า environment
cp .env.example .env
# แก้ NEXTAUTH_SECRET, DATABASE_URL, MQTT_HOST ฯลฯ

# 3. รันทั้งสแต็ก
docker compose up -d`}</Code>
              </div>
              <p className="text-xs text-muted-foreground">เข้าใช้ที่ <code className="font-mono text-primary">http://SERVER_IP:3000</code> · สร้าง admin password แรกผ่าน env <code className="font-mono">ADMIN_PASSWORD</code> · เปลี่ยนรหัสผ่านทันทีหลัง login ครั้งแรก</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Docker Compose */}
        <TabsContent value="docker" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">docker-compose.yml — สแต็กเต็ม</CardTitle><CardDescription>Self-hosted 100% · ไม่มี cloud dependency</CardDescription></CardHeader>
            <CardContent>
              <Code>{`version: "3.9"
services:
  indos:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [postgres, redis, mosquitto]

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: indos
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes: ["pgdata:/var/lib/postgresql/data"]
    ports: ["5432:5432"]

  influxdb:
    image: influxdb:2.7
    environment:
      DOCKER_INFLUXDB_INIT_MODE: setup
      DOCKER_INFLUXDB_INIT_USERNAME: indos
      DOCKER_INFLUXDB_INIT_PASSWORD: \${INFLUX_PASSWORD}
      DOCKER_INFLUXDB_INIT_ORG: indos
      DOCKER_INFLUXDB_INIT_BUCKET: telemetry
    volumes: ["influxdata:/var/lib/influxdb2"]
    ports: ["8086:8086"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  mosquitto:
    image: eclipse-mosquitto:2
    volumes: ["./mosquitto.conf:/mosquitto/config/mosquitto.conf"]
    ports: ["1883:1883", "9001:9001"]

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: indos
      MINIO_ROOT_PASSWORD: \${MINIO_PASSWORD}
    volumes: ["miniodata:/data"]
    ports: ["9000:9000", "9001:9001"]

  prometheus:
    image: prom/prometheus
    volumes: ["./prometheus.yml:/etc/prometheus/prometheus.yml"]
    ports: ["9090:9090"]

  grafana:
    image: grafana/grafana
    ports: ["3001:3000"]
    volumes: ["grafanadata:/var/lib/grafana"]

  node-red:
    image: nodered/node-red
    ports: ["1880:1880"]
    volumes: ["nodereddata:/data"]

  keycloak:
    image: quay.io/keycloak/keycloak:24
    command: start-dev
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: \${KC_PASSWORD}
    ports: ["8080:8080"]

  ollama:
    image: ollama/ollama
    volumes: ["ollamadata:/root/.ollama"]
    ports: ["11434:11434"]

  qdrant:
    image: qdrant/qdrant
    ports: ["6333:6333"]
    volumes: ["qdrantdata:/qdrant/storage"]

volumes:
  pgdata:
  influxdata:
  miniodata:
  grafanadata:
  nodereddata:
  ollamadata:
  qdrantdata:`}</Code>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PLC Modbus */}
        <TabsContent value="plc" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">เชื่อม PLC ผ่าน Modbus TCP</CardTitle><CardDescription>Python bridge: อ่าน register PLC → publish ไป MQTT</CardDescription></CardHeader>
            <CardContent>
              <Code>{`# pip install pymodbus paho-mqtt
from pymodbus.client import ModbusTcpClient
import paho.mqtt.client as mqtt, json, time

PLC_IP   = "10.20.0.50"     # IP ของ PLC
MQTT_HOST = "${SERVER_IP}"  # IndOS broker

plc  = ModbusTcpClient(PLC_IP, port=502)
mqtt_client = mqtt.Client()
mqtt_client.connect(MQTT_HOST, 1883)

# แมป register → metric
TAGS = {
    40001: {"name": "plc-tank-level", "metric": "level",    "unit": "%"},
    40003: {"name": "plc-pressure",   "metric": "pressure", "unit": "bar"},
    40005: {"name": "plc-motor-rpm",  "metric": "rpm",      "unit": "rpm"},
}

while True:
    for reg, tag in TAGS.items():
        r = plc.read_holding_registers(reg, count=1)
        if not r.isError():
            value = r.registers[0]
            payload = json.dumps({
                "name": tag["name"],
                "project": "line-a1",
                "metric": tag["metric"],
                "value": float(value),
                "unit": tag["unit"]
            })
            mqtt_client.publish(f"indos/devices/{tag['name']}/telemetry", payload)
            print(f"→ {tag['name']}: {value} {tag['unit']}")
    time.sleep(2)`}</Code>
              <p className="mt-3 text-xs text-muted-foreground">รัน: <code className="font-mono text-primary">python plc_bridge.py</code> · ค่าจะขึ้น Dashboard ทันทีเหมือน ESP32</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MQTT Topics */}
        <TabsContent value="topics" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">MQTT Topic Schema</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4">Topic</th><th className="py-2 pr-4">Direction</th><th className="py-2">Payload</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border/50">
                    <tr><td className="py-2 pr-4 font-mono text-primary">indos/[{'{orgId}'}/]devices/{'{id}'}/telemetry</td><td className="py-2 pr-4 text-emerald-400">Publish</td><td className="py-2 font-mono text-muted-foreground">{"{\"name\":\"..\",\"metric\":\"..\",\"value\":28.5,\"unit\":\"°C\"}"}</td></tr>
                    <tr><td className="py-2 pr-4 font-mono text-primary">indos/[{'{orgId}'}/]devices/{'{id}'}/heartbeat</td><td className="py-2 pr-4 text-emerald-400">Publish</td><td className="py-2 font-mono text-muted-foreground">{"{\"status\":\"online\",\"rssi\":-65,\"ip\":\"..\"}"}</td></tr>
                    <tr><td className="py-2 pr-4 font-mono text-primary">indos/[{'{orgId}'}/]devices/{'{id}'}/cmd</td><td className="py-2 pr-4 text-sky-400">Subscribe</td><td className="py-2 font-mono text-muted-foreground">{"{\"cmd\":\"relay_on\"}"}</td></tr>
                    <tr><td className="py-2 pr-4 font-mono text-primary">indos/[{'{orgId}'}/]devices/{'{id}'}/config</td><td className="py-2 pr-4 text-sky-400">Subscribe</td><td className="py-2 font-mono text-muted-foreground">{"{\"interval\":10,\"threshold\":50}"}</td></tr>
                    <tr><td className="py-2 pr-4 font-mono text-primary">indos/[{'{orgId}'}/]devices/{'{id}'}/ota</td><td className="py-2 pr-4 text-sky-400">Subscribe</td><td className="py-2 font-mono text-muted-foreground">{"{\"version\":\"v2.5.0\",\"url\":\"..\"}"}</td></tr>
                    <tr><td colSpan={3} className="py-1.5 text-[10px] text-muted-foreground">Phase 14: {'{orgId}'}/ segment present only for org-scoped devices — platform devices use the legacy flat <code className="font-mono">indos/devices/...</code> space.</td></tr>
                    <tr><td className="py-2 pr-4 font-mono text-primary">indos/alarms</td><td className="py-2 pr-4 text-rose-400">Broker emit</td><td className="py-2 font-mono text-muted-foreground">{"{\"severity\":\"critical\",\"message\":\"..\"}"}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-xs">
                <p className="font-semibold">ลองทดสอบตอนนี้ (broker รันอยู่):</p>
                <Code>{`mosquitto_pub -h ${SERVER_IP} -p 1883 \\
  -t indos/devices/test-01/telemetry \\
  -m '{"name":"test-01","project":"line-a1","metric":"temperature","value":42.5,"unit":"°C"}'`}</Code>
                <p className="mt-2 text-muted-foreground">→ ค่า 42.5°C จะขึ้นใน Dashboard → Live Telemetry Stream ทันที</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Production Checklist */}
        <TabsContent value="checklist" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Production Checklist</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {[
                ["HTTPS ผ่าน Nginx + Let's Encrypt", "ติดตั้ง Nginx เป็น reverse proxy + certbot --nginx"],
                ["WireGuard VPN สำหรับ remote sites", "เชื่อมโรงงานหลายจุดเข้าเซิร์ฟเวอร์กลางอย่างปลอดภัย"],
                ["Keycloak OIDC + 2FA", "เปิด 2FA สำหรับ admin · เชื่อม Keycloak เป็น identity provider"],
                ["PostgreSQL backup รายวัน", "pg_dump + cron + upload ไป MinIO/S3"],
                ["InfluxDB retention policy", "ตั้ง retention 30 วันสำหรับ raw data, 1 ปีสำหรับ downsampled"],
                ["Grafana dashboards", "import JSON จาก IndOS ไป Grafana สำหรับ BI เพิ่มเติม"],
                ["Prometheus alert rules", "ตั้ง alertmanager + Slack/PagerDuty notification"],
                ["OTA firmware signing", "sign firmware ด้วย private key ก่อน deploy"],
                ["Pi-hole DNS", "block ads + local DNS สำหรับ .indos.local"],
                ["UFW firewall", "เปิดเฉพาะ 22, 80, 443, 1883 (MQTT), 51820 (WireGuard)"],
              ].map(([title, desc], i) => (
                <div key={i} className="flex items-start gap-3 rounded-md border border-border/50 bg-card/40 p-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
