import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'

function seeded(seed: number) { let s = seed; return () => { s = (s*9301+49297)%233280; return s/233280 } }
function gen(seed: number, base: number, amp: number, noise: number, points = 96) { const rnd = seeded(seed); const out: {t:string;v:number}[] = []; const now = Date.now(); for (let i = points-1; i >= 0; i--) { const ts = new Date(now - i*15*60000); const hour = ts.getHours()+ts.getMinutes()/60; const daily = Math.sin(((hour-6)/24)*Math.PI*2)*amp; const jitter = (rnd()-0.5)*noise*2; out.push({ t: ts.toISOString(), v: Number(Math.max(0, base+daily+jitter).toFixed(2)) }) } return out }
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (req: NextRequest) => {
  const kind = new URL(req.url).searchParams.get('kind') || 'energy'
  let series: Record<string,{t:string;v:number}[]> = {}; let kpis: Record<string,number> = {}
  switch (kind) {
    case 'energy': series = { consumption: gen(11,320,110,18), generation: gen(12,90,70,10), solar: gen(13,40,60,6), grid: gen(14,250,80,14) }; kpis = { totalKwh: 7684, peakKw: 488, costToday: 3842, carbonKg: 3120, powerFactor: 0.92, loadFactor: 0.78 }; break
    case 'water': series = { inflow: gen(21,180,60,12), outflow: gen(22,165,55,10), ph: gen(23,7.1,0.4,0.05), turbidity: gen(24,2.1,1.2,0.3), chlorine: gen(25,1.2,0.3,0.05) }; kpis = { totalM3: 4320, phAvg: 7.1, turbidityAvg: 2.1, chlorineAvg: 1.2, uptimePct: 99.6 }; break
    case 'gas': series = { flow: gen(31,42,16,3), pressure: gen(32,4.2,0.6,0.1), methane: gen(33,96.4,1.2,0.2) }; kpis = { totalM3: 1284, pressureAvg: 4.2, methanePct: 96.4, leakAlerts: 0 }; break
    case 'solar': series = { yield: gen(41,0,78,5), irradiance: gen(42,0,780,40), inverter1: gen(43,0,22,2), inverter2: gen(44,0,24,2), inverter3: gen(45,0,20,2) }; for (const k of Object.keys(series)) series[k] = series[k].map(p => { const h = new Date(p.t).getHours(); return h<6||h>18 ? { ...p, v: 0 } : p }); kpis = { totalKwh: 3820, peakKw: 142, performanceRatio: 0.91, co2Avoided: 1840 }; break
    case 'environment': series = { temperature: gen(51,29,6,0.8), humidity: gen(52,68,14,2), co2: gen(53,760,380,30), pm25: gen(54,28,18,3), noise: gen(55,58,12,2) }; kpis = { tempAvg: 29, humidityAvg: 68, co2Avg: 760, pm25Avg: 28, noiseAvg: 58, aqi: 72 }; break
    case 'machine': series = { oee: gen(61,78,8,2), availability: gen(62,88,5,1.5), performance: gen(63,84,7,2), quality: gen(64,95,3,0.8), throughput: gen(65,420,90,12) }; kpis = { oeeAvg: 78, availabilityAvg: 88, performanceAvg: 84, qualityAvg: 95, throughputAvg: 420, downtimeMin: 96 }; break
    case 'production': series = { units: gen(71,420,90,14), defects: gen(72,8,5,1.5), scrap: gen(73,4,3,0.8) }; kpis = { totalUnits: 9840, goodUnits: 9420, defectRate: 4.2, scrapRate: 2.1, downtimeMin: 96 }; break
    default: series = { value: gen(99,50,20,3) }
  }
  return NextResponse.json({ kind, series, kpis })
}))
