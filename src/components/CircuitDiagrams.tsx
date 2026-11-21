import React from 'react';
import { CircuitDiagramType } from '../types/study';

interface CircuitDiagramsProps {
  types: CircuitDiagramType[];
}

const DIAGRAM_TITLES: Record<CircuitDiagramType, { title: string; subtitle: string }> = {
  'power-grid-single-line': {
    title: 'পাওয়ার জেনারেশন থেকে ডিস্ট্রিবিউশন সিঙ্গেল-লাইন ডায়াগ্রাম',
    subtitle: '১১ কেভি অল্টারনেটর → স্টেপ-আপ → ২৩০/১৩২ কেভি গ্রিড → ৩৩/১১ কেভি সাব-স্টেশন',
  },
  'steam-power-plant': {
    title: 'স্টিম পাওয়ার প্ল্যান্ট (র‍্যাঙ্কিন সাইকেল) ব্লক ডায়াগ্রাম',
    subtitle: 'বয়লার → স্টিম টারবাইন → অল্টারনেটর → কনডেনসার → ফিড পাম্প',
  },
  'star-delta-3phase': {
    title: '৩-ফেজ স্টার (Y) ও ডেল্টা (Δ) সংযোগ ডায়াগ্রাম',
    subtitle: 'স্টার: VL = √3 Vph (IL = Iph) · ডেল্টা: IL = √3 Iph (VL = Vph)',
  },
  'dc-series-parallel': {
    title: 'ডিসি সিরিজ ও প্যারালাল সার্কিট ডায়াগ্রাম',
    subtitle: 'ওহমের সূত্র (V = IR) ও সমতুল্য রোধ তুলনা',
  },
  'transformer-circuit': {
    title: 'সিঙ্গেল ফেজ পাওয়ার ট্রান্সফরমার ডায়াগ্রাম',
    subtitle: 'প্রাইমারি ওয়াইন্ডিং (N₁) · ল্যামিনেটেড কোর ফ্লাক্স (Φm) · সেকেন্ডারি (N₂)',
  },
  'bridge-rectifier': {
    title: 'ফুল-ওয়েভ ব্রিজ রেক্টিফায়ার সার্কিট ডায়াগ্রাম',
    subtitle: '৪টি ডায়োড (D₁–D₄) ব্যবহার করে AC থেকে DC রূপান্তর',
  },
};

