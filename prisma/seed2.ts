// IndOS seed part 2 — SCADA, OEE, Recipes/Batches, Inventory, Webhooks
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding IndOS part 2 (SCADA/OEE/Recipes/Inventory/Webhooks)...')

  // ── SCADA stations + tags ──
  const st1 = await db.scadaStation.create({ data: { name: 'Modbus PLC Bank A', protocol: 'modbus-tcp', endpoint: '10.20.0.50:502', scanRateMs: 1000, enabled: true, status: 'online' } })
  const st2 = await db.scadaStation.create({ data: { name: 'OPC-UA Line A1', protocol: 'opc-ua', endpoint: 'opc.tcp://10.20.0.60:4840', scanRateMs: 500, enabled: true, status: 'online' } })
  const st3 = await db.scadaStation.create({ data: { name: 'BACnet HVAC', protocol: 'bacnet', endpoint: '10.20.0.70:47808', scanRateMs: 2000, enabled: true, status: 'online' } })
  const st4 = await db.scadaStation.create({ data: { name: 'Ethernet/IP Press 02', protocol: 'ethernet-ip', endpoint: '10.20.0.80:44818', scanRateMs: 1000, enabled: true, status: 'fault' } })

  const tagDefs: [string, string, string, string, number, string?][] = [
    // stationId, name, address, dataType, value, unit
    [st1.id, 'Tank_Level_Main', '40001', 'float', 72.4, '%'],
    [st1.id, 'Pump_Pressure_In', '40003', 'float', 4.2, 'bar'],
    [st1.id, 'Pump_RPM', '40005', 'int32', 1820, 'rpm'],
    [st1.id, 'Valve_State', '40010', 'bool', 1, ''],
    [st1.id, 'Flow_Rate', '40012', 'float', 318, 'L/min'],
    [st2.id, 'Conveyor_Speed', 'ns=2;s=Line1.ConvSpeed', 'float', 1.2, 'm/s'],
    [st2.id, 'PickPlace_Cycle', 'ns=2;s=Line1.PPCount', 'int32', 4821, 'cycles'],
    [st2.id, 'Oven_Temp_Zone1', 'ns=2;s=Line1.OvenT1', 'float', 248, '°C'],
    [st2.id, 'Oven_Temp_Zone2', 'ns=2;s=Line1.OvenT2', 'float', 252, '°C'],
    [st2.id, 'AOI_Reject_Count', 'ns=2;s=Line1.AOIReject', 'int32', 14, 'pcs'],
    [st3.id, 'HVAC_Setpoint', 'AV:1', 'float', 24, '°C'],
    [st3.id, 'HVAC_Actual', 'AV:2', 'float', 24.6, '°C'],
    [st3.id, 'HVAC_Fan_Speed', 'AV:3', 'float', 68, '%'],
    [st4.id, 'Press_Tonnage', '@0/1/1', 'float', 0, 't'],
    [st4.id, 'Press_Stroke_Count', '@0/1/2', 'int32', 0, 'strokes'],
  ]
  for (const [stationId, name, address, dataType, value, unit] of tagDefs) {
    await db.scadaTag.create({ data: { stationId, name, address, dataType, value: Number(value), unit, quality: stationId === st4.id ? 'bad' : 'good', ts: new Date() } })
  }

  // ── OEE records (last 7 days, 3 machines) ──
  const machines = ['CNC Mill 01 · A1', 'Pick & Place 01 · A1', 'Reflow Oven · A1', 'Press 02 · A2', 'AOI Inspector · A3']
  const now = new Date()
  for (let d = 6; d >= 0; d--) {
    for (const m of machines) {
      for (const shift of ['day', 'night']) {
        const av = 78 + Math.random() * 16
        const pe = 76 + Math.random() * 18
        const qu = 92 + Math.random() * 7
        const oee = (av * pe * qu) / 10000
        const total = 400 + Math.floor(Math.random() * 200)
        const scrap = Math.floor(total * (100 - qu) / 100)
        await db.oeeRecord.create({
          data: {
            machineName: m,
            lineName: m.includes('A3') ? 'Line A3' : m.includes('A2') ? 'Line A2' : 'Line A1',
            shift,
            date: new Date(now.getTime() - d * 86400000),
            availability: Number(av.toFixed(1)),
            performance: Number(pe.toFixed(1)),
            quality: Number(qu.toFixed(1)),
            oee: Number(oee.toFixed(1)),
            downtimeMin: Math.floor(Math.random() * 60),
            goodUnits: total - scrap,
            totalUnits: total,
            scrapUnits: scrap,
          },
        })
      }
    }
  }

  // ── Recipes & Batches ──
  const recipes = await db.recipe.createMany({
    data: [
      { name: 'PCB Assembly Rev C', code: 'RC-PCB-C', product: 'Control Board v3', version: '2.1', status: 'active', yield: 480, unit: 'boards', steps: 12, cycleTimeMin: 38 },
      { name: 'Aluminum Housing', code: 'RC-AL-HS', product: 'Enclosure A', version: '1.4', status: 'active', yield: 320, unit: 'units', steps: 8, cycleTimeMin: 22 },
      { name: 'Solar Cell String', code: 'RC-PV-STR', product: 'PV Module 450W', version: '3.0', status: 'active', yield: 240, unit: 'strings', steps: 6, cycleTimeMin: 15 },
      { name: 'Battery Pack 48V', code: 'RC-BAT-48', product: 'LiFePO4 48V/100Ah', version: '1.0', status: 'approved', yield: 60, unit: 'packs', steps: 15, cycleTimeMin: 65 },
      { name: 'Sensor Module v2', code: 'RC-SEN-V2', product: 'Env Sensor Pro', version: '2.0', status: 'active', yield: 600, unit: 'units', steps: 9, cycleTimeMin: 28 },
      { name: 'Cable Harness A', code: 'RC-CBL-A', product: 'Wiring Harness', version: '1.2', status: 'retired', yield: 800, unit: 'units', steps: 5, cycleTimeMin: 12 },
    ],
  })
  const recipeRows = await db.recipe.findMany()
  const statuses = ['planned', 'inprogress', 'completed', 'completed', 'quarantined', 'scrapped']
  const operators = ['Lin Wang', 'Priya Nair', 'Marcus Reed', 'Diego Alvarez']
  for (let i = 0; i < 18; i++) {
    const r = recipeRows[i % recipeRows.length]
    const st = statuses[i % statuses.length]
    const qty = 200 + Math.floor(Math.random() * 300)
    const scrap = st === 'completed' ? Math.floor(qty * 0.04) : 0
    const start = new Date(now.getTime() - (i + 1) * 3600000 * 6)
    await db.batch.create({
      data: {
        batchNo: `B-${new Date().getFullYear()}-${String(1042 + i).padStart(4, '0')}`,
        recipeId: r.id,
        status: st,
        quantity: qty,
        goodQty: st === 'completed' ? qty - scrap : 0,
        scrapQty: scrap,
        operator: operators[i % operators.length],
        machineName: machines[i % machines.length],
        startTime: st === 'planned' ? null : start,
        endTime: st === 'completed' || st === 'scrapped' || st === 'quarantined' ? new Date(start.getTime() + r.cycleTimeMin * 60000) : null,
      },
    })
  }

  // ── Inventory ──
  await db.inventoryItem.createMany({
    data: [
      { sku: 'RAW-AL-6061', name: 'Aluminum 6061 Sheet 2mm', category: 'raw', unit: 'sheets', quantity: 480, reorderLevel: 200, location: 'WH-A / R3', unitCost: 28.5, supplier: 'Thai Metal Co.' },
      { sku: 'RAW-FR4-1.6', name: 'FR4 PCB Blank 1.6mm', category: 'raw', unit: 'pcs', quantity: 1240, reorderLevel: 500, location: 'WH-A / R1', unitCost: 4.2, supplier: 'PCB Supply Ltd' },
      { sku: 'RAW-CU-WIRE', name: 'Copper Wire 0.8mm', category: 'raw', unit: 'kg', quantity: 86, reorderLevel: 120, location: 'WH-A / R2', unitCost: 9.8, supplier: 'WireWorks' },
      { sku: 'COMP-ESP32', name: 'ESP32-WROOM-32 Module', category: 'raw', unit: 'pcs', quantity: 320, reorderLevel: 150, location: 'WH-B / E1', unitCost: 3.4, supplier: 'Espressif' },
      { sku: 'COMP-RS485', name: 'MAX485 RS485 Transceiver', category: 'raw', unit: 'pcs', quantity: 64, reorderLevel: 100, location: 'WH-B / E2', unitCost: 0.45, supplier: 'Mouser' },
      { sku: 'WIP-PCB-A1', name: 'PCB Assy A1 (WIP)', category: 'wip', unit: 'pcs', quantity: 38, reorderLevel: 0, location: 'Line A1', unitCost: 42, supplier: null },
      { sku: 'WIP-AL-HS', name: 'Housing Assy (WIP)', category: 'wip', unit: 'pcs', quantity: 22, reorderLevel: 0, location: 'Line A2', unitCost: 18, supplier: null },
      { sku: 'FIN-CB-V3', name: 'Control Board v3 (Finished)', category: 'finished', unit: 'pcs', quantity: 1840, reorderLevel: 400, location: 'WH-C / F1', unitCost: 86, supplier: null },
      { sku: 'FIN-PV-450', name: 'PV Module 450W (Finished)', category: 'finished', unit: 'pcs', quantity: 920, reorderLevel: 200, location: 'WH-C / F2', unitCost: 64, supplier: null },
      { sku: 'SPARE-BELT-A1', name: 'Conveyor Belt A1', category: 'spare', unit: 'pcs', quantity: 3, reorderLevel: 4, location: 'WH-Maint / S1', unitCost: 120, supplier: 'BeltPro' },
      { sku: 'SPARE-HEATER-RF', name: 'Reflow Heater Element', category: 'spare', unit: 'pcs', quantity: 2, reorderLevel: 3, location: 'WH-Maint / S2', unitCost: 340, supplier: 'HeatTech' },
      { sku: 'CONS-SOLDER', name: 'Solder Paste SAC305', category: 'consumable', unit: 'jars', quantity: 14, reorderLevel: 8, location: 'WH-A / C1', unitCost: 58, supplier: 'SolderCo' },
      { sku: 'CONS-FLUX', name: 'Flux Pen', category: 'consumable', unit: 'pcs', quantity: 42, reorderLevel: 20, location: 'WH-A / C2', unitCost: 4.2, supplier: 'SolderCo' },
    ],
  })

  // ── Webhooks ──
  await db.webhook.createMany({
    data: [
      { name: 'Slack #alarms', url: 'https://hooks.slack.com/services/T0/B0/xxx', event: 'alarm.created', enabled: true, lastStatus: '200', lastFired: new Date(Date.now() - 1800000), deliveries: 1284, failures: 3 },
      { name: 'ERP Sync — MES', url: 'https://erp.acme.com/api/indos/events', event: 'workorder.created', enabled: true, lastStatus: '200', lastFired: new Date(Date.now() - 7200000), deliveries: 412, failures: 0 },
      { name: 'Home Assistant', url: 'http://homeassistant.local:8123/api/webhook/indos', event: 'telemetry.threshold', enabled: true, lastStatus: 'timeout', lastFired: new Date(Date.now() - 600000), deliveries: 88, failures: 12 },
      { name: 'n8n OTA Workflow', url: 'http://n8n.local:5678/webhook/ota-done', event: 'ota.completed', enabled: true, lastStatus: '200', lastFired: new Date(Date.now() - 86400000), deliveries: 14, failures: 1 },
      { name: 'PagerDuty — Critical', url: 'https://events.pagerduty.com/v2/enqueue', event: 'alarm.created', enabled: false, lastStatus: null, lastFired: null, deliveries: 0, failures: 0 },
      { name: 'Backup trigger', url: 'http://backup.local/trigger', event: 'device.offline', enabled: true, lastStatus: '500', lastFired: new Date(Date.now() - 3600000), deliveries: 32, failures: 4 },
    ],
  })

  console.log('✅ IndOS seed part 2 complete.')
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
