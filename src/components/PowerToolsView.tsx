import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRightLeft,
  BookMarked,
  Calculator,
  Cpu,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Zap,
} from 'lucide-react';
import { bi } from '../i18n/translations';
import { LanguageMode } from '../types/study';
import { CircuitDiagrams } from './CircuitDiagrams';

interface PowerToolsViewProps {
  language: LanguageMode;
}

type ToolTab = 'ohm' | 'power' | 'energy' | 'resistors' | 'formulas' | 'diagrams';

const FORMULA_LIBRARY = [
  { cat: 'Electrical', name: "Ohm's Law", formula: 'V = I × R  |  I = V / R  |  R = V / I', note: 'V in Volts, I in Amperes, R in Ohms' },
  { cat: 'Electrical', name: 'DC Electrical Power', formula: 'P = V × I = I²R = V² / R', note: 'Power in Watts (W)' },
  { cat: 'AC Power', name: '1-Phase AC Active Power', formula: 'P = V × I × cos(φ)', note: 'cos(φ) = Power Factor (0 to 1)' },
  { cat: 'AC Power', name: '3-Phase AC Active Power', formula: 'P = √3 × V_L × I_L × cos(φ)', note: 'Line Voltage & Line Current' },
  { cat: 'AC Power', name: 'Apparent & Reactive Power', formula: 'S = √(P² + Q²)  |  Q = V_L × I_L × √3 × sin(φ)', note: 'S in VA/kVA, Q in VAR/kVAR' },
  { cat: 'Transformer', name: 'Transformer Turn Ratio', formula: 'V₁ / V₂ = N₁ / N₂ = I₂ / I₁', note: 'Ideal single-phase transformer relation' },
  { cat: 'Transformer', name: 'Induced EMF Equation', formula: 'E = 4.44 × f × N × Φ_m', note: 'f = Frequency (50 Hz in BD), Φ_m in Weber' },
  { cat: 'AC Machines', name: 'Synchronous Speed', formula: 'N_s = (120 × f) / P', note: 'f in Hz, P = Number of Poles, N_s in RPM' },
  { cat: 'AC Machines', name: 'Induction Motor Slip', formula: 's = (N_s - N_r) / N_s', note: 'Usually 2% to 6% at full load' },
  { cat: 'Thermodynamics', name: 'Carnot Thermal Efficiency', formula: 'η = 1 - (T_low / T_high)', note: 'Temperatures must be in Kelvin (K = °C + 273.15)' },
  { cat: 'IC Engine', name: 'Brake Power & Indicated Power', formula: 'BP = (2π × N × T) / 60  |  η_mech = BP / IP', note: 'N in RPM, T in N·m, Power in Watts' },
  { cat: 'Power Plant', name: 'Load Factor & Demand Factor', formula: 'LF = Average Load / Max Demand', note: 'Higher Load Factor lowers per-unit generation cost' },
];