function renderDiagramSvg(type: CircuitDiagramType) {
  switch (type) {
    case 'power-grid-single-line':
      return (
        <svg viewBox="0 0 680 180" className="w-full h-auto" role="img" aria-label="Power Grid Single Line Diagram">
          <rect x="20" y="55" width="95" height="60" rx="10" className="fill-sky-500/15 stroke-sky-500" strokeWidth="2" />
          <text x="67" y="82" textAnchor="middle" className="fill-current text-[11px] font-semibold">জেনারেটর</text>
          <text x="67" y="100" textAnchor="middle" className="fill-sky-500 text-[10px] font-mono">11 kV AC</text>

          <line x1="115" y1="85" x2="155" y2="85" className="stroke-slate-400" strokeWidth="2" />
          <circle cx="172" cy="85" r="16" className="fill-none stroke-amber-500" strokeWidth="2" />
          <circle cx="192" cy="85" r="16" className="fill-none stroke-amber-500" strokeWidth="2" />
          <text x="182" y="122" textAnchor="middle" className="fill-current text-[10px]">স্টেপ-আপ ট্রান্স.</text>

          <line x1="208" y1="85" x2="310" y2="85" className="stroke-emerald-500" strokeWidth="2.5" />
          <text x="259" y="72" textAnchor="middle" className="fill-emerald-500 text-[10px] font-mono">132/230 kV</text>
          <text x="259" y="103" textAnchor="middle" className="fill-slate-400 text-[9px]">ট্রান্সমিশন লাইন</text>

          <rect x="310" y="55" width="110" height="60" rx="10" className="fill-amber-500/15 stroke-amber-500" strokeWidth="2" />
          <text x="365" y="82" textAnchor="middle" className="fill-current text-[11px] font-semibold">গ্রিড সাব-স্টেশন</text>
          <text x="365" y="100" textAnchor="middle" className="fill-amber-500 text-[10px] font-mono">33/11 kV</text>

          <line x1="420" y1="85" x2="475" y2="85" className="stroke-slate-400" strokeWidth="2" />
          <rect x="475" y="55" width="90" height="60" rx="10" className="fill-sky-500/15 stroke-sky-500" strokeWidth="2" />
          <text x="520" y="82" textAnchor="middle" className="fill-current text-[11px] font-semibold">ডিস্ট্রিবিউশন</text>
          <text x="520" y="100" textAnchor="middle" className="fill-sky-500 text-[10px] font-mono">400/230 V</text>

          <line x1="565" y1="85" x2="600" y2="85" className="stroke-slate-400" strokeWidth="2" />
          <rect x="600" y="62" width="62" height="46" rx="8" className="fill-emerald-500/15 stroke-emerald-500" strokeWidth="2" />
          <text x="631" y="89" textAnchor="middle" className="fill-current text-[11px] font-semibold">গ্রাহক</text>
        </svg>
      );

    case 'steam-power-plant':
      return (
        <svg viewBox="0 0 680 200" className="w-full h-auto" role="img" aria-label="Steam Power Plant Diagram">
          <rect x="30" y="30" width="120" height="60" rx="10" className="fill-amber-500/15 stroke-amber-500" strokeWidth="2" />
          <text x="90" y="58" textAnchor="middle" className="fill-current text-[12px] font-semibold">বয়লার (Boiler)</text>
          <text x="90" y="76" textAnchor="middle" className="fill-amber-500 text-[10px]">উচ্চ চাপের স্টিম</text>

          <path d="M 150 60 L 215 60" className="stroke-sky-500" strokeWidth="2.5" markerEnd="url(#arrow)" />

          <polygon points="220,38 330,26 330,94 220,82" className="fill-sky-500/15 stroke-sky-500" strokeWidth="2" />
          <text x="275" y="64" textAnchor="middle" className="fill-current text-[11px] font-semibold">স্টিম টারবাইন</text>

          <line x1="330" y1="60" x2="395" y2="60" className="stroke-emerald-500" strokeWidth="3" />
          <text x="362" y="50" textAnchor="middle" className="fill-emerald-500 text-[9px]">শ্যাফট</text>

          <circle cx="445" cy="60" r="36" className="fill-emerald-500/15 stroke-emerald-500" strokeWidth="2" />
          <text x="445" y="58" textAnchor="middle" className="fill-current text-[11px] font-semibold">অল্টারনেটর</text>
          <text x="445" y="74" textAnchor="middle" className="fill-emerald-500 text-[10px] font-mono">AC আউটপুট</text>

          <line x1="275" y1="88" x2="275" y2="128" className="stroke-slate-400" strokeWidth="2" />
          <rect x="210" y="128" width="130" height="50" rx="10" className="fill-slate-500/15 stroke-slate-400" strokeWidth="2" />
          <text x="275" y="152" textAnchor="middle" className="fill-current text-[11px] font-semibold">কনডেনসার</text>
          <text x="275" y="168" textAnchor="middle" className="fill-slate-400 text-[10px]">বাষ্প → পানি</text>

          <line x1="210" y1="153" x2="125" y2="153" className="stroke-sky-400" strokeWidth="2" />
          <circle cx="90" cy="153" r="24" className="fill-sky-500/15 stroke-sky-500" strokeWidth="2" />
          <text x="90" y="157" textAnchor="middle" className="fill-current text-[10px] font-semibold">ফিড পাম্প</text>
          <line x1="90" y1="129" x2="90" y2="90" className="stroke-sky-400" strokeWidth="2" />
        </svg>
      );

    case 'star-delta-3phase':
      return (
        <svg viewBox="0 0 640 200" className="w-full h-auto" role="img" aria-label="3 Phase Star Delta Diagram">
          {/* Star (Y) */}
          <text x="150" y="25" textAnchor="middle" className="fill-current text-[13px] font-bold">স্টার সংযোগ (Star / Y)</text>
          <line x1="150" y1="105" x2="150" y2="48" className="stroke-sky-500" strokeWidth="2.5" />
          <line x1="150" y1="105" x2="95" y2="152" className="stroke-amber-500" strokeWidth="2.5" />
          <line x1="150" y1="105" x2="205" y2="152" className="stroke-emerald-500" strokeWidth="2.5" />
          <circle cx="150" cy="105" r="5" className="fill-white stroke-sky-500" strokeWidth="2" />
          <text x="164" y="108" className="fill-current text-[10px] font-mono">N (Neutral)</text>
          <text x="150" y="42" textAnchor="middle" className="fill-sky-500 text-[11px] font-mono">R</text>
          <text x="82" y="162" className="fill-amber-500 text-[11px] font-mono">Y</text>
          <text x="212" y="162" className="fill-emerald-500 text-[11px] font-mono">B</text>
          <text x="150" y="186" textAnchor="middle" className="fill-slate-400 text-[11px] font-mono">VL = √3 Vph</text>

          {/* Divider */}
          <line x1="320" y1="20" x2="320" y2="185" className="stroke-slate-700/40" strokeDasharray="4 4" />

          {/* Delta */}
          <text x="490" y="25" textAnchor="middle" className="fill-current text-[13px] font-bold">ডেল্টা সংযোগ (Delta / Δ)</text>
          <polygon points="490,48 425,152 555,152" className="fill-none stroke-sky-500" strokeWidth="2.5" />
          <circle cx="490" cy="48" r="4" className="fill-sky-500" />
          <circle cx="425" cy="152" r="4" className="fill-amber-500" />
          <circle cx="555" cy="152" r="4" className="fill-emerald-500" />
          <text x="490" y="40" textAnchor="middle" className="fill-sky-500 text-[11px] font-mono">R</text>
          <text x="410" y="160" className="fill-amber-500 text-[11px] font-mono">Y</text>
          <text x="564" y="160" className="fill-emerald-500 text-[11px] font-mono">B</text>
          <text x="490" y="186" textAnchor="middle" className="fill-slate-400 text-[11px] font-mono">IL = √3 Iph</text>
        </svg>
      );

    case 'dc-series-parallel':
      return (
        <svg viewBox="0 0 640 190" className="w-full h-auto" role="img" aria-label="DC Series and Parallel Circuit">
          <text x="155" y="22" textAnchor="middle" className="fill-current text-[12px] font-bold">সিরিজ সার্কিট (Req = R₁ + R₂)</text>
          <rect x="65" y="42" width="180" height="105" rx="6" className="fill-none stroke-slate-400" strokeWidth="2" />
          <rect x="105" y="32" width="38" height="20" rx="4" className="fill-sky-500/20 stroke-sky-500" strokeWidth="2" />
          <text x="124" y="46" textAnchor="middle" className="fill-current text-[10px] font-mono">R₁</text>
          <rect x="175" y="32" width="38" height="20" rx="4" className="fill-sky-500/20 stroke-sky-500" strokeWidth="2" />
          <text x="194" y="46" textAnchor="middle" className="fill-current text-[10px] font-mono">R₂</text>
          <circle cx="65" cy="95" r="16" className="fill-amber-500/15 stroke-amber-500" strokeWidth="2" />
          <text x="65" y="99" textAnchor="middle" className="fill-amber-500 text-[11px] font-mono">V</text>
          <text x="155" y="172" textAnchor="middle" className="fill-slate-400 text-[10px]">কারেন্ট (I) সর্বত্র সমান</text>

          <line x1="320" y1="15" x2="320" y2="175" className="stroke-slate-700/40" strokeDasharray="4 4" />

          <text x="485" y="22" textAnchor="middle" className="fill-current text-[12px] font-bold">প্যারালাল সার্কিট (1/Req = 1/R₁ + 1/R₂)</text>
          <line x1="395" y1="45" x2="555" y2="45" className="stroke-slate-400" strokeWidth="2" />
          <line x1="395" y1="145" x2="555" y2="145" className="stroke-slate-400" strokeWidth="2" />
          <line x1="395" y1="45" x2="395" y2="145" className="stroke-slate-400" strokeWidth="2" />
          <circle cx="395" cy="95" r="16" className="fill-amber-500/15 stroke-amber-500" strokeWidth="2" />
          <text x="395" y="99" textAnchor="middle" className="fill-amber-500 text-[11px] font-mono">V</text>
          <line x1="475" y1="45" x2="475" y2="145" className="stroke-slate-400" strokeWidth="2" />
          <rect x="462" y="75" width="26" height="40" rx="4" className="fill-emerald-500/20 stroke-emerald-500" strokeWidth="2" />
          <text x="475" y="99" textAnchor="middle" className="fill-current text-[10px] font-mono">R₁</text>
          <line x1="555" y1="45" x2="555" y2="145" className="stroke-slate-400" strokeWidth="2" />
          <rect x="542" y="75" width="26" height="40" rx="4" className="fill-emerald-500/20 stroke-emerald-500" strokeWidth="2" />
          <text x="555" y="99" textAnchor="middle" className="fill-current text-[10px] font-mono">R₂</text>
          <text x="485" y="172" textAnchor="middle" className="fill-slate-400 text-[10px]">ভোল্টেজ (V) সর্বত্র সমান</text>
        </svg>
      );

    case 'transformer-circuit':
      return (
        <svg viewBox="0 0 640 185" className="w-full h-auto" role="img" aria-label="Single Phase Transformer">
          <rect x="245" y="30" width="150" height="125" rx="8" className="fill-slate-500/10 stroke-slate-400" strokeWidth="2.5" />
          <rect x="278" y="55" width="84" height="75" rx="4" className="fill-none stroke-slate-400" strokeWidth="2" />
          <text x="320" y="96" textAnchor="middle" className="fill-amber-500 text-[11px] font-mono">Φm কোর</text>

          {/* Primary */}
          <path d="M 140 50 L 235 50 M 140 135 L 235 135" className="stroke-sky-500" strokeWidth="2" />
          <rect x="215" y="48" width="24" height="88" rx="6" className="fill-sky-500/20 stroke-sky-500" strokeWidth="2" />
          <text x="155" y="96" textAnchor="middle" className="fill-sky-500 text-[11px] font-mono">V₁, N₁ (প্রাইমারি)</text>

          {/* Secondary */}
          <path d="M 405 50 L 500 50 M 405 135 L 500 135" className="stroke-emerald-500" strokeWidth="2" />
          <rect x="401" y="48" width="24" height="88" rx="6" className="fill-emerald-500/20 stroke-emerald-500" strokeWidth="2" />
          <text x="495" y="96" textAnchor="middle" className="fill-emerald-500 text-[11px] font-mono">V₂, N₂ (সেকেন্ডারি)</text>
        </svg>
      );

    case 'bridge-rectifier':
      return (
        <svg viewBox="0 0 640 185" className="w-full h-auto" role="img" aria-label="Bridge Rectifier Circuit">
          <circle cx="95" cy="92" r="24" className="fill-sky-500/15 stroke-sky-500" strokeWidth="2" />
          <text x="95" y="96" textAnchor="middle" className="fill-sky-500 text-[11px] font-mono">AC In</text>

          <polygon points="320,30 410,92 320,155 230,92" className="fill-none stroke-amber-500" strokeWidth="2" />
          <line x1="119" y1="80" x2="230" y2="92" className="stroke-slate-400" strokeWidth="2" />
          <line x1="119" y1="104" x2="410" y2="92" className="stroke-slate-400" strokeWidth="1.5" strokeDasharray="4 3" />

          <text x="262" y="56" className="fill-current text-[10px] font-mono">D₁</text>
          <text x="372" y="56" className="fill-current text-[10px] font-mono">D₂</text>
          <text x="262" y="138" className="fill-current text-[10px] font-mono">D₄</text>
          <text x="372" y="138" className="fill-current text-[10px] font-mono">D₃</text>

          <line x1="320" y1="30" x2="520" y2="30" className="stroke-emerald-500" strokeWidth="2" />
          <line x1="320" y1="155" x2="520" y2="155" className="stroke-slate-400" strokeWidth="2" />
          <rect x="502" y="65" width="36" height="55" rx="6" className="fill-emerald-500/15 stroke-emerald-500" strokeWidth="2" />
          <text x="520" y="96" textAnchor="middle" className="fill-current text-[10px] font-mono">RL (+DC)</text>
        </svg>
      );
  }
}

export const CircuitDiagrams: React.FC<CircuitDiagramsProps> = ({ types }) => {
  if (!types || types.length === 0) return null;

  return (
    <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          সার্কিট ও পাওয়ার সিস্টেম ডায়াগ্রাম
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          বিষয়ভিত্তিক ভেক্টর ইঞ্জিনিয়ারিং ডায়াগ্রাম
        </p>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {types.map((type) => {
          const info = DIAGRAM_TITLES[type];
          return (
            <div key={type} className="p-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{info.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{info.subtitle}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-100">
                {renderDiagramSvg(type)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
