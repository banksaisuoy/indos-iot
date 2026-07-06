/**
 * ===================================================================================
 *  Duck Farm Fan Controller  v19.0.0  (AeroDuck Pro — POC + Production Build)
 *  Board   : ESP32-S3 N16R8  (16MB Flash / 8MB PSRAM)
 *  Status  : POC / UAT Staging  →  ใช้งานจริงในฟาร์มระบบปิด Local Network
 *
 *  ── PROJECT OVERVIEW ──────────────────────────────────────────────────────────────
 *  ควบคุมพัดลมโรงเรือนเป็ดไข่ 6 ตัว (Fan 1-6) ตามอุณหภูมิ-ความชื้น (RS485 Modbus RTU SHT20)
 *  ใช้ดัชนีความเครียดเป็ด (THI) แสดงผลผ่าน Web Dashboard + MQTT → Node-RED → Grafana
 *  Failsafe: เซ็นเซอร์เสีย → บังคับเปิดพัดลมทุกตัว + Buzzer siren กัน Heat Stress
 *
 *  ── HARDWARE ──────────────────────────────────────────────────────────────────────
 *  SHT20 RS485 → UART RX=16 / TX=17 / DE_RE=4
 *  Relay Fan1-6 → GPIO {18, 19, 21, 15, 14, 13}  (LOW = ON)
 *  RGB LED     → GPIO 48  (NeoPixel)
 *  Buzzer      → GPIO 5
 *
 *  ── BUG FIXES (v17 → v18) ─────────────────────────────────────────────────────
 *  [CRIT #1]  /cmd HTTP_GET → HTTP_POST  (ปุ่ม Manual กดไม่ทำงาน)
 *  [CRIT #2]  /scan Blocking WiFi → Async Scan  (กัน WDT reset)
 *  [CRIT #4]  Mutex /diag portMAX_DELAY → timeout 100ms  (กันหน้าเว็บค้าง)
 *  [SHD  #5]  ลบ d < 0 บน uint32_t  (logic bug เงียบ)
 *  [SHD  #6]  pollSec constrain ออกจาก loop → loadConfig/saveConfig
 *  [SHD  #7]  FanDriver HAL รั่ว → beepType ผ่าน constructor
 *  [SHD  #8]  JS: ประกาศ let currentSysRsn/fan1Rsn/fan2Rsn ด้านบน
 *  [SHD  #9]  ลบ Dead Code STATE_SAFE_MODE, EV_BROWN_OUT
 *  [SHD #10]  เพิ่ม Threshold validation ใน /setConfig (tMed<tHigh, hMed<hHigh)
 *  [JS  #11]  up(): เช็ค r.ok ก่อน r.json() กัน crash เมื่อ 503
 *  [JS  #12]  vb_t danger: guard d.valid ก่อนเช็ค d.t
 *  [JS  #13]  g1_rsn/g2_rsn: null-safe (d[...] || '')
 *  [JS  #14]  saveCfg: ไม่ปิด modal เมื่อ server ส่ง 400
 *  [JS  #15]  saveWifi: เช็ค r.ok ก่อนแสดง success
 *
 *  ── NEW in v18.1.0 ────────────────────────────────────────────────────────────────
 *  [A2]  Mutex lock ใน /setConfig กัน data race กับ TaskCore
 *  [B1]  WDT trigger_panic=true  (โชว์ backtrace ใน Serial ช่วย debug)
 *  [C2]  TaskNetwork stack 12288 bytes  (กัน HTTPClient stack overflow)
 *  [D2]  MQTT Exponential Backoff  (5s→10s→20s→40s→60s max)
 *        + Enhanced Serial Logging ทุกเหตุการณ์สำคัญ
 *
 *  ── NEW in v19.0.0 ────────────────────────────────────────────────────────────────
 *  [F1]  RS485 SHT20 Modbus RTU support.
 *  [E1]  Rich JSON Payload สำหรับ PostgreSQL + InfluxDB + Grafana
 *        Fields: device_id, fw_ver, timestamp_unix, temp_c, humi_pct,
 *                thi, thi_level, fan1_on, fan2_on, fans_active,
 *                sys_mode, failsafe, manual_mode, sensor_ok,
 *                wifi_rssi, free_heap, uptime_s
 *  [E2]  MQTT topic เปลี่ยนเป็น farm/sensor (เดิม farm/status)
 *  [E3]  HTTP POST เพิ่ม X-Device-ID header
 *  [E4]  calcTHI() + thiLevel() helper function
 *
 *  ── TODO (v19 Production) ─────────────────────────────────────────────────────────
 *  - Sensor Hardware: ยืนยัน register map/scale factor ของ RS485 Modbus RTU SHT20 รุ่นจริงก่อน field deployment
 *  - Node-RED Flow: 
 *    1) ถ้า payload.time_synced == false หรือ timestamp_unix == 0 ให้ใช้เวลาฝั่ง server แทนก่อนเขียนลง DB
 *    2) Messaging Alerts: 
 *       - ถ้า failsafe == true ส่งแจ้งเตือน Line/Teams
 *       - ถ้า sensor_ok == false ส่งแจ้งเตือน
 *       - ถ้า device offline / MQTT LWT ส่งแจ้งเตือน
 *
 *  ⚠️  POC BUILD: Credentials hardcoded — ระบบปิด Local Network ฟาร์ม
 *      Production (v19+): Captive Portal first-run setup
 * ===================================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#define ELEGANTOTA_USE_ASYNC_WEBSERVER 1
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <Preferences.h>
#include <ModbusMaster.h>
#include <ArduinoJson.h>
#include <ElegantOTA.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <Adafruit_NeoPixel.h>
#include <time.h>
#include <esp_task_wdt.h>
#include <DNSServer.h>
#include "esp_ota_ops.h"
#include "esp_system.h"
#include <freertos/semphr.h>
#include <freertos/queue.h>
#include <LittleFS.h>
#include <Update.h>

// ── CONSTANTS & PINS ───────────────────────────────────────
// TODO: Confirm final ESP32-S3 GPIO pin mapping with the actual board schematic before field deployment.
// ESP32 relay output controls contactor coil only. Do not drive motor fan load directly from ESP relay module.
// Reserved pins — do NOT use for relay:
//   GPIO48 = RGB LED / NeoPixel
//   GPIO47 = avoid (may conflict with ESP32-S3 Flash/PSRAM routing)
//   GPIO16 = RS485 RX, GPIO17 = RS485 TX, GPIO4 = RS485 DE/RE
#define FAN_COUNT       6
static const uint8_t FAN_RELAY_PINS[FAN_COUNT] = {18, 19, 21, 15, 14, 13};
#define RELAY_ON        LOW
#define RELAY_OFF       HIGH
#define RGB_PIN         48
#define BUZZER_PIN      5
#define FW_VERSION      "v19.0.0-RS485"

// RS485 / Modbus RTU Pins & Config
static const int RS485_RX_PIN    = 16;
static const int RS485_TX_PIN    = 17;
static const int RS485_DE_RE_PIN = 4; // ใช้ GPIO 4 แทนขา DHT21 เดิม
static const uint32_t RS485_SERIAL_CONFIG = SERIAL_8N1;

// SHT20 Modbus Registers
static const uint16_t SHT20_REG_TEMP  = 0x0001;  // TODO: confirm from actual datasheet
static const uint16_t SHT20_REG_HUMI  = 0x0002;  // TODO: confirm from actual datasheet
static const uint8_t  SHT20_REG_COUNT = 2;       // TODO: confirm from actual datasheet
static const float    SHT20_TEMP_SCALE = 0.1f;   // TODO: confirm scale factor (e.g. 0.1 means 250 -> 25.0 C)
static const float    SHT20_HUMI_SCALE = 0.1f;   // TODO: confirm scale factor

// ── ENUMS & STRUCTS ────────────────────────────────────────
// [FIX #9] ลบ STATE_SAFE_MODE, EV_BROWN_OUT (dead code)
enum SystemState { STATE_INIT, STATE_WARMUP, STATE_NORMAL, STATE_FAILSAFE };
enum EventType   { EV_NONE, EV_SENSOR_DATA, EV_SENSOR_FAIL, EV_MANUAL_START, EV_MANUAL_END };

struct Event {
    EventType type;
    float val1, val2;
    uint32_t timestamp;
};

// ⚠️  POC BUILD: Credentials hardcoded สำหรับ Local Network ฟาร์ม
struct Config {
    char ssid[33]       = "saisuoy";
    char wifiPass[64]   = "123456789";
    char mqttServer[64] = "10.1.217.15";
    char nrUrl[128]     = "http://10.1.217.15:1880/data";
    char mqttUser[33]   = "", mqttPass[33] = "";
    char ntp1[64]       = "192.168.186.40";
    char ntp2[64]       = "192.168.186.12";
    char ntp3[64]       = "pool.ntp.org";
    int  mqttPort=1883, ntpOfs=7, pollSec=5, nrSec=10;
    int  startupDly=20, minRunMin=10, minOffMin=2, staggerSec=5, sfLimit=3;
    float tMed=29.0, tHigh=32.0, hMed=75.0, hHigh=85.0;
    float hystT=1.0, hystH=5.0;
    bool buzzerEn=true;
    char adminUser[33] = "admin", adminPass[33] = "feedtech";
    uint8_t rs485_slaveId = 1;
    uint32_t rs485_baud = 9600;
} cfg;

// ── DEVICE IDENTITY (ตั้งค่าใน setup() จาก MAC address) ────
// ใช้เป็น Primary Key / Tag ใน PostgreSQL & InfluxDB
// รองรับหลายโรงเรือน แค่เปลี่ยนบอร์ด MAC ก็แยก device ได้อัตโนมัติ
char deviceId[24] = "DUCK-UNKNOWN";  // เช่น "DUCK-AABBCCDDEEFF"

// ── HARDWARE ABSTRACTION LAYER (HAL) ───────────────────────

class BuzzerDriver {
public:
    BuzzerDriver(uint8_t pin)
        : _pin(pin), _enabled(true),
          _reqBeepShort(false), _reqBeepDouble(false), _reqSiren(false) {
        _mux = portMUX_INITIALIZER_UNLOCKED;
    }
    void init()           { pinMode(_pin, OUTPUT); noTone(_pin); }
    void setEnabled(bool e) { _enabled = e; }
    void beepShort()  { taskENTER_CRITICAL(&_mux); _reqBeepShort  = true; taskEXIT_CRITICAL(&_mux); }
    void beepDouble() { taskENTER_CRITICAL(&_mux); _reqBeepDouble = true; taskEXIT_CRITICAL(&_mux); }
    void alarmSiren(bool active) { taskENTER_CRITICAL(&_mux); _reqSiren = active; taskEXIT_CRITICAL(&_mux); }

    void loop() {
        if (!_enabled) { noTone(_pin); vTaskDelay(pdMS_TO_TICKS(500)); return; }
        bool b1, b2, bs;
        taskENTER_CRITICAL(&_mux);
        b1 = _reqBeepShort;  _reqBeepShort  = false;
        b2 = _reqBeepDouble; _reqBeepDouble = false;
        bs = _reqSiren;
        taskEXIT_CRITICAL(&_mux);
        // [UPDATE] ไซเรนเสียงนุ่ม (Soft Siren) ความถี่ต่ำ ไม่กระชาก ไม่ทำให้เป็ดตกใจ/เครียด
        if      (bs) { tone(_pin, 400); vTaskDelay(pdMS_TO_TICKS(600)); tone(_pin, 600); vTaskDelay(pdMS_TO_TICKS(600)); }
        else if (b2) { tone(_pin, 800, 100); vTaskDelay(pdMS_TO_TICKS(200)); tone(_pin, 800, 100); vTaskDelay(pdMS_TO_TICKS(200)); }
        else if (b1) { tone(_pin, 800, 100); vTaskDelay(pdMS_TO_TICKS(200)); }
        else         { noTone(_pin); vTaskDelay(pdMS_TO_TICKS(200)); }
    }
private:
    uint8_t _pin;
    bool _enabled, _reqBeepShort, _reqBeepDouble, _reqSiren;
    portMUX_TYPE _mux;
};

BuzzerDriver buzzer(BUZZER_PIN);

// [FIX #7] FanDriver รับ beepType ผ่าน constructor — ไม่รู้จัก pin อีกต่อไป
class FanDriver {
public:
    FanDriver(uint8_t pin, const char* name, uint8_t beepType = 1)
        : _pin(pin), _name(name), _beepType(beepType),
          _state(false), _target(false), _startAt(0) {
        strlcpy(_reason, "Booting...", 64);
    }
    void init()              { digitalWrite(_pin, RELAY_OFF); pinMode(_pin, OUTPUT); }
    void setTarget(bool t)   { _target = t; }
    void setTarget(bool t, const char* reason) { _target = t; if (reason) strlcpy(_targetReason, reason, sizeof(_targetReason)); }
    void forceOn(const char* reason) {
        _target = true;
        _state = true;
        _startAt = millis();
        digitalWrite(_pin, RELAY_ON);
        strlcpy(_reason, reason, sizeof(_reason));
    }
    bool isOn()        const { return _state; }
    bool getTarget()   const { return _target; }
    const char* getName()    const { return _name; }
    const char* getReason()  const { return _reason; }
    uint32_t getStartAt()    const { return _startAt; }

    void checkCooldowns(uint32_t now, uint32_t minRunMs,
                        uint32_t staggerMs = 0, bool prevOn = true, uint32_t prevStartAt = 0, uint32_t minOffMs = 0) {
        bool wantOn = _target;
        if (staggerMs > 0 && wantOn) {
            if (!prevOn) {
                wantOn = false;
            } else if ((now - prevStartAt) < staggerMs) {
                wantOn = false;
                snprintf(_reason, 64, "Stagger (%lus left)", (staggerMs - (now - prevStartAt)) / 1000);
            }
        }
        if (wantOn && !_state && minOffMs > 0 && _lastOffAt > 0) {
            uint32_t offFor = now - _lastOffAt;
            if (offFor < minOffMs) {
                uint32_t left = (minOffMs - offFor) / 1000;
                snprintf(_reason, 64, "MinOff (%02lu:%02lu left)", left / 60, left % 60);
                wantOn = false;
            }
        }
        if (wantOn && !_state) {
            digitalWrite(_pin, RELAY_ON);
            _state = true; _startAt = now;
            if (_targetReason[0] != '\0') { snprintf(_reason, 64, "Running (%s)", _targetReason); _targetReason[0] = '\0'; }
            else strlcpy(_reason, "Running (Target Met)", 64);
            if (_beepType == 1) buzzer.beepShort(); else buzzer.beepDouble();
        } else if (!wantOn && _state) {
            uint32_t ran = now - _startAt;
            if (ran < minRunMs) {
                uint32_t left = (minRunMs - ran) / 1000;
                snprintf(_reason, 64, "Cooldown (%02lu:%02lu left)", left / 60, left % 60);
            } else {
                digitalWrite(_pin, RELAY_OFF);
                _state = false;
                _lastOffAt = now;
                strlcpy(_reason, "OFF (Standby)", 64);
            }
        } else if (!wantOn && !_state) {
            strlcpy(_reason, "OFF (Standby)", 64);
        }
    }
private:
    uint8_t _pin;
    const char* _name;
    uint8_t _beepType;
    bool _state, _target;
    uint32_t _startAt;
    uint32_t _lastOffAt = 0;
    char _reason[64];
    char _targetReason[32] = "";
};

FanDriver fans[FAN_COUNT] = {
    FanDriver(FAN_RELAY_PINS[0], "Fan 1", 1),
    FanDriver(FAN_RELAY_PINS[1], "Fan 2", 2),
    FanDriver(FAN_RELAY_PINS[2], "Fan 3", 1),
    FanDriver(FAN_RELAY_PINS[3], "Fan 4", 2),
    FanDriver(FAN_RELAY_PINS[4], "Fan 5", 1),
    FanDriver(FAN_RELAY_PINS[5], "Fan 6", 2),
};

// ── Fan Group Helpers ──────────────────────────────────────
void setAllFansTarget(bool on, const char* rsn)  { for(int i=0;i<FAN_COUNT;i++) fans[i].setTarget(on,rsn); }
void forceAllFansOn(const char* rsn)             { for(int i=0;i<FAN_COUNT;i++) if(!fans[i].isOn()) fans[i].forceOn(rsn); }
void setOddFansTarget(bool on, const char* rsn)  { for(int i=0;i<FAN_COUNT;i+=2) fans[i].setTarget(on,rsn); }  // Fan 1,3,5
void setEvenFansTarget(bool on, const char* rsn) { for(int i=1;i<FAN_COUNT;i+=2) fans[i].setTarget(on,rsn); }  // Fan 2,4,6

// ── GLOBALS ────────────────────────────────────────────────
QueueHandle_t    eventBus;
SemaphoreHandle_t coreMux;
SemaphoreHandle_t logMux;
float       core_temp = 0, core_humi = 0;
bool        core_sensorValid = false;
uint32_t    core_lastSensorOkMs = 0;
char        core_sysReason[64] = "Booting...";
SystemState core_state = STATE_INIT;
volatile bool rebootPending = false;

// ── SENSOR DRIVER ABSTRACTION ──────────────────────────────
class SensorDriver {
public:
    virtual bool begin() = 0;
    virtual bool read(float &temp, float &humi) = 0;
    virtual const char* name() const = 0;
    virtual uint8_t lastError() const = 0;
};

HardwareSerial rs485Serial(1);
ModbusMaster node;

// Modbus DE/RE Callbacks
void preTransmission() {
    digitalWrite(RS485_DE_RE_PIN, HIGH);
}
void postTransmission() {
    digitalWrite(RS485_DE_RE_PIN, LOW);
}

class RS485SHT20SensorDriver : public SensorDriver {
private:
    uint8_t _lastError = 0;
public:
    bool begin() override {
        pinMode(RS485_DE_RE_PIN, OUTPUT);
        digitalWrite(RS485_DE_RE_PIN, LOW);
        rs485Serial.begin(cfg.rs485_baud, RS485_SERIAL_CONFIG, RS485_RX_PIN, RS485_TX_PIN);
        node.begin(cfg.rs485_slaveId, rs485Serial);
        node.preTransmission(preTransmission);
        node.postTransmission(postTransmission);
        return true;
    }
    
    bool read(float &temp, float &humi) override {
        // อ่านค่า 2 Registers (อุณหภูมิ + ความชื้น) SHT20 มักจะใช้ 0x04 Read Input Registers หรือ 0x03 Read Holding Registers
        uint8_t result = node.readInputRegisters(SHT20_REG_TEMP, SHT20_REG_COUNT);
        if (result == node.ku8MBSuccess) {
            float t = node.getResponseBuffer(0) * SHT20_TEMP_SCALE;
            float h = node.getResponseBuffer(1) * SHT20_HUMI_SCALE;
            
            // Validate value ranges
            if (t >= -5.0 && t <= 55.0 && h >= 0.0 && h <= 100.0) {
                temp = t;
                humi = h;
                _lastError = 0;
                return true;
            }
            _lastError = 0xFF; // Invalid data limits
            return false;
        }
        _lastError = result;
        return false;
    }
    
    const char* name() const override { return "RS485_SHT20"; }
    uint8_t lastError() const override { return _lastError; }
};

RS485SHT20SensorDriver sensor;
AsyncWebServer server(80);
WiFiClient     espClient;
PubSubClient   mqtt(espClient);
Adafruit_NeoPixel rgb(1, RGB_PIN, NEO_GRB + NEO_KHZ800);
Preferences    pref;
DNSServer      dnsServer;

// ── ENHANCED LOGGING ───────────────────────────────────────
// บันทึก log ลง LittleFS (rotate เมื่อ > 64KB) + Serial output
// Format: [uptime_ms] [LEVEL] message
void SystemLog(const char* level, const char* msg) {
    char line[128];
    snprintf(line, sizeof(line), "[%8lu] [%s] %s", millis(), level, msg);
    
    if (logMux && xSemaphoreTake(logMux, pdMS_TO_TICKS(100)) == pdTRUE) {
        Serial.println(line);
        if (LittleFS.exists("/sys.log")) {
            File fCheck = LittleFS.open("/sys.log", FILE_READ);
            if (fCheck && fCheck.size() > 65536) {
                fCheck.close();
                if (LittleFS.exists("/sys.bak")) LittleFS.remove("/sys.bak");
                LittleFS.rename("/sys.log", "/sys.bak");
                Serial.println("[LOG] Rotated sys.log → sys.bak");
            } else if (fCheck) fCheck.close();
        }
        File f = LittleFS.open("/sys.log", FILE_APPEND);
        if (f) { f.println(line); f.close(); }
        xSemaphoreGive(logMux);
    } else {
        Serial.println(line); // Fallback to serial only
    }
}
// Shorthand helpers
void LOG_INFO(const char* msg)  { SystemLog("INFO ", msg); }
void LOG_WARN(const char* msg)  { SystemLog("WARN ", msg); }
void LOG_ERROR(const char* msg) { SystemLog("ERROR", msg); }

// ── CONFIG (NVS) ───────────────────────────────────────────
void loadConfig() {
    pref.begin("farm", true);
    if (pref.isKey("ssid")) {
        strlcpy(cfg.ssid,       pref.getString("ssid",  cfg.ssid).c_str(),       33);
        strlcpy(cfg.wifiPass,   pref.getString("wpass", cfg.wifiPass).c_str(),    64);
        strlcpy(cfg.mqttServer, pref.getString("mqSrv", cfg.mqttServer).c_str(),  64);
        strlcpy(cfg.nrUrl,      pref.getString("nrUrl", cfg.nrUrl).c_str(),      128);
        strlcpy(cfg.ntp1,       pref.getString("ntp1",  cfg.ntp1).c_str(),        64);
        strlcpy(cfg.ntp2,       pref.getString("ntp2",  cfg.ntp2).c_str(),        64);
        strlcpy(cfg.ntp3,       pref.getString("ntp3",  cfg.ntp3).c_str(),        64);
        strlcpy(cfg.adminUser,  pref.getString("aUsr",  cfg.adminUser).c_str(),   33);
        strlcpy(cfg.adminPass,  pref.getString("aPwd",  cfg.adminPass).c_str(),   33);
        cfg.mqttPort   = pref.getInt("mqPrt",   cfg.mqttPort);
        cfg.ntpOfs     = pref.getInt("ntpOfs",  cfg.ntpOfs);
        cfg.pollSec    = pref.getInt("pollSec", cfg.pollSec);
        cfg.nrSec      = pref.getInt("nrSec",   cfg.nrSec);
        cfg.startupDly = pref.getInt("sDly",    cfg.startupDly);
        cfg.staggerSec = pref.getInt("stagger", cfg.staggerSec);
        cfg.minOffMin  = pref.getInt("minOff",  cfg.minOffMin);
        cfg.sfLimit    = pref.getInt("sfLim",   cfg.sfLimit);
        cfg.tMed       = pref.getFloat("tMed",  cfg.tMed);
        cfg.tHigh      = pref.getFloat("tHigh", cfg.tHigh);
        cfg.hMed       = pref.getFloat("hMed",  cfg.hMed);
        cfg.hHigh      = pref.getFloat("hHigh", cfg.hHigh);
        cfg.hystT      = pref.getFloat("hystT", cfg.hystT);
        cfg.hystH      = pref.getFloat("hystH", cfg.hystH);
        cfg.minRunMin  = pref.getInt("minRun",  cfg.minRunMin);
        cfg.buzzerEn   = pref.getBool("buzz",   cfg.buzzerEn);
        cfg.rs485_slaveId = pref.getUChar("slaveId", cfg.rs485_slaveId);
        cfg.rs485_baud = pref.getUInt("baud", cfg.rs485_baud);
        LOG_INFO("Config loaded from NVS");
    } else {
        LOG_WARN("No NVS config found — using hardcoded POC defaults");
    }
    pref.end();
    // [FIX #6] constrain ครั้งเดียวหลัง load ไม่ใช่ทุก loop
    cfg.pollSec = constrain(cfg.pollSec, 2, 60);
}

void saveConfig() {
    cfg.pollSec = constrain(cfg.pollSec, 2, 60); // [FIX #6]
    pref.begin("farm", false);
    pref.putString("ssid",    cfg.ssid);    pref.putString("wpass", cfg.wifiPass);
    pref.putString("mqSrv",   cfg.mqttServer); pref.putString("nrUrl", cfg.nrUrl);
    pref.putString("ntp1",    cfg.ntp1);    pref.putString("ntp2",  cfg.ntp2);
    pref.putString("ntp3",    cfg.ntp3);
    pref.putString("aUsr",    cfg.adminUser); pref.putString("aPwd", cfg.adminPass);
    pref.putInt("mqPrt",      cfg.mqttPort); pref.putInt("ntpOfs",  cfg.ntpOfs);
    pref.putInt("pollSec",    cfg.pollSec);  pref.putInt("nrSec",   cfg.nrSec);
    pref.putInt("sDly",       cfg.startupDly); pref.putInt("stagger", cfg.staggerSec);
    pref.putInt("sfLim",      cfg.sfLimit);
    pref.putFloat("tMed",     cfg.tMed);    pref.putFloat("tHigh",  cfg.tHigh);
    pref.putFloat("hMed",     cfg.hMed);    pref.putFloat("hHigh",  cfg.hHigh);
    pref.putFloat("hystT",    cfg.hystT);   pref.putFloat("hystH",  cfg.hystH);
    pref.putInt("minRun",     cfg.minRunMin);
    pref.putInt("minOff",     cfg.minOffMin);
    pref.putBool("buzz",  cfg.buzzerEn);
    pref.putUChar("slaveId", cfg.rs485_slaveId);
    pref.putUInt("baud", cfg.rs485_baud);
    pref.end();
    LOG_INFO("Config saved to NVS");
}

// ── WEB UI (HTML/CSS/JS) ────────────────────────────────────
const char HTML_UI[] PROGMEM = R"=====(
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AeroDuck Pro — Duck Farm Controller</title>
<style>
:root{--bg:#0f172a;--card:rgba(30,41,59,0.85);--text:#f8fafc;--muted:#94a3b8;--green:#10b981;--red:#f43f5e;--blue:#38bdf8;--amber:#f59e0b;--border:rgba(255,255,255,0.08)}
*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif}
body{background:var(--bg);color:var(--text);padding:15px;display:flex;justify-content:center}
.container{max-width:860px;width:100%;background:var(--card);backdrop-filter:blur(12px);border:1px solid var(--border);border-radius:24px;padding:25px;box-shadow:0 15px 35px rgba(0,0,0,0.5)}
.top-bar{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);background:rgba(15,23,42,0.5);padding:10px 15px;border-radius:12px;margin-bottom:25px;border:1px solid var(--border);font-weight:bold}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:5px;background:#64748b;transition:0.3s}
.dot.on{background:var(--green);box-shadow:0 0 6px var(--green)}.dot.off{background:var(--red)}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:20px;margin-bottom:20px}
.header h1{font-size:24px;background:linear-gradient(to right,#38bdf8,#34d399);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.ver{font-size:10px;color:var(--muted);margin-top:2px}
.sys-rsn{font-family:monospace;color:var(--amber);font-size:13px;margin-top:4px}
.btn-icon{background:#1e293b;border:1px solid var(--border);color:white;padding:10px;border-radius:12px;cursor:pointer;font-size:16px}
.thi-bar{background:rgba(15,23,42,0.5);border:1px solid var(--border);border-radius:16px;padding:15px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;transition:border-color 0.5s,background 0.5s}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:20px}
.box{background:rgba(15,23,42,0.4);border:1px solid var(--border);border-radius:16px;padding:20px;position:relative;transition:0.4s}
.box.danger{border-color:var(--red);background:rgba(244,63,94,0.1);box-shadow:0 0 20px rgba(244,63,94,0.15)}
.val{font-size:3.2rem;font-weight:900;margin-top:5px;font-variant-numeric:tabular-nums}
.fan-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.tag{padding:5px 12px;border-radius:20px;font-size:12px;font-weight:bold;background:#334155;color:var(--muted)}
.tag.on{background:rgba(16,185,129,0.15);color:var(--green);border:1px solid rgba(16,185,129,0.3);box-shadow:0 0 10px rgba(16,185,129,0.2)}
.fan-rsn{font-family:monospace;font-size:12px;color:var(--amber);background:rgba(15,23,42,0.5);padding:8px 10px;border-radius:10px;border:1px solid rgba(245,158,11,0.2)}
.fan-rsn.run{color:var(--green);background:rgba(16,185,129,0.1);border-color:rgba(16,185,129,0.2)}
.controls{background:rgba(15,23,42,0.5);padding:22px;border-radius:20px;border:1px solid var(--border)}
.slider-row{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px}
input[type=range]{width:100%;margin-bottom:18px;height:10px;background:#334155;border-radius:5px;outline:none;accent-color:var(--blue)}
.btn-group{display:flex;gap:12px;flex-wrap:wrap}
button{flex:1;min-width:140px;padding:14px;border:none;border-radius:12px;font-weight:bold;color:white;cursor:pointer;font-size:14px;transition:0.2s}
button:active{transform:scale(0.97)}
button.start{background:#0284c7;box-shadow:0 4px 12px rgba(2,132,199,0.35)}
button.stop{background:#e11d48;box-shadow:0 4px 12px rgba(225,29,72,0.35)}
.prog-bg{background:#334155;height:8px;border-radius:4px;margin-top:18px;display:none;overflow:hidden}
.prog-bar{background:var(--blue);height:100%;width:0%;transition:width 1s linear;border-radius:4px}
svg.sparkline{width:100%;height:38px;margin-top:12px;overflow:visible}
svg.sparkline path{fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
#modal{position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(5px);display:flex;justify-content:center;align-items:center;z-index:50;opacity:0;visibility:hidden;transition:all 0.3s ease}
#modal.show{opacity:1;visibility:visible}
.modal-content{background:#1e293b;padding:25px;border-radius:24px;width:90%;max-width:460px;max-height:90vh;overflow-y:auto;border:1px solid var(--border);box-shadow:0 25px 50px rgba(0,0,0,0.6);transform:scale(0.95);transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1)}
#modal.show .modal-content{transform:scale(1)}
.input-group{margin-bottom:11px}
.input-group label{display:block;font-size:12px;font-weight:bold;margin-bottom:4px;color:var(--muted)}
.input-group input{width:100%;padding:9px 12px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:white;font-size:14px;outline:none;transition:border-color 0.2s}
.input-group input:focus{border-color:var(--blue)}
button.save{background:var(--green);width:100%;margin-top:12px}
button.scan{background:#334155;color:white;padding:9px 14px;font-size:12px;border-radius:10px;border:1px solid #475569;flex:none;min-width:auto}
#toast{position:fixed;bottom:-100px;left:50%;transform:translateX(-50%);padding:13px 22px;border-radius:14px;font-weight:bold;color:white;transition:0.4s;z-index:100;display:flex;gap:10px;align-items:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);white-space:nowrap}
#toast.show{bottom:28px}
.section-title{color:var(--blue);font-size:13px;margin-bottom:8px;border-bottom:1px solid var(--border);padding-bottom:4px}
</style>
</head>
<body>
<div class="container">
  <div class="top-bar">
    <div>
      <span id="wifi-dot" class="dot"></span>WiFi&nbsp;<span id="wifi">-</span>
      &nbsp;&nbsp;
      <span id="mqtt-dot" class="dot"></span>MQTT&nbsp;<span id="mqtt-ip">-</span>
    </div>
    <div>
      <span id="time-status" style="margin-right:15px;color:var(--amber)">Time: Not Synced</span>
      ⏱ <span id="uptime" style="color:#e2e8f0">00:00:00</span>
    </div>
  </div>

  <div class="header">
    <div style="display:flex;align-items:center;gap:14px">
      <span style="font-size:34px">🦆</span>
      <div>
        <h1>AeroDuck Pro</h1>
        <div class="ver" id="ver-label">Farm Controller v19.0.0</div>
        <div id="sys" class="sys-rsn">Booting System...</div>
      </div>
    </div>
    <button class="btn-icon" onclick="toggleSettings()" title="Settings">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    </button>
  </div>

  <div id="thi-bar" class="thi-bar">
    <div>
      <div style="font-size:11px;font-weight:bold;color:var(--muted);letter-spacing:1px">ดัชนีความเครียดเป็ด (POULTRY STRESS INDEX - THI)</div>
      <div id="thi-text" style="font-size:18px;font-weight:900;margin-top:3px">Calculating...</div>
    </div>
    <div id="thi-val" class="val" style="font-size:30px">--.-</div>
  </div>

  <div class="grid">
    <div id="vb_t" class="box">
      <div style="font-size:11px;font-weight:bold;color:var(--muted);letter-spacing:1px">อุณหภูมิ (TEMPERATURE)</div>
      <div id="t" class="val">--.-°C</div>
      <svg class="sparkline"><path id="line-t" stroke="#f43f5e"></path></svg>
    </div>
    <div id="vb_h" class="box">
      <div style="font-size:11px;font-weight:bold;color:var(--muted);letter-spacing:1px">ความชื้นสัมพัทธ์ (HUMIDITY)</div>
      <div id="h" class="val">--.-%</div>
      <svg class="sparkline"><path id="line-h" stroke="#38bdf8"></path></svg>
    </div>
  </div>

  <div class="grid" style="grid-template-columns:1fr 1fr 1fr">
    <div class="box"><div class="fan-hdr"><h3 style="font-size:14px;display:flex;align-items:center;gap:4px">💨 Fan 1</h3><span id="f1s" class="tag">OFF</span></div><div id="f1r" class="fan-rsn">Waiting...</div></div>
    <div class="box"><div class="fan-hdr"><h3 style="font-size:14px;display:flex;align-items:center;gap:4px">💨 Fan 2</h3><span id="f2s" class="tag">OFF</span></div><div id="f2r" class="fan-rsn">Waiting...</div></div>
    <div class="box"><div class="fan-hdr"><h3 style="font-size:14px;display:flex;align-items:center;gap:4px">💨 Fan 3</h3><span id="f3s" class="tag">OFF</span></div><div id="f3r" class="fan-rsn">Waiting...</div></div>
    <div class="box"><div class="fan-hdr"><h3 style="font-size:14px;display:flex;align-items:center;gap:4px">💨 Fan 4</h3><span id="f4s" class="tag">OFF</span></div><div id="f4r" class="fan-rsn">Waiting...</div></div>
    <div class="box"><div class="fan-hdr"><h3 style="font-size:14px;display:flex;align-items:center;gap:4px">💨 Fan 5</h3><span id="f5s" class="tag">OFF</span></div><div id="f5r" class="fan-rsn">Waiting...</div></div>
    <div class="box"><div class="fan-hdr"><h3 style="font-size:14px;display:flex;align-items:center;gap:4px">💨 Fan 6</h3><span id="f6s" class="tag">OFF</span></div><div id="f6r" class="fan-rsn">Waiting...</div></div>
  </div>

  <div class="controls">
    <div class="slider-row">
      <label style="font-weight:bold">⏱ เวลาเปิดพัดลมแบบแมนนวล (นาที)</label>
      <span id="slider-val" style="color:var(--blue);font-weight:900;font-size:22px">30</span>
    </div>
    <input type="range" id="time-slider" min="1" max="120" value="30"
           oninput="document.getElementById('slider-val').innerText=this.value">
    <div class="btn-group">
      <button class="start" onclick="c(1,document.getElementById('time-slider').value)">▶️ Start Manual</button>
      <button class="stop"  onclick="c(0)">🛑 Stop (Auto)</button>
    </div>
    <div id="prog-wrap" class="prog-bg"><div id="prog-bar" class="prog-bar"></div></div>
  </div>
</div>

<!-- Settings Modal -->
<div id="modal">
  <div class="modal-content">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
      <h2 style="font-size:20px;font-weight:900">⚙️ Settings</h2>
      <button class="btn-icon" style="border:none;padding:4px;background:transparent;color:var(--muted)" onclick="toggleSettings()">✕</button>
    </div>

    <form onsubmit="saveCfg(event)">
      <div class="section-title">🌡️ Temperature & Humidity Thresholds</div>
      <div class="input-group"><label>All Fans ON — Temperature High (°C) [tHigh]</label><input type="number" step="0.1" id="cfg_tHigh" name="tHigh"></div>
      <div class="input-group"><label>Odd Fans ON — Temperature Med (°C) [tMed &lt; tHigh]</label><input type="number" step="0.1" id="cfg_tMed" name="tMed"></div>
      <div class="input-group"><label>All Fans ON — Humidity High (%) [hHigh]</label><input type="number" step="0.1" id="cfg_hHigh" name="hHigh"></div>
      <div class="input-group"><label>Odd Fans ON — Humidity Med (%) [hMed &lt; hHigh]</label><input type="number" step="0.1" id="cfg_hMed" name="hMed"></div>
      <button type="submit" class="save">💾 Save Config</button>
    </form>

    <hr style="border:0;border-bottom:1px solid var(--border);margin:18px 0">

    <div class="section-title">📡 WiFi (AP Fallback / Change Network)</div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button type="button" class="scan" onclick="scanWifi()">🔍 Scan</button>
      <select id="wifiSelect" onchange="document.getElementById('cfg_ssid').value=this.value"
              style="flex:1;background:#0f172a;color:white;border:1px solid #334155;border-radius:10px;padding:9px;outline:none;font-size:13px">
        <option value="">Select Network...</option>
      </select>
    </div>
    <form onsubmit="saveWifi(event)">
      <div class="input-group"><label>SSID</label><input type="text" id="cfg_ssid" name="ssid" placeholder="MyWiFi" required></div>
      <div class="input-group"><label>Password</label><input type="password" id="cfg_wpass" name="wpass" placeholder="Leave blank if open"></div>
      <button type="submit" style="background:var(--blue);width:100%;margin-top:8px">🔗 Connect & Reboot</button>
    </form>

    <hr style="border:0;border-bottom:1px solid var(--border);margin:18px 0">
    <button onclick="if(confirm('Reboot now?'))fetch('/reboot')" style="background:#475569;width:100%;flex:none">🔄 Reboot Device</button>
  </div>
</div>

<div id="toast"><span id="toast-icon" style="font-size:18px">✓</span><span id="toast-msg">OK</span></div>

<script>
'use strict';
// ── State ──────────────────────────────────────────────────
let toastTimeout;
const historyT = [], historyH = [];
let isModalOpen  = false;
// [FIX #8] ประกาศตัวแปรก่อนใช้ — ป้องกัน ReferenceError
let currentSysRsn = "";
let fan1Rsn = "";
let fan2Rsn = "";
// [FIX - Progress] เก็บ duration ที่ตอนกด Start เพื่อคำนวณ progress bar ถูกต้อง
let manualDurMin = 30;

// ── Helpers ────────────────────────────────────────────────
function setTxt(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

function setClass(id, cls) {
    const el = document.getElementById(id);
    if (el) el.className = cls;
}

function tt(m, isErr = false) {
    const el = document.getElementById('toast');
    clearTimeout(toastTimeout);
    document.getElementById('toast-msg').innerText = m;
    document.getElementById('toast-icon').innerText = isErr ? '⚠️' : '✓';
    el.style.background = isErr ? 'var(--red)' : 'var(--green)';
    el.style.border = `1px solid ${isErr ? '#fda4af' : '#6ee7b7'}`;
    el.classList.add('show');
    toastTimeout = setTimeout(() => el.classList.remove('show'), 4000);
}

function toggleSettings() {
    const modal = document.getElementById('modal');
    isModalOpen = !isModalOpen;
    modal.classList.toggle('show', isModalOpen);
}

function fmtTime(sec) {
    const h = Math.floor(sec / 3600).toString().padStart(2,'0');
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2,'0');
    const s = (sec % 60).toString().padStart(2,'0');
    return `${h}:${m}:${s}`;
}

function getTHI(t, h) {
    return (1.8 * t + 32) - ((0.55 - 0.0055 * h) * (1.8 * t - 58));
}

function drawSparkline(id, data, max, min) {
    if (data.length < 2) return;
    const el = document.getElementById(id);
    if (!el) return;
    const w = el.parentElement.clientWidth, h = 38;
    const pts = data.map((val, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((val - min) / (Math.max(max - min, 0.01)) * h);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${Math.max(2, Math.min(h - 2, y)).toFixed(1)}`;
    });
    el.setAttribute('d', pts.join(' '));
}

// ── Config Save ────────────────────────────────────────────
function saveCfg(e) {
    e.preventDefault();
    // [FIX #14] เช็ค r.ok ก่อน — ถ้า 400 ให้คง modal ไว้ + แสดง error
    fetch('/setConfig', { method: 'POST', body: new URLSearchParams(new FormData(e.target)) })
        .then(r => r.text().then(t => ({ ok: r.ok, text: t })))
        .then(res => {
            if (!res.ok) {
                tt('❌ ' + res.text, true);   // modal ยังเปิดอยู่ ให้แก้ค่าใหม่ได้
            } else {
                tt('✅ ' + res.text);
                toggleSettings();              // ปิด modal เฉพาะเมื่อ save สำเร็จ
            }
        })
        .catch(() => tt('❌ Network error saving config', true));
}

// ── WiFi Save ──────────────────────────────────────────────
function saveWifi(e) {
    e.preventDefault();
    // [FIX #15] เช็ค r.ok ก่อนแสดง success
    fetch('/setWifi', { method: 'POST', body: new URLSearchParams(new FormData(e.target)) })
        .then(r => r.text().then(t => ({ ok: r.ok, text: t })))
        .then(res => {
            if (!res.ok) {
                tt('❌ ' + res.text, true);
            } else {
                tt('✅ WiFi saved. Rebooting in 5s...');
                setTimeout(() => location.reload(), 5500);
            }
        })
        .catch(() => tt('❌ Network error saving WiFi', true));
}

// ── WiFi Scan (Async) ──────────────────────────────────────
// [FIX #2] ส่ง request → ถ้า 202 (scan กำลังรัน) ให้ retry ทุก 2s
function scanWifi() {
    tt('🔍 กำลังสแกน WiFi... (5–10 วินาที)');
    document.getElementById('wifiSelect').innerHTML = '<option>Scanning...</option>';
    fetchScanResult(0);
}

function fetchScanResult(attempt) {
    fetch('/scan')
        .then(r => {
            if (r.status === 202) {
                // scan ยังรัน — retry
                if (attempt < 8) {
                    setTimeout(() => fetchScanResult(attempt + 1), 2000);
                } else {
                    tt('⚠️ Scan timeout — ลองใหม่', true);
                    document.getElementById('wifiSelect').innerHTML = '<option value="">Select Network...</option>';
                }
                return null;
            }
            return r.json();
        })
        .then(d => {
            if (!d) return;
            const sel = document.getElementById('wifiSelect');
            sel.innerHTML = '<option value="">Select Network...</option>';
            d.forEach(n => {
                const opt = document.createElement('option');
                opt.value = n.ssid;
                opt.innerText = `${n.ssid} (${n.rssi} dBm)`;
                sel.appendChild(opt);
            });
            tt(`✅ พบ ${d.length} เครือข่าย`);
        })
        .catch(() => tt('❌ Scan Failed', true));
}

let cmdBusy = false;

// ── Manual Command ─────────────────────────────────────────
function c(m, d = 0) {
    if (cmdBusy) {
        tt('⏳ กำลังส่งคำสั่งก่อนหน้า กรุณารอสักครู่', true); return;
    }
    if (currentSysRsn.includes('FAILSAFE')) {
        tt('❌ สั่งงานไม่ได้: ระบบ Failsafe', true); return;
    }
    if (currentSysRsn.includes('WARMUP')) {
        tt('⏳ รอสักครู่: กำลังวอร์มเซ็นเซอร์', true); return;
    }
    cmdBusy = true;
    
    // [Optimistic UI] อัปเดตหน้าจอทันที ไม่ต้องรอ fetch ตอบกลับ เพื่อความสมูท
    if (m == 1) {
        manualDurMin = parseInt(d) || 30;
        for(let i=1;i<=6;i++){setTxt('f'+i+'s','ON');setClass('f'+i+'s','tag on');setTxt('f'+i+'r','Running (MANUAL Override)');setClass('f'+i+'r','fan-rsn run');}
        setTxt('sys', `MANUAL (${manualDurMin} min left)`);
        document.getElementById('prog-wrap').style.display = 'block';
        document.getElementById('prog-bar').style.width = '100%';
        tt(`⚡ เปิดพัดลม ${manualDurMin} นาที`);
    } else {
        for(let i=1;i<=6;i++){setTxt('f'+i+'r','Stopping...');setClass('f'+i+'r','fan-rsn');}
        setTxt('sys', 'Auto Mode');
        document.getElementById('prog-wrap').style.display = 'none';
        document.getElementById('prog-bar').style.width = '0%';
        tt('✅ กลับสู่โหมด Auto');
    }

    fetch('/cmd', { method: 'POST', body: new URLSearchParams({ man: m, dur: d }) })
        .then(r => r.text().then(t => ({ ok: r.ok, text: t })))
        .then(res => {
            if (!res.ok) tt('❌ Error: ' + res.text, true);
        })
        .catch(() => tt('❌ Network Error', true))
        .finally(() => {
            cmdBusy = false;
            up(); // ดึง state จริงกลับมาทับอีกทีเผื่อพลาด
        });
}

// ── Main Poll ──────────────────────────────────────────────
function up() {
    // [FIX #11] เช็ค r.ok ก่อน r.json() — กัน crash เมื่อ server ตอบ 503
    fetch('/diag')
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(d => {
            currentSysRsn = d.sys_rsn || '';  // [FIX #8]

            // Top bar
            const rssi = d.wifi_rssi;
            setClass('wifi-dot', `dot ${rssi > -80 ? 'on' : 'off'}`);
            setTxt('wifi', rssi + ' dBm');
            setClass('mqtt-dot', `dot ${d.mqtt_conn ? 'on' : 'off'}`);
            setTxt('mqtt-ip', d.mqtt_conn ? 'Connected' : 'Offline');
            
            const timeStatus = document.getElementById('time-status');
            if (timeStatus) {
                if (d.time_synced) {
                    timeStatus.innerText = 'Time: Synced';
                    timeStatus.style.color = 'var(--green)';
                } else {
                    timeStatus.innerText = 'Time: Not Synced';
                    timeStatus.style.color = 'var(--amber)';
                }
            }

            setTxt('uptime', fmtTime(d.uptime_s));
            document.getElementById('ver-label').innerText = 'Farm Controller ' + d.fw_ver;

            // Pre-fill settings (only when modal closed)
            if (!isModalOpen) {
                if (d.cfg_tHigh) document.getElementById('cfg_tHigh').value = d.cfg_tHigh;
                if (d.cfg_tMed)  document.getElementById('cfg_tMed').value  = d.cfg_tMed;
                if (d.cfg_hHigh) document.getElementById('cfg_hHigh').value = d.cfg_hHigh;
                if (d.cfg_hMed)  document.getElementById('cfg_hMed').value  = d.cfg_hMed;
            }

            // System reason
            setTxt('sys', d.sys_rsn);

            // Progress bar
            const pWrap = document.getElementById('prog-wrap');
            const pBar  = document.getElementById('prog-bar');
            if (d.sys_rsn.includes('MANUAL') && !d.sys_rsn.includes('Forever')) {
                if(pWrap.style.display !== 'block') pWrap.style.display = 'block';
                const m = d.sys_rsn.match(/(\d+)/);
                if (m) {
                    const pct = Math.min(100, (parseInt(m[1]) / Math.max(1, manualDurMin)) * 100);
                    pBar.style.width = pct + '%';
                }
            } else {
                if(pWrap.style.display !== 'none') pWrap.style.display = 'none';
                pBar.style.width = '0%';
            }

            // Sensor values
            if (!d.valid) {
                setTxt('t', '--.-°C');
                setTxt('h', '--.-%');
                setTxt('thi-val', '--.-');
            } else {
                setTxt('t', d.t.toFixed(1) + '°C');
                setTxt('h', d.h.toFixed(1) + '%');
                historyT.push(d.t); if (historyT.length > 20) historyT.shift();
                historyH.push(d.h); if (historyH.length > 20) historyH.shift();
                drawSparkline('line-t', historyT, (d.cfg_tHigh || 32) + 2, 22);
                drawSparkline('line-h', historyH, (d.cfg_hHigh || 90) + 5, 35);

                const thi = getTHI(d.t, d.h);
                setTxt('thi-val', thi.toFixed(1));
                const thiBar  = document.getElementById('thi-bar');
                if      (thi < 70) { thiBar.style.borderColor='var(--green)'; thiBar.style.background='rgba(16,185,129,0.12)'; setTxt('thi-text', 'Comfortable 🌿');  document.getElementById('thi-text').style.color='var(--green)'; }
                else if (thi < 75) { thiBar.style.borderColor='var(--amber)'; thiBar.style.background='rgba(245,158,11,0.12)'; setTxt('thi-text', 'Mild Stress 🌤️'); document.getElementById('thi-text').style.color='var(--amber)'; }
                else if (thi < 82) { thiBar.style.borderColor='#ea580c';      thiBar.style.background='rgba(234,88,12,0.12)';  setTxt('thi-text', 'Severe Stress 🔥'); document.getElementById('thi-text').style.color='#ea580c'; }
                else               { thiBar.style.borderColor='var(--red)';   thiBar.style.background='rgba(244,63,94,0.12)';  setTxt('thi-text', 'DANGER! 🚨');       document.getElementById('thi-text').style.color='var(--red)'; }
            }

            // guard d.valid ก่อนเช็ค d.t — กัน false-positive danger
            setClass('vb_t', (d.valid && d.t >= (d.cfg_tHigh || 32)) ? 'box danger' : 'box');
            setClass('vb_h', (d.valid && d.h >= (d.cfg_hHigh || 90)) ? 'box danger' : 'box');

            // Fan status (6 fans)
            if (d.fans) {
                d.fans.forEach(f => {
                    const id = 'f' + f.id;
                    setTxt(id+'s', f.on ? 'ON' : 'OFF');
                    setClass(id+'s', f.on ? 'tag on' : 'tag');
                    setTxt(id+'r', f.reason || '');
                    setClass(id+'r', (f.reason||'').includes('Running') ? 'fan-rsn run' : 'fan-rsn');
                });
            }
        })
        .catch(e => {
            // 503 busy หรือ network drop → แสดง status แทน crash
            setTxt('sys', '⚠️ Connection issue (' + e.message + ')');
        });
}

setInterval(up, 1000);
up();
</script>
</body>
</html>
)=====";

// ── SENSOR UTILITIES ──────────────────────────────────────
// คำนวณ THI (Temperature-Humidity Index) ดัชนีความเครียดเป็ด
// สูตร NRC (National Research Council) ใช้มาตรฐาน Poultry
float calcTHI(float t, float h) {
    return (1.8f * t + 32.0f) - ((0.55f - 0.0055f * h) * (1.8f * t - 58.0f));
}

// ระดับความเครียด (สำหรับ InfluxDB tag + Grafana label)
const char* thiLevel(float thi) {
    if (thi < 70.0f) return "Comfortable";
    if (thi < 75.0f) return "Mild Stress";
    if (thi < 82.0f) return "Severe Stress";
    return "DANGER";
}

// ── TASKS ──────────────────────────────────────────────────

void TaskSensor(void *p) {
    esp_task_wdt_add(NULL);
    sensor.begin();
    LOG_INFO("TaskSensor started");
    for (;;) {
        esp_task_wdt_reset();
        Event ev = {}; ev.timestamp = millis();
        float t = 0, h = 0; bool ok = false;
        
        // TODO: Future migration to polling multiple sensors (Slave ID 1, 2, 3) 
        // using a single RS485 bus. Currently polling only 1 configured sensor.
        for (int i = 0; i < 3; i++) {
            if (sensor.read(t, h)) {
                ok = true; break;
            }
            esp_task_wdt_reset();
            vTaskDelay(pdMS_TO_TICKS(500));
        }
        
        if (!ok) {
            ev.type = EV_SENSOR_FAIL;
            char msg[64];
            snprintf(msg, sizeof(msg), "RS485 SHT20 read failed (Error: 0x%02X)", sensor.lastError());
            LOG_WARN(msg);
        } else {
            ev.type = EV_SENSOR_DATA; ev.val1 = t; ev.val2 = h;
        }
        xQueueSend(eventBus, &ev, pdMS_TO_TICKS(50));
        
        int pollSecSnap = 5;
        if (xSemaphoreTake(coreMux, pdMS_TO_TICKS(50)) == pdTRUE) {
            pollSecSnap = cfg.pollSec;
            xSemaphoreGive(coreMux);
        }
        vTaskDelay(pdMS_TO_TICKS((uint32_t)pollSecSnap * 1000UL));
    }
}

void TaskCore(void *p) {
    esp_task_wdt_add(NULL);
    Event ev = {};
    core_state = STATE_WARMUP;
    uint32_t bootTime = millis();
    int      sfCount = 0;
    bool     manualMode = false, manualForever = false;
    uint32_t manualStart = 0, manualDurationMs = 0;
    LOG_INFO("TaskCore started — STATE_WARMUP");

    for (;;) {
        esp_task_wdt_reset();
        uint32_t now = millis();
        char logBuffer[96] = "";

        // ── Process incoming events ──────────────────────────
        if (xQueueReceive(eventBus, &ev, pdMS_TO_TICKS(500)) == pdPASS) {
            xSemaphoreTake(coreMux, portMAX_DELAY);
            switch (ev.type) {
                case EV_SENSOR_DATA:
                    core_temp = ev.val1; core_humi = ev.val2; sfCount = 0;
                    core_sensorValid = true;
                    core_lastSensorOkMs = now;
                    if (core_state == STATE_FAILSAFE) {
                        core_state = STATE_NORMAL;
                        buzzer.alarmSiren(false);
                        snprintf(logBuffer, sizeof(logBuffer),
                            "Recovered from FAILSAFE (T=%.1f H=%.1f)", core_temp, core_humi);
                    }
                    break;
                case EV_SENSOR_FAIL:
                    core_sensorValid = false;
                    if (++sfCount >= cfg.sfLimit && core_state != STATE_FAILSAFE) {
                        core_state = STATE_FAILSAFE;
                        buzzer.alarmSiren(true);
                        snprintf(logBuffer, sizeof(logBuffer),
                            "SENSOR FAILSAFE! sfCount=%d", sfCount);
                    }
                    break;
                case EV_MANUAL_START: {
                    manualMode = true;
                    uint32_t mins = (uint32_t)ev.val1;
                    if (mins == 0) {
                        manualForever = true; manualDurationMs = 0;
                        strlcpy(logBuffer, "Manual Mode: FOREVER", sizeof(logBuffer));
                    } else {
                        manualForever = false;
                        manualStart = now;
                        manualDurationMs = mins * 60000UL;
                        snprintf(logBuffer, sizeof(logBuffer), "Manual Mode: %lu min", mins);
                    }
                    break;
                }
                case EV_MANUAL_END:
                    manualMode = false;
                    strlcpy(logBuffer, "Manual Mode: ENDED → Auto", sizeof(logBuffer));
                    break;
                default: break;
            }
            xSemaphoreGive(coreMux);
        }
        if (logBuffer[0] != '\0') LOG_INFO(logBuffer);

        // ── Control logic ────────────────────────────────────
        char ctrlLog[96] = "";
        
        // Config snapshot
        struct {
            uint32_t startupDly, minRunMin, staggerSec, minOffMin;
            float tHigh, tMed, hHigh, hMed, hystT, hystH;
        } snap;
        
        xSemaphoreTake(coreMux, portMAX_DELAY);
        snap.startupDly = cfg.startupDly; snap.minRunMin = cfg.minRunMin;
        snap.staggerSec = cfg.staggerSec; snap.minOffMin = cfg.minOffMin;
        snap.tHigh = cfg.tHigh; snap.tMed = cfg.tMed;
        snap.hHigh = cfg.hHigh; snap.hMed = cfg.hMed; snap.hystT = cfg.hystT; snap.hystH = cfg.hystH;

        if (core_state == STATE_WARMUP) {
            if ((core_temp >= snap.tHigh) || (now - bootTime > snap.startupDly * 1000UL)) {
                core_state = STATE_NORMAL;
                strlcpy(core_sysReason, "Auto Mode", 64);
                strlcpy(ctrlLog, "Warmup complete → STATE_NORMAL", sizeof(ctrlLog));
            } else {
                uint32_t left = snap.startupDly - ((now - bootTime) / 1000);
                snprintf(core_sysReason, 64, "WARMUP (%lus left)", left);
            }
        }

        if (core_state == STATE_FAILSAFE) {
            strlcpy(core_sysReason, "FAILSAFE (All 6 Fans ON)", 64);
            forceAllFansOn("FAILSAFE forced ON");
            xSemaphoreGive(coreMux);
            if (ctrlLog[0] != '\0') LOG_INFO(ctrlLog);
            continue; // ข้ามการเรียก checkCooldowns ไปเลย!
            
        } else if (manualMode) {
            if (!manualForever && (uint32_t)(now - manualStart) >= manualDurationMs) {
                manualMode = false;
                strlcpy(core_sysReason, "Auto Mode", 64);
                strlcpy(ctrlLog, "Manual timer expired → Auto", sizeof(ctrlLog));
            } else {
                if (manualForever) {
                    strlcpy(core_sysReason, "MANUAL (Forever)", 64);
                } else {
                    uint32_t leftMs = manualDurationMs - (uint32_t)(now - manualStart);
                    snprintf(core_sysReason, 64, "MANUAL (%lu min left)", (leftMs + 59999) / 60000);
                }
                setAllFansTarget(true, "MANUAL Override");
            }

        } else if (core_state == STATE_NORMAL) {
            strlcpy(core_sysReason, "Auto Mode", 64);
            bool highLoad = (core_temp >= snap.tHigh) || (core_humi >= snap.hHigh);
            bool medLoad  = (core_temp >= snap.tMed)  || (core_humi >= snap.hMed);

            if      (highLoad) { setAllFansTarget(true, "AUTO HIGH"); }
            else if (medLoad)  { setOddFansTarget(true, "AUTO MED ODD"); setEvenFansTarget(false, "AUTO LOW"); }
            else if (core_temp < snap.tMed - snap.hystT && core_humi < snap.hMed - snap.hystH) {
                setAllFansTarget(false, "AUTO LOW");
            }
        }

        if (core_state != STATE_WARMUP) {
            for (int i = 0; i < FAN_COUNT; i++) {
                uint32_t stagger = (i == 0) ? 0 : snap.staggerSec * 1000UL;
                int prevIdx = -1;
                for (int j = i - 1; j >= 0; j--) {
                    if (fans[j].getTarget()) { prevIdx = j; break; }
                }
                bool prevOn = (prevIdx == -1) ? true : fans[prevIdx].isOn();
                uint32_t prevStart = (prevIdx == -1) ? 0 : fans[prevIdx].getStartAt();
                fans[i].checkCooldowns(now, snap.minRunMin * 60000UL,
                                       stagger, prevOn, prevStart, snap.minOffMin * 60000UL);
            }
        }
        xSemaphoreGive(coreMux);
        if (ctrlLog[0] != '\0') LOG_INFO(ctrlLog);
    }
}

// ── [D2] MQTT Exponential Backoff ──────────────────────────
// 5s → 10s → 20s → 40s → 60s (max) ต่อครั้งที่ connect ล้มเหลว
static uint32_t mqttBackoffMs  = 5000;
static uint32_t lastMqttTry    = 0;
static uint8_t  mqttFailCount  = 0;
const  uint32_t MQTT_BACKOFF_MAX = 60000UL;

void mqttReconnect() {
    if (millis() - lastMqttTry < mqttBackoffMs) return;
    lastMqttTry = millis();

    String mac = WiFi.macAddress(); mac.replace(":", "");
    char cid[32]; snprintf(cid, sizeof(cid), "DUCK-%s", mac.c_str());
    bool ok = mqtt.connect(cid, cfg.mqttUser[0] ? cfg.mqttUser : nullptr,
                               cfg.mqttPass[0] ? cfg.mqttPass : nullptr);
    if (ok) {
        char msg[80];
        snprintf(msg, sizeof(msg), "MQTT connected to %s:%d (backoff reset)", cfg.mqttServer, cfg.mqttPort);
        LOG_INFO(msg);
        mqttBackoffMs = 5000; mqttFailCount = 0;
    } else {
        mqttFailCount++;
        mqttBackoffMs = min((uint32_t)(5000UL << min(mqttFailCount, (uint8_t)4)), MQTT_BACKOFF_MAX);
        char msg[80];
        snprintf(msg, sizeof(msg), "MQTT connect failed (attempt %d, next retry in %lus)",
                 mqttFailCount, mqttBackoffMs / 1000);
        LOG_WARN(msg);
    }
}

void TaskNetwork(void *p) {
    esp_task_wdt_add(NULL);
    uint32_t lastPublish = 0;
    LOG_INFO("TaskNetwork started");

    for (;;) {
        esp_task_wdt_reset();

        // Snapshot shared state
        SystemState stateSnap; bool fansOn[FAN_COUNT]; int fansActiveCount = 0;
        float snapT, snapH; uint32_t nrSecSnap; bool sensorValidSnap;
        if (xSemaphoreTake(coreMux, pdMS_TO_TICKS(50)) == pdTRUE) {
            stateSnap = core_state;
            for (int i = 0; i < FAN_COUNT; i++) { fansOn[i] = fans[i].isOn(); if (fansOn[i]) fansActiveCount++; }
            snapT = core_temp; snapH = core_humi;
            nrSecSnap = cfg.nrSec; sensorValidSnap = core_sensorValid;
            xSemaphoreGive(coreMux);
        } else {
            vTaskDelay(pdMS_TO_TICKS(200)); continue;
        }

        // RGB LED status
        uint8_t r = 0, g = 0, b = 0;
        if      (WiFi.status() != WL_CONNECTED)   { r = 255; g = 100; }
        else if (stateSnap == STATE_FAILSAFE)      { r = 255; }
        else if (fansActiveCount >= 4)             { b = 255; }
        else if (fansActiveCount >= 1)             { b = 200; g = 80; }
        else                                       { g = 100; }
        rgb.setPixelColor(0, rgb.Color(r, g, b)); rgb.show();

        if (WiFi.status() == WL_CONNECTED) {
            // [D2] MQTT Exponential Backoff
            if (!mqtt.connected()) mqttReconnect();
            if ( mqtt.connected()) mqtt.loop();

            // ── Publish sensor data ─────────────────────────────────────
            // Payload ออกแบบให้รองรับทั้ง PostgreSQL และ InfluxDB ผ่าน Node-RED
            //
            // ─────────────────────────────────────────────────────────────
            // FIELD GUIDE สำหรับ Node-RED Flow:
            //
            // [Identifiers — ใช้เป็น Tag ใน InfluxDB / FK ใน PostgreSQL]
            //   device_id   : "DUCK-AABBCCDDEEFF"  (unique per board)
            //   fw_ver      : "v19.0.0"
            //
            // [Timestamp — สำคัญมากสำหรับ Time-Series DB]
            //   timestamp_unix : Unix epoch (seconds) จาก NTP
            //                    InfluxDB: ใช้เป็น _time field
            //                    PostgreSQL: INSERT INTO ... timestamp = to_timestamp(timestamp_unix)
            //
            // [Sensor Data — Fields ใน InfluxDB / Columns ใน PostgreSQL]
            //   temp_c      : อุณหภูมิ (°C)
            //   humi_pct    : ความชื้น (%)
            //   thi         : Temperature-Humidity Index (float, 2 ทศนิยม)
            //   thi_level   : "Comfortable" / "Mild Stress" / "Severe Stress" / "DANGER"
            //
            // [Fan Status]
            //   fan_count   : 6
            //   fan1_on ... fan6_on : true/false
            //   fans_active : 0-6 (จำนวนพัดลมที่เปิด — ใช้ plot กราฟ Grafana ได้เลย)
            //
            // [System Status]
            //   sys_mode    : "Auto Mode" / "MANUAL" / "FAILSAFE" / "WARMUP"
            //   failsafe    : true/false
            //   manual_mode : true/false
            //   sensor_ok   : true/false (false = RS485 SHT20 ขัดข้อง)
            //
            // [Device Health — ช่วย monitor บอร์ด]
            //   wifi_rssi   : dBm (signal strength)
            //   free_heap   : bytes RAM เหลือ (ถ้าลดลงเรื่อยๆ = memory leak)
            //   uptime_s    : วินาทีตั้งแต่บูต (ถ้าเป็น 0 บ่อย = crash loop)
            // ─────────────────────────────────────────────────────────────

            if (millis() - lastPublish > nrSecSnap * 1000UL) {
                lastPublish = millis();

                // คำนวณค่าที่ต้องใช้
                float thi        = calcTHI(snapT, snapH);
                bool  isFailsafe = (stateSnap == STATE_FAILSAFE);

                char sysReasonSnap[64];
                if (xSemaphoreTake(coreMux, pdMS_TO_TICKS(50)) == pdTRUE) {
                    strlcpy(sysReasonSnap, core_sysReason, sizeof(sysReasonSnap));
                    xSemaphoreGive(coreMux);
                } else {
                    strlcpy(sysReasonSnap, "Unknown", sizeof(sysReasonSnap));
                }
                
                bool isManual = (strstr(sysReasonSnap, "MANUAL") != nullptr);

                // ── Unix timestamp จาก NTP
                time_t nowUnix = time(nullptr);
                bool timeSynced = nowUnix > 1700000000;

                // ── Build JSON payload ──────────────────────────────────
                char jsonBuf[1536]; JsonDocument doc;

                // Identifiers (Tags)
                doc["device_id"]      = deviceId;
                doc["fw_ver"]         = FW_VERSION;

                // Timestamp
                doc["time_synced"]    = timeSynced;
                if (timeSynced) {
                    doc["timestamp_unix"] = (uint32_t)nowUnix;
                } else {
                    doc["timestamp_unix"] = 0;
                }
                doc["uptime_s"]       = millis() / 1000;

                // Sensor data
                doc["temp_c"]         = snapT;
                doc["humi_pct"]       = snapH;
                doc["thi"]            = thi;
                doc["thi_level"]      = thiLevel(thi);

                // Fan status (6 fans)
                doc["fan_count"]      = FAN_COUNT;
                for (int i = 0; i < FAN_COUNT; i++) {
                    char key[10]; snprintf(key, sizeof(key), "fan%d_on", i + 1);
                    doc[key] = fansOn[i];
                }
                doc["fans_active"]    = fansActiveCount;

                // System status
                doc["sys_mode"]       = sysReasonSnap;
                doc["failsafe"]       = isFailsafe;
                doc["manual_mode"]    = isManual;
                doc["sensor_ok"]      = sensorValidSnap;

                // Device health
                doc["wifi_rssi"]      = WiFi.RSSI();
                doc["free_heap"]      = (uint32_t)ESP.getFreeHeap();

                size_t n = serializeJson(doc, jsonBuf, sizeof(jsonBuf));
                if (n >= sizeof(jsonBuf)) {
                    LOG_WARN("JSON payload truncated");
                    continue;
                }

                // ── Publish: MQTT (primary) หรือ HTTP (fallback) ────────
                bool sent = false;
                if (mqtt.connected()) {
                    // MQTT: 1 topic รับทุก field → Node-RED ดึงไปใส่ทั้ง InfluxDB + PostgreSQL
                    sent = mqtt.publish("farm/sensor", jsonBuf);
                    if (!sent) {
                        LOG_WARN("MQTT publish failed, trying HTTP fallback");
                    }
                }
                
                if (!sent && strlen(cfg.nrUrl) > 0) {
                    // HTTP fallback: ส่งไป Node-RED HTTP-in endpoint
                    HTTPClient h;
                    h.begin(cfg.nrUrl);
                    h.setTimeout(1000);
                    h.addHeader("Content-Type", "application/json");
                    h.addHeader("X-Device-ID", deviceId);  // header เพิ่มให้ Node-RED กรองได้
                    int code = h.POST(jsonBuf);
                    if (code <= 0 || code >= 400) {
                        char msg[80]; snprintf(msg, sizeof(msg), "HTTP POST failed code=%d url=%s", code, cfg.nrUrl);
                        LOG_WARN(msg);
                    }
                    h.end();
                }
            }
        }
        vTaskDelay(pdMS_TO_TICKS(200));
    }
}

// ── SETUP ──────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    Serial.println("\n\n========================================");
    Serial.println("  AeroDuck Pro " FW_VERSION "  — ESP32-S3 N16R8");
    Serial.println("========================================");
    LittleFS.begin(true);

    // ── Device ID จาก Efuse MAC (Unique per board — ใช้เป็น Tag ใน InfluxDB / PK ใน PostgreSQL)
    // รองรับหลายโรงเรือน: burn firmware เดียวกัน deviceId แตกต่างกันอัตโนมัติตาม MAC
    // ใช้ ESP.getEfuseMac() — ไม่ต้อง include เพิ่ม ใช้ได้ทุก Arduino core version
    {
        uint64_t chipid = ESP.getEfuseMac();
        snprintf(deviceId, sizeof(deviceId), "DUCK-%04X%08X",
                 (uint16_t)(chipid >> 32), (uint32_t)chipid);
    }

    // OTA: ยืนยัน firmware ใหม่ (กัน rollback)
    esp_ota_img_states_t ota_state;
    const esp_partition_t *running = esp_ota_get_running_partition();
    if (esp_ota_get_state_partition(running, &ota_state) == ESP_OK &&
        ota_state == ESP_OTA_IMG_PENDING_VERIFY) {
        esp_ota_mark_app_valid_cancel_rollback();
        LOG_INFO("[OTA] New firmware verified & accepted");
    }

    char rsnMsg[80];
    snprintf(rsnMsg, sizeof(rsnMsg), "Boot: %s  reset=%d  fw=%s",
             deviceId, esp_reset_reason(), FW_VERSION);
    LOG_INFO(rsnMsg);

    // RTOS primitives
    coreMux  = xSemaphoreCreateMutex();
    logMux   = xSemaphoreCreateMutex();
    eventBus = xQueueCreate(32, sizeof(Event));
    if (!coreMux || !eventBus || !logMux) {
        LOG_ERROR("FATAL: RTOS object create failed — restarting");
        ESP.restart();
    }

    // [B1] WDT — trigger_panic=true ช่วย debug: โชว์ backtrace ใน Serial
    esp_task_wdt_config_t tw = {
        .timeout_ms     = 15000,
        .idle_core_mask = 0,
        .trigger_panic  = true   // [B1] crash + backtrace แทน silent reset
    };
    esp_task_wdt_init(&tw);
    esp_task_wdt_add(NULL);

    loadConfig();

    for (int i = 0; i < FAN_COUNT; i++) fans[i].init();
    buzzer.init(); buzzer.setEnabled(cfg.buzzerEn);
    rgb.begin(); rgb.setBrightness(40);

    // WiFi connect
    WiFi.setAutoReconnect(true);
    WiFi.persistent(false);
    WiFi.begin(cfg.ssid, cfg.wifiPass);
    {
        char msg[64]; snprintf(msg, sizeof(msg), "Connecting to WiFi: %s", cfg.ssid);
        LOG_INFO(msg);
    }
    uint32_t wStart = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - wStart < 12000) {
        esp_task_wdt_reset();
        vTaskDelay(pdMS_TO_TICKS(500));
    }
    if (WiFi.status() == WL_CONNECTED) {
        char msg[64]; snprintf(msg, sizeof(msg), "WiFi OK — IP: %s", WiFi.localIP().toString().c_str());
        LOG_INFO(msg);
    } else {
        LOG_WARN("WiFi failed → AP Mode (DuckFarm-Setup / 12345678)");
        WiFi.mode(WIFI_AP_STA);
        WiFi.softAP("DuckFarm-Setup", "12345678");
        dnsServer.start(53, "*", WiFi.softAPIP());
    }

    mqtt.setServer(cfg.mqttServer, cfg.mqttPort);
    mqtt.setBufferSize(2048);
    configTime(cfg.ntpOfs * 3600, 0, cfg.ntp1, cfg.ntp2, cfg.ntp3);

    // ── Web Routes ──────────────────────────────────────────

    server.on("/", HTTP_GET, [](AsyncWebServerRequest *r) {
        if (!r->authenticate(cfg.adminUser, cfg.adminPass)) return r->requestAuthentication();
        r->send(200, "text/html", HTML_UI);
    });

    // [FIX #2] /scan — Async WiFi Scan (กัน WDT reset)
    server.on("/scan", HTTP_GET, [](AsyncWebServerRequest *r) {
        if (!r->authenticate(cfg.adminUser, cfg.adminPass)) return r->requestAuthentication();
        int n = WiFi.scanComplete();
        if (n == WIFI_SCAN_FAILED) {
            WiFi.scanNetworks(true, false, false, 120);
            return r->send(202, "application/json", "[]");
        }
        if (n == WIFI_SCAN_RUNNING) {
            return r->send(202, "application/json", "[]");
        }
        // Scan complete → ส่งผลลัพธ์ด้วย ArduinoJson (กัน heap fragmentation + special chars)
        JsonDocument doc;
        JsonArray arr = doc.to<JsonArray>();
        for (int i = 0; i < n; i++) {
            JsonObject obj = arr.add<JsonObject>();
            obj["ssid"] = WiFi.SSID(i);
            obj["rssi"] = WiFi.RSSI(i);
        }
        WiFi.scanDelete();
        String json; serializeJson(doc, json);
        r->send(200, "application/json", json);
    });

    server.on("/setWifi", HTTP_POST, [](AsyncWebServerRequest *r) {
        if (!r->authenticate(cfg.adminUser, cfg.adminPass)) return r->requestAuthentication();
        if (r->hasParam("ssid",  true)) strlcpy(cfg.ssid,     r->getParam("ssid",  true)->value().c_str(), 33);
        if (r->hasParam("wpass", true)) strlcpy(cfg.wifiPass, r->getParam("wpass", true)->value().c_str(), 64);
        saveConfig();
        r->send(200, "text/plain", "WiFi Saved. Rebooting...");
        rebootPending = true;
    });

    // [FIX #4] /diag — Mutex timeout 100ms กันหน้าเว็บค้าง
    server.on("/diag", HTTP_GET, [](AsyncWebServerRequest *r) {
        if (!r->authenticate(cfg.adminUser, cfg.adminPass)) return r->requestAuthentication();
        if (xSemaphoreTake(coreMux, pdMS_TO_TICKS(100)) != pdTRUE) {
            return r->send(503, "text/plain", "System busy");
        }
        AsyncResponseStream *response = r->beginResponseStream("application/json");
        JsonDocument doc;
        doc["valid"]    = core_sensorValid;
        doc["last_ok"]  = core_lastSensorOkMs;
        doc["t"]        = core_temp;
        doc["h"]        = core_humi;
        doc["g1_st"]    = fans[0].isOn();
        doc["g1_rsn"]   = fans[0].getReason();
        doc["g2_st"]    = fans[1].isOn();
        doc["g2_rsn"]   = fans[1].getReason();
        doc["fan_count"]= FAN_COUNT;
        JsonArray fArr = doc["fans"].to<JsonArray>();
        for (int i = 0; i < FAN_COUNT; i++) {
            JsonObject fo = fArr.add<JsonObject>();
            fo["id"] = i + 1;
            fo["on"] = fans[i].isOn();
            fo["target"] = fans[i].getTarget();
            fo["reason"] = fans[i].getReason();
        }
        doc["sys_rsn"]  = core_sysReason;
        doc["wifi_rssi"]= WiFi.RSSI();
        doc["mqtt_conn"]= mqtt.connected();
        doc["uptime_s"] = millis() / 1000;
        
        time_t nowUnix = time(nullptr);
        bool timeSynced = nowUnix > 1700000000;
        doc["time_synced"] = timeSynced;
        doc["timestamp_unix"] = timeSynced ? (uint32_t)nowUnix : 0;
        doc["ntp1"] = cfg.ntp1;
        doc["ntp2"] = cfg.ntp2;
        doc["ntp3"] = cfg.ntp3;
        doc["timezone"] = cfg.ntpOfs;

        doc["sensor_type"] = sensor.name();
        doc["sensor_slave_id"] = cfg.rs485_slaveId;
        doc["sensor_baud"] = cfg.rs485_baud;
        doc["sensor_last_error"] = sensor.lastError();
        doc["sensor_valid"] = core_sensorValid;
        doc["cfg_tHigh"]= cfg.tHigh;
        doc["cfg_tMed"] = cfg.tMed;
        doc["cfg_hHigh"]= cfg.hHigh;
        doc["cfg_hMed"] = cfg.hMed;
        doc["fw_ver"]   = FW_VERSION;
        xSemaphoreGive(coreMux);
        serializeJson(doc, *response);
        r->send(response);
    });

    // [FIX #10 + A2] /setConfig — validate threshold + lock mutex กัน data race
    server.on("/setConfig", HTTP_POST, [](AsyncWebServerRequest *r) {
        if (!r->authenticate(cfg.adminUser, cfg.adminPass)) return r->requestAuthentication();
        float newTHigh = cfg.tHigh, newTMed = cfg.tMed;
        float newHHigh = cfg.hHigh, newHMed = cfg.hMed;
        if (r->hasParam("tHigh", true)) newTHigh = r->getParam("tHigh", true)->value().toFloat();
        if (r->hasParam("tMed",  true)) newTMed  = r->getParam("tMed",  true)->value().toFloat();
        if (r->hasParam("hHigh", true)) newHHigh = r->getParam("hHigh", true)->value().toFloat();
        if (r->hasParam("hMed",  true)) newHMed  = r->getParam("hMed",  true)->value().toFloat();

        // [FIX #10] Validate — ค่าต้องสัมพันธ์กัน
        if (newTMed >= newTHigh)
            return r->send(400, "text/plain", "tMed ต้องน้อยกว่า tHigh (เช่น tMed=29 tHigh=32)");
        if (newHMed >= newHHigh)
            return r->send(400, "text/plain", "hMed ต้องน้อยกว่า hHigh (เช่น hMed=75 hHigh=85)");
        if (newTHigh < 20 || newTHigh > 45)
            return r->send(400, "text/plain", "tHigh ต้องอยู่ระหว่าง 20–45°C");
        if (newHHigh < 40 || newHHigh > 99)
            return r->send(400, "text/plain", "hHigh ต้องอยู่ระหว่าง 40–99%");

        // [A2] Lock coreMux ก่อนเขียน cfg — กัน data race กับ TaskCore
        if (xSemaphoreTake(coreMux, pdMS_TO_TICKS(200)) != pdTRUE)
            return r->send(503, "text/plain", "System busy, try again");
        cfg.tHigh = newTHigh; cfg.tMed = newTMed;
        cfg.hHigh = newHHigh; cfg.hMed = newHMed;
        xSemaphoreGive(coreMux);

        saveConfig();
        char msg[96];
        snprintf(msg, sizeof(msg), "Config Saved! (tMed=%.1f tHigh=%.1f hMed=%.1f hHigh=%.1f)",
                 cfg.tMed, cfg.tHigh, cfg.hMed, cfg.hHigh);
        LOG_INFO(msg);
        r->send(200, "text/plain", "Config Saved!");
    });

    // [FIX #1] /cmd — HTTP_POST ให้ตรงกับ fetch() ฝั่ง JS
    server.on("/cmd", HTTP_POST, [](AsyncWebServerRequest *r) {
        if (!r->authenticate(cfg.adminUser, cfg.adminPass)) return r->requestAuthentication();
        if (r->hasParam("man", true)) {
            Event ev = {}; ev.timestamp = millis(); ev.val1 = 0;
            String manVal = r->getParam("man", true)->value();
            ev.type = (manVal == "1") ? EV_MANUAL_START : EV_MANUAL_END;
            
            if (ev.type == EV_MANUAL_START) {
                if (!r->hasParam("dur", true)) {
                    return r->send(400, "text/plain", "dur required (0 = forever, max 43200)");
                }
            }
            
            if (r->hasParam("dur", true)) {
                String durStr = r->getParam("dur", true)->value();
                for (size_t i = 0; i < durStr.length(); i++) {
                    if (!isDigit(durStr[i]))
                        return r->send(400, "text/plain", "Duration must be integer");
                }
                uint32_t d = (uint32_t)durStr.toInt();
                // [FIX #5] ลบ d < 0 ออก (uint32_t ไม่มีทางเป็น negative)
                if (d > 43200)
                    return r->send(400, "text/plain", "Duration max 43200 min");
                ev.val1 = d;
            }
            if (xQueueSend(eventBus, &ev, pdMS_TO_TICKS(100)) != pdPASS)
                return r->send(503, "text/plain", "Event queue full");
            {
                char msg[64];
                snprintf(msg, sizeof(msg), "CMD: man=%s dur=%.0f", manVal.c_str(), ev.val1);
                LOG_INFO(msg);
            }
        }
        r->send(200, "text/plain", "Command Accepted");
    });

    server.on("/reboot", HTTP_GET, [](AsyncWebServerRequest *r) {
        if (!r->authenticate(cfg.adminUser, cfg.adminPass)) return r->requestAuthentication();
        LOG_INFO("Reboot requested via web");
        r->send(200, "text/plain", "Rebooting...");
        rebootPending = true;
    });

    // /log — ดู log ผ่านเว็บได้เลย (debug ง่าย)
    server.on("/log", HTTP_GET, [](AsyncWebServerRequest *r) {
        if (!r->authenticate(cfg.adminUser, cfg.adminPass)) return r->requestAuthentication();
        if (LittleFS.exists("/sys.log")) {
            r->send(LittleFS, "/sys.log", "text/plain");
        } else {
            r->send(200, "text/plain", "(no log yet)");
        }
    });

    // /sysinfo — ข้อมูลระบบ JSON
    server.on("/sysinfo", HTTP_GET, [](AsyncWebServerRequest *r) {
        if (!r->authenticate(cfg.adminUser, cfg.adminPass)) return r->requestAuthentication();
        AsyncResponseStream *response = r->beginResponseStream("application/json");
        JsonDocument doc;
        doc["fw"]         = FW_VERSION;
        doc["chip"]       = ESP.getChipModel();
        doc["flash_mb"]   = ESP.getFlashChipSize() / (1024*1024);
        doc["free_heap"]  = ESP.getFreeHeap();
        doc["min_heap"]   = ESP.getMinFreeHeap();
        doc["uptime_s"]   = millis() / 1000;
        doc["reset_rsn"]  = esp_reset_reason();
        doc["ip"]         = WiFi.localIP().toString();
        doc["mac"]        = WiFi.macAddress();
        doc["ssid"]       = WiFi.SSID();
        doc["rssi"]       = WiFi.RSSI();
        serializeJson(doc, *response);
        r->send(response);
    });

    ElegantOTA.setAuth(cfg.adminUser, cfg.adminPass);
    ElegantOTA.begin(&server);
    server.begin();
    LOG_INFO("Web server started on port 80");

    // ── Launch Tasks ────────────────────────────────────────
    // [C2] TaskNetwork stack เพิ่มเป็น 12288 bytes (กัน HTTPClient stack overflow)
    xTaskCreatePinnedToCore(TaskSensor,  "Sensor",  4096,  NULL, 3, NULL, 1);
    xTaskCreatePinnedToCore(TaskCore,    "Core",    8192,  NULL, 2, NULL, 1);
    xTaskCreatePinnedToCore(TaskNetwork, "Network", 12288, NULL, 1, NULL, 0);  // [C2]
    xTaskCreatePinnedToCore([](void*) {
        esp_task_wdt_add(NULL);
        for (;;) { esp_task_wdt_reset(); buzzer.loop(); }
    }, "Buzzer", 2048, NULL, 1, NULL, 1);

    LOG_INFO("All tasks launched — " FW_VERSION " ready");
    Serial.println("========================================\n");
}

void loop() {
    dnsServer.processNextRequest();
    ElegantOTA.loop();
    if (rebootPending) {
        LOG_INFO("Rebooting...");
        vTaskDelay(pdMS_TO_TICKS(500));
        ESP.restart();
    }
    esp_task_wdt_reset();
    vTaskDelay(pdMS_TO_TICKS(100));
}