export const PowerToolsView: React.FC<PowerToolsViewProps> = ({ language }) => {
  const [activeTab, setActiveTab] = useState<ToolTab>('ohm');

  // 1. Ohm's Law Solver
  const [ohmSolveFor, setOhmSolveFor] = useState<'V' | 'I' | 'R'>('I');
  const [ohmV, setOhmV] = useState('220');
  const [ohmI, setOhmI] = useState('5');
  const [ohmR, setOhmR] = useState('44');

  const ohmResult = useMemo(() => {
    const v = parseFloat(ohmV);
    const i = parseFloat(ohmI);
    const r = parseFloat(ohmR);
    if (ohmSolveFor === 'V' && Number.isFinite(i) && Number.isFinite(r)) {
      const calcV = i * r;
      return { V: calcV, I: i, R: r, P: calcV * i };
    }
    if (ohmSolveFor === 'I' && Number.isFinite(v) && Number.isFinite(r) && r > 0) {
      const calcI = v / r;
      return { V: v, I: calcI, R: r, P: v * calcI };
    }
    if (ohmSolveFor === 'R' && Number.isFinite(v) && Number.isFinite(i) && i > 0) {
      const calcR = v / i;
      return { V: v, I: i, R: calcR, P: v * i };
    }
    return null;
  }, [ohmSolveFor, ohmV, ohmI, ohmR]);

  // 2. Power Calculator (DC / 1-Phase / 3-Phase)
  const [powerSystem, setPowerSystem] = useState<'dc' | '1phase' | '3phase'>('3phase');
  const [pwrVoltage, setPwrVoltage] = useState('400');
  const [pwrCurrent, setPwrCurrent] = useState('15');
  const [pwrPf, setPwrPf] = useState('0.85');

  const powerResult = useMemo(() => {
    const v = Math.max(0, parseFloat(pwrVoltage) || 0);
    const i = Math.max(0, parseFloat(pwrCurrent) || 0);
    const pf = Math.min(1, Math.max(0, parseFloat(pwrPf) || 0));
    const sinPhi = Math.sqrt(Math.max(0, 1 - pf * pf));

    if (powerSystem === 'dc') {
      const watts = v * i;
      return { pWatts: watts, sVa: watts, qVar: 0 };
    }
    if (powerSystem === '1phase') {
      const s = v * i;
      return { pWatts: s * pf, sVa: s, qVar: s * sinPhi };
    }
    const s = Math.sqrt(3) * v * i;
    return { pWatts: s * pf, sVa: s, qVar: s * sinPhi };
  }, [powerSystem, pwrVoltage, pwrCurrent, pwrPf]);

  // 3. Energy & Electricity Bill Calculator
  const [wattage, setWattage] = useState('1500');
  const [quantity, setQuantity] = useState('2');
  const [hoursPerDay, setHoursPerDay] = useState('6');
  const [daysCount, setDaysCount] = useState('30');
  const [tariffBdt, setTariffBdt] = useState('8.5');

  const energyResult = useMemo(() => {
    const w = Math.max(0, parseFloat(wattage) || 0);
    const q = Math.max(0, parseFloat(quantity) || 0);
    const h = Math.max(0, parseFloat(hoursPerDay) || 0);
    const d = Math.max(0, parseFloat(daysCount) || 0);
    const rate = Math.max(0, parseFloat(tariffBdt) || 0);

    const dailyKwh = (w * q * h) / 1000;
    const totalKwh = dailyKwh * d;
    const totalCost = totalKwh * rate;
    return { dailyKwh, totalKwh, totalCost };
  }, [wattage, quantity, hoursPerDay, daysCount, tariffBdt]);

  // 4. Series & Parallel Resistance Calculator
  const [resistors, setResistors] = useState<string[]>(['10', '22', '47']);
  const [resAppliedV, setResAppliedV] = useState('24');

  const resResult = useMemo(() => {
    const vals = resistors.map((v) => parseFloat(v)).filter((n) => Number.isFinite(n) && n > 0);
    if (vals.length === 0) return null;
    const series = vals.reduce((a, b) => a + b, 0);
    const invSum = vals.reduce((a, b) => a + 1 / b, 0);
    const parallel = invSum > 0 ? 1 / invSum : 0;
    const v = Math.max(0, parseFloat(resAppliedV) || 0);
    return {
      count: vals.length,
      series,
      parallel,
      seriesCurrent: series > 0 ? v / series : 0,
      parallelCurrent: parallel > 0 ? v / parallel : 0,
    };
  }, [resistors, resAppliedV]);

  // 5. Formula Search & Unit Converter
  const [formulaQuery, setFormulaQuery] = useState('');
  const [convType, setConvType] = useState<'power' | 'pressure' | 'temp'>('power');
  const [convInput, setConvInput] = useState('10');

  const filteredFormulas = useMemo(() => {
    const q = formulaQuery.trim().toLowerCase();
    if (!q) return FORMULA_LIBRARY;
    return FORMULA_LIBRARY.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.cat.toLowerCase().includes(q) ||
        f.formula.toLowerCase().includes(q)
    );
  }, [formulaQuery]);

  const conversionSummary = useMemo(() => {
    const n = parseFloat(convInput);
    if (!Number.isFinite(n)) return [];
    if (convType === 'power') {
      return [
        { label: `${n} kW → Mechanical HP`, val: `${(n / 0.7457).toFixed(3)} HP` },
        { label: `${n} HP → Kilowatts`, val: `${(n * 0.7457).toFixed(3)} kW` },
        { label: `${n} kW → Watts`, val: `${(n * 1000).toFixed(0)} W` },
      ];
    }
    if (convType === 'pressure') {
      return [
        { label: `${n} Bar → PSI`, val: `${(n * 14.5038).toFixed(2)} psi` },
        { label: `${n} Bar → kPa`, val: `${(n * 100).toFixed(1)} kPa` },
        { label: `${n} PSI → Bar`, val: `${(n / 14.5038).toFixed(3)} bar` },
      ];
    }
    return [
      { label: `${n} °C → Fahrenheit`, val: `${((n * 9) / 5 + 32).toFixed(2)} °F` },
      { label: `${n} °C → Kelvin`, val: `${(n + 273.15).toFixed(2)} K` },
      { label: `${n} °F → Celsius`, val: `${(((n - 32) * 5) / 9).toFixed(2)} °C` },
    ];
  }, [convType, convInput]);

  const TABS: { id: ToolTab; labelBn: string; labelEn: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'ohm', labelBn: 'ওহমের সূত্র (V-I-R)', labelEn: "Ohm's Law", icon: Zap },
    { id: 'power', labelBn: 'পাওয়ার ক্যালকুলেটর', labelEn: 'Power (DC/AC)', icon: Activity },
    { id: 'energy', labelBn: 'এনার্জি ও বিদ্যুৎ বিল', labelEn: 'Energy & Bill', icon: Calculator },
    { id: 'resistors', labelBn: 'সিরিজ/প্যারালাল রোধ', labelEn: 'Resistors', icon: Cpu },
    { id: 'formulas', labelBn: 'সূত্র ও কনভার্টার', labelEn: 'Formulas & Units', icon: BookMarked },
    { id: 'diagrams', labelBn: 'সার্কিট ও সেফটি', labelEn: 'Diagrams & Safety', icon: ShieldAlert },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
          {bi(language, 'পাওয়ার টেকনোলজি ও ইঞ্জিনিয়ারিং টুলস', 'Power Technology & Engineering Tools')}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {bi(
            language,
            'অফলাইনেও সম্পূর্ণ কার্যকর: V-I-R, DC/1Φ/3Φ পাওয়ার, এনার্জি বিল, রোধ ক্যালকুলেটর ও সার্কিট ডায়াগ্রাম',
            'Works 100% offline: V-I-R solver, DC/1Φ/3Φ Power, Energy Bill, Resistor Networks & Diagrams'
          )}
        </p>
      </div>

      {/* Tool Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                active
                  ? 'border-cyan-500 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{bi(language, t.labelBn, t.labelEn)}</span>
            </button>
          );
        })}
      </div>

      {/* 1. Ohm's Law Solver */}
      {activeTab === 'ohm' && (
        <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {bi(language, "ওহমের সূত্র ক্যালকুলেটর (V = I × R)", "Ohm's Law & V-I-R Calculator")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {bi(language, 'যে রাশিটি বের করতে চান তা নির্বাচন করুন', 'Choose the unknown variable to solve')}
              </p>
            </div>
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {(['V', 'I', 'R'] as const).map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setOhmSolveFor(target)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    ohmSolveFor === target
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {target === 'V' ? 'Voltage (V)' : target === 'I' ? 'Current (I)' : 'Resistance (R)'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Voltage V (Volts)
              </label>
              <input
                type="number"
                disabled={ohmSolveFor === 'V'}
                value={ohmSolveFor === 'V' && ohmResult ? ohmResult.V.toFixed(2) : ohmV}
                onChange={(e) => setOhmV(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums disabled:opacity-70"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Current I (Amperes)
              </label>
              <input
                type="number"
                disabled={ohmSolveFor === 'I'}
                value={ohmSolveFor === 'I' && ohmResult ? ohmResult.I.toFixed(3) : ohmI}
                onChange={(e) => setOhmI(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums disabled:opacity-70"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Resistance R (Ohms Ω)
              </label>
              <input
                type="number"
                disabled={ohmSolveFor === 'R'}
                value={ohmSolveFor === 'R' && ohmResult ? ohmResult.R.toFixed(3) : ohmR}
                onChange={(e) => setOhmR(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums disabled:opacity-70"
              />
            </div>
          </div>

          {ohmResult ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                <p className="text-xs text-slate-500 dark:text-slate-400">Voltage (V)</p>
                <p className="mt-1 font-mono text-xl font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                  {ohmResult.V.toFixed(2)} V
                </p>
              </div>
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                <p className="text-xs text-slate-500 dark:text-slate-400">Current (I)</p>
                <p className="mt-1 font-mono text-xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                  {ohmResult.I.toFixed(3)} A
                </p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <p className="text-xs text-slate-500 dark:text-slate-400">Resistance (R)</p>
                <p className="mt-1 font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {ohmResult.R.toFixed(2)} Ω
                </p>
              </div>
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <p className="text-xs text-slate-500 dark:text-slate-400">Power (P = V×I)</p>
                <p className="mt-1 font-mono text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {ohmResult.P.toFixed(2)} W
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-500">Enter positive valid numbers to compute.</p>
          )}
        </section>
      )}

      {/* 2. Electrical Power Calculator */}
      {activeTab === 'power' && (
        <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {bi(language, 'বৈদ্যুতিক পাওয়ার ক্যালকুলেটর (DC / 1Φ AC / 3Φ AC)', 'Electrical Power Calculator (DC / 1Φ / 3Φ)')}
            </h2>
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'dc', label: 'DC' },
                  { id: '1phase', label: '1-Phase AC' },
                  { id: '3phase', label: '3-Phase AC' },
                ] as const
              ).map((sys) => (
                <button
                  key={sys.id}
                  type="button"
                  onClick={() => {
                    setPowerSystem(sys.id);
                    if (sys.id === '1phase') setPwrVoltage('220');
                    if (sys.id === '3phase') setPwrVoltage('400');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    powerSystem === sys.id
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {sys.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {powerSystem === '3phase' ? 'Line Voltage V_L (Volts)' : 'Voltage V (Volts)'}
              </label>
              <input
                type="number"
                value={pwrVoltage}
                onChange={(e) => setPwrVoltage(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Current I (Amperes)
              </label>
              <input
                type="number"
                value={pwrCurrent}
                onChange={(e) => setPwrCurrent(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Power Factor (cos φ, 0–1)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                disabled={powerSystem === 'dc'}
                value={powerSystem === 'dc' ? '1.00' : pwrPf}
                onChange={(e) => setPwrPf(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
              <p className="text-xs text-slate-500 dark:text-slate-400">Active Power (P)</p>
              <p className="mt-1 font-mono text-xl font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                {(powerResult.pWatts / 1000).toFixed(3)} kW
              </p>
              <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                {powerResult.pWatts.toFixed(1)} Watts
              </p>
            </div>
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
              <p className="text-xs text-slate-500 dark:text-slate-400">Apparent Power (S)</p>
              <p className="mt-1 font-mono text-xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                {(powerResult.sVa / 1000).toFixed(3)} kVA
              </p>
              <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                {powerResult.sVa.toFixed(1)} VA
              </p>
            </div>
            <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/30">
              <p className="text-xs text-slate-500 dark:text-slate-400">Reactive Power (Q)</p>
              <p className="mt-1 font-mono text-xl font-bold text-violet-600 dark:text-violet-400 tabular-nums">
                {(powerResult.qVar / 1000).toFixed(3)} kVAR
              </p>
              <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                {powerResult.qVar.toFixed(1)} VAR
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 3. Energy Consumption & Electricity Bill */}
      {activeTab === 'energy' && (
        <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {bi(language, 'এনার্জি খরচ ও বিদ্যুৎ বিল হিসাব (kWh / BDT)', 'Energy Consumption & Electricity Bill Calculator')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Load Power (Watts)
              </label>
              <input
                type="number"
                value={wattage}
                onChange={(e) => setWattage(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Quantity
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Hours / Day
              </label>
              <input
                type="number"
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Days
              </label>
              <input
                type="number"
                value={daysCount}
                onChange={(e) => setDaysCount(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Rate (৳ / Unit)
              </label>
              <input
                type="number"
                step="0.1"
                value={tariffBdt}
                onChange={(e) => setTariffBdt(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500">Daily Energy (Units)</p>
              <p className="mt-1 font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {energyResult.dailyKwh.toFixed(2)} kWh
              </p>
            </div>
            <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
              <p className="text-xs text-slate-500">Total Energy ({daysCount} days)</p>
              <p className="mt-1 font-mono text-xl font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                {energyResult.totalKwh.toFixed(2)} Units
              </p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <p className="text-xs text-slate-500">Estimated Energy Cost</p>
              <p className="mt-1 font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                ৳ {energyResult.totalCost.toFixed(2)}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 4. Series & Parallel Resistance Calculator */}
      {activeTab === 'resistors' && (
        <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {bi(language, 'সিরিজ ও প্যারালাল রেজিস্ট্যান্স ক্যালকুলেটর', 'Series & Parallel Resistance Calculator')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {bi(language, 'একাধিক রোধ (Ω) যোগ করে সমতুল্য রোধ ও কারেন্ট নির্ণয় করুন', 'Add multiple resistors (Ω) to compute Req & current')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setResistors((prev) => [...prev, '10'])}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>Add Resistor</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
            {resistors.map((val, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <input
                  type="number"
                  value={val}
                  onChange={(e) =>
                    setResistors((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                  }
                  aria-label={`Resistor ${idx + 1}`}
                  className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums"
                />
                {resistors.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setResistors((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label="Remove resistor"
                    className="p-2 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="max-w-xs">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Applied Source Voltage (V)
            </label>
            <input
              type="number"
              value={resAppliedV}
              onChange={(e) => setResAppliedV(e.target.value)}
              className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums"
            />
          </div>

          {resResult && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  Series Equivalent (R_s = R₁ + R₂ + ...)
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {resResult.series.toFixed(2)} Ω
                </p>
                <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                  Total Current: {resResult.seriesCurrent.toFixed(4)} A
                </p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Parallel Equivalent (1/R_p = 1/R₁ + 1/R₂ + ...)
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {resResult.parallel.toFixed(3)} Ω
                </p>
                <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                  Total Current: {resResult.parallelCurrent.toFixed(4)} A
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 5. Formula Library & Unit Converter */}
      {activeTab === 'formulas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-cyan-500" />
              <span>{bi(language, 'ইঞ্জিনিয়ারিং ইউনিট কনভার্টার', 'Engineering Unit Converter')}</span>
            </h2>

            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
              {(
                [
                  { id: 'power', label: 'kW / HP' },
                  { id: 'pressure', label: 'Bar / PSI' },
                  { id: 'temp', label: '°C / °F / K' },
                ] as const
              ).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setConvType(u.id)}
                  className={`py-2 rounded-lg text-xs font-semibold ${
                    convType === u.id ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {u.label}
                </button>
              ))}
            </div>

            <input
              type="number"
              value={convInput}
              onChange={(e) => setConvInput(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono tabular-nums"
            />

            <div className="space-y-2">
              {conversionSummary.map((row, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <span className="text-slate-600 dark:text-slate-300">{row.label}</span>
                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                    {row.val}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {bi(language, 'গুরুত্বপূর্ণ সূত্র লাইব্রেরি', 'Electrical & Power Formula Library')}
              </h2>
              <div className="relative sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={formulaQuery}
                  onChange={(e) => setFormulaQuery(e.target.value)}
                  placeholder="Search formula..."
                  className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[440px] overflow-y-auto pr-1">
              {filteredFormulas.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-1"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                    {item.cat}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {item.name}
                  </h3>
                  <p className="font-mono text-xs text-blue-600 dark:text-blue-300 bg-white dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    {item.formula}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.note}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* 6. Circuit Diagrams & Electrical Safety */}
      {activeTab === 'diagrams' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <span>{bi(language, 'ইলেকট্রিক্যাল ও ল্যাব সেফটি গাইডলাইন', 'Electrical & Power Lab Safety Rules')}</span>
            </h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs text-slate-700 dark:text-slate-300">
              <li className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <strong>LOTO (Lockout / Tagout):</strong> প্যানেল বা মোটরে কাজের আগে মেইন ব্রেকার অফ করে লক ও সতর্কতা ট্যাগ লাগান।
              </li>
              <li className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <strong>Proper Earthing & PPE:</strong> ইনসুলেটেড গ্লাভস, রাবার-সোল জুতা এবং বৈধ টেস্টার দিয়ে ভোল্টেজ ০ নিশ্চিত হয়ে কাজ শুরু করুন।
              </li>
              <li className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <strong>CT Secondary Rule:</strong> কারেন্ট ট্রান্সফরমারের (CT) সেকেন্ডারি সার্কিট লোড চলাকালীন কখনোই ওপেন রাখবেন না; উচ্চ ভোল্টেজ উৎপন্ন হতে পারে।
              </li>
              <li className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <strong>Capacitor Discharge:</strong> পাওয়ার সাপ্লাই অফ করার পরও হাই-ভোল্টেজ ক্যাপাসিটর ডিসচার্জ রডের মাধ্যমে ডিসচার্জ করে নিন।
              </li>
            </ul>
          </div>

          <CircuitDiagrams
            types={[
              'power-grid-single-line',
              'steam-power-plant',
              'star-delta-3phase',
              'dc-series-parallel',
              'transformer-circuit',
              'bridge-rectifier',
            ]}
          />
        </div>
      )}
    </div>
  );
};
