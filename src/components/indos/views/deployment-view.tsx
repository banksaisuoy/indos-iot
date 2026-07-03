'use client'
import { useState } from 'react'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Rocket, Cpu, Radio, FileCode, CheckCircle2, Wifi, Server, Copy, Zap } from 'lucide-react'
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

// ─── WiFi ──────────────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";

// ─── IndOS MQTT Broker ─────────────────────────
const char* MQTT_HOST = "${SERVER_IP}";   // IP เซิร์ฟเวอร์ IndOS
const int   MQTT_PORT = 1883;
const char* DEVICE_ID = "esp32-sensor-01";

// ─── Pins ──────────────────────────────────────
#define DHT_PIN  4       // GPIO4
#define DHT_TYPE DHT22
#define RELAY_PIN 5      // GPIO5 (รับคำสั่งจาก IndOS)

DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient net;
PubSubClient client(net);

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) { Serial.print("."); delay(400); }
  Serial.println(" ✓ " + WiFi.localIP().toString());
}

void onCommand(char* topic, byte* payload, unsigned int len) {
  // รับคำสั่งจาก IndOS เช่น {"cmd":"relay_on"}
  String msg;
  for (int i = 0; i < len; i++) msg += (char)payload[i];
  Serial.println("CMD: " + msg);
  if (msg.indexOf("relay_on") >= 0)  digitalWrite(RELAY_PIN, HIGH);
  if (msg.indexOf("relay_off") >= 0) digitalWrite(RELAY_PIN, LOW);
}

void connectMQTT() {
  client.setServer(MQTT_HOST, MQTT_PORT);
  client.setCallback(onCommand);
  while (!client.connected()) {
    Serial.print("MQTT");
    if (client.connect(DEVICE_ID)) {
      Serial.println(" ✓ connected to IndOS");
      // subscribe รับคำสั่ง
      client.subscribe("indos/devices/" + String(DEVICE_ID) + "/cmd");
    } else { Serial.print("."); delay(2000); }
  }
}

void publishTelemetry(const char* metric, float value, const char* unit) {
  String topic = "indos/devices/" + String(DEVICE_ID) + "/telemetry";
  String payload = "{\\"name\\":\\"" + String(DEVICE_ID) + "\\","
                 + "\\"project\\":\\"bkk-energy\\","
                 + "\\"metric\\":\\"" + String(metric) + "\\","
                 + "\\"value\\":" + String(value, 2) + ","
                 + "\\"unit\\":\\"" + String(unit) + "\\"}";
  client.publish(topic.c_str(), payload.c_str());
  Serial.println("→ " + topic + " : " + payload);
}

void publishHeartbeat() {
  String topic = "indos/devices/" + String(DEVICE_ID) + "/heartbeat";
  String payload = "{\\"name\\":\\"" + String(DEVICE_ID) + "\\","
                 + "\\"status\\":\\"online\\","
                 + "\\"rssi\\":" + String(WiFi.RSSI()) + ","
                 + "\\"ip\\":\\"" + WiFi.localIP().toString() + "\\"]}";
  client.publish(topic.c_str(), payload.c_str());
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(RELAY_PIN, OUTPUT);
  connectWiFi();
  connectMQTT();
}

unsigned long lastTelemetry = 0;
void loop() {
  if (!client.connected()) connectMQTT();
  client.loop();

  // ส่ง telemetry ทุก 5 วินาที
  if (millis() - lastTelemetry > 5000) {
    lastTelemetry = millis();
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t)) publishTelemetry("temperature", t, "°C");
    if (!isnan(h)) publishTelemetry("humidity",    h, "%");
    publishHeartbeat();
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
              <p className="text-xs text-muted-foreground">เข้าใช้ที่ <code className="font-mono text-primary">http://SERVER_IP:3000</code> · login: <code className="font-mono">admin@indos.io</code> / <code className="font-mono">indos123</code></p>
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
  pgdata: influxdata: miniodata: grafanadata:
  nodereddata: ollamadata: qdrantdata:`}</Code>
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
                    <tr><td className="py-2 pr-4 font-mono text-primary">indos/devices/{'{id}'}/telemetry</td><td className="py-2 pr-4 text-emerald-400">Publish</td><td className="py-2 font-mono text-muted-foreground">{"{\"name\":\"..\",\"metric\":\"..\",\"value\":28.5,\"unit\":\"°C\"}"}</td></tr>
                    <tr><td className="py-2 pr-4 font-mono text-primary">indos/devices/{'{id}'}/heartbeat</td><td className="py-2 pr-4 text-emerald-400">Publish</td><td className="py-2 font-mono text-muted-foreground">{"{\"status\":\"online\",\"rssi\":-65,\"ip\":\"..\"}"}</td></tr>
                    <tr><td className="py-2 pr-4 font-mono text-primary">indos/devices/{'{id}'}/cmd</td><td className="py-2 pr-4 text-sky-400">Subscribe</td><td className="py-2 font-mono text-muted-foreground">{"{\"cmd\":\"relay_on\"}"}</td></tr>
                    <tr><td className="py-2 pr-4 font-mono text-primary">indos/devices/{'{id}'}/config</td><td className="py-2 pr-4 text-sky-400">Subscribe</td><td className="py-2 font-mono text-muted-foreground">{"{\"interval\":10,\"threshold\":50}"}</td></tr>
                    <tr><td className="py-2 pr-4 font-mono text-primary">indos/devices/{'{id}'}/ota</td><td className="py-2 pr-4 text-sky-400">Subscribe</td><td className="py-2 font-mono text-muted-foreground">{"{\"version\":\"v2.5.0\",\"url\":\"..\"}"}</td></tr>
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
