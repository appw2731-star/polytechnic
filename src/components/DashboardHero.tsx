import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Cpu,
  FolderOpen,
  GraduationCap,
  Loader2,
  Pencil,
  Search,
  Sigma,
  User,
  X,
} from 'lucide-react';
import { DEPARTMENTS, SEMESTER_LABELS } from '../data/curriculum';
import { BANGLADESH_POLYTECHNICS } from '../data/polytechnics';
import type { ProfileUpdateResult } from '../services/profileUpdateService';
import type { DepartmentId, SemesterNumber } from '../types/study';

export interface HeroProfileChangePayload {
  studentName?: string;
  collegeName?: string;
  department?: DepartmentId;
  semester?: SemesterNumber;
  avatarDataUrl?: string;
}

export interface DashboardHeroProps {
  initialName?: string;
  collegeName?: string;
  initialDepartment?: DepartmentId;
  initialSemester?: SemesterNumber;
  initialAvatarUrl?: string;
  onUpdateHeroProfile?: (
    partial: HeroProfileChangePayload
  ) => Promise<ProfileUpdateResult> | ProfileUpdateResult | void;
  onOpenPdfLibrary: () => void;
  onOpenFormulaHub: () => void;
  onOpenStudyTimer: () => void;
}

const CUSTOM_COLLEGE_VALUE = '__CUSTOM_POLYTECHNIC__';

export const DashboardHero: React.FC<DashboardHeroProps> = ({
  initialName = 'Rokib Hasan',
  collegeName = 'ঢাকা পলিটেকনিক ইনস্টিটিউট',
  initialDepartment = 'power',
  initialSemester = 4,
  initialAvatarUrl = '',
  onUpdateHeroProfile,
  onOpenPdfLibrary,
  onOpenFormulaHub,
  onOpenStudyTimer,
}) => {
  const [name, setName] = useState(initialName);
  const [draftName, setDraftName] = useState(initialName);
  const [isEditingName, setIsEditingName] = useState(false);

  const [institute, setInstitute] = useState(collegeName);
  const [department, setDepartment] = useState<DepartmentId>(initialDepartment);
  const [semester, setSemester] = useState<SemesterNumber>(initialSemester);

  const isKnownInstitute = BANGLADESH_POLYTECHNICS.some((p) => p.nameBn === institute);
  const [isEditingAcademic, setIsEditingAcademic] = useState(false);
  const [polyQuery, setPolyQuery] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string>(
    isKnownInstitute ? institute : CUSTOM_COLLEGE_VALUE
  );
  const [customCollegeDraft, setCustomCollegeDraft] = useState(
    isKnownInstitute ? '' : institute
  );
  const [draftDepartment, setDraftDepartment] = useState<DepartmentId>(initialDepartment);
  const [draftSemester, setDraftSemester] = useState<SemesterNumber>(initialSemester);

  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setName(initialName);
    if (!isEditingName) setDraftName(initialName);
  }, [initialName, isEditingName]);

  useEffect(() => {
    setInstitute(collegeName);
    if (!isEditingAcademic) {
      const known = BANGLADESH_POLYTECHNICS.some((p) => p.nameBn === collegeName);
      setSelectedPreset(known ? collegeName : CUSTOM_COLLEGE_VALUE);
      setCustomCollegeDraft(known ? '' : collegeName);
    }
  }, [collegeName, isEditingAcademic]);

  useEffect(() => {
    setDepartment(initialDepartment);
    if (!isEditingAcademic) setDraftDepartment(initialDepartment);
  }, [initialDepartment, isEditingAcademic]);

  useEffect(() => {
    setSemester(initialSemester);
    if (!isEditingAcademic) setDraftSemester(initialSemester);
  }, [initialSemester, isEditingAcademic]);

  useEffect(() => {
    setAvatarUrl(initialAvatarUrl);
  }, [initialAvatarUrl]);

  const filteredPolytechnics = useMemo(() => {
    const q = polyQuery.trim().toLowerCase();
    if (!q) return BANGLADESH_POLYTECHNICS;
    return BANGLADESH_POLYTECHNICS.filter(
      (p) =>
        p.nameBn.toLowerCase().includes(q) ||
        p.nameEn.toLowerCase().includes(q) ||
        p.districtBn.toLowerCase().includes(q)
    );
  }, [polyQuery]);

  const showTransientSaved = (msg: string) => {
    setStatusError(null);
    setStatusSuccess(msg);
    window.setTimeout(() => {
      setStatusSuccess((cur) => (cur === msg ? null : cur));
    }, 2600);
  };

  const commitUpdate = async (partial: HeroProfileChangePayload, successLabel: string) => {
    if (!onUpdateHeroProfile) {
      showTransientSaved(successLabel);
      return;
    }
    setSaving(true);
    setStatusError(null);
    try {
      const result = await onUpdateHeroProfile(partial);
      if (result && result.error) {
        setStatusError(result.error);
      } else {
        showTransientSaved(successLabel);
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'তথ্য সংরক্ষণে সমস্যা হয়েছে।');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveName = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = draftName.trim();
    if (cleaned.length < 2) {
      setStatusError('নাম কমপক্ষে ২ অক্ষরের হতে হবে।');
      return;
    }
    setName(cleaned);
    setIsEditingName(false);
    await commitUpdate({ studentName: cleaned }, 'নাম আপডেট হয়েছে।');
  };

  const handleSaveAcademic = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextCollege =
      selectedPreset === CUSTOM_COLLEGE_VALUE ? customCollegeDraft.trim() : selectedPreset;
    if (nextCollege.length < 2) {
      setStatusError('অনুগ্রহ করে পলিটেকনিক ইনস্টিটিউটের নাম লিখুন বা নির্বাচন করুন।');
      return;
    }
    setInstitute(nextCollege);
    setDepartment(draftDepartment);
    setSemester(draftSemester);
    setIsEditingAcademic(false);
    setPolyQuery('');
    await commitUpdate(
      { collegeName: nextCollege, department: draftDepartment, semester: draftSemester },
      'পলিটেকনিক, ডিপার্টমেন্ট ও সেমিস্টার আপডেট হয়েছে।'
    );
  };

  const handleQuickDepartmentSelect = async (nextDept: DepartmentId) => {
    setDepartment(nextDept);
    setDraftDepartment(nextDept);
    await commitUpdate({ department: nextDept }, 'ডিপার্টমেন্ট আপডেট হয়েছে।');
  };

  const handleQuickSemesterSelect = async (nextSem: SemesterNumber) => {
    setSemester(nextSem);
    setDraftSemester(nextSem);
    await commitUpdate({ semester: nextSem }, 'সেমিস্টার আপডেট হয়েছে।');
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatusError(null);

    if (!file.type.startsWith('image/')) {
      setStatusError('অনুগ্রহ করে একটি সঠিক ছবি (JPG/PNG) নির্বাচন করুন।');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatusError('ছবির সাইজ ৫ MB-এর কম হতে হবে।');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 256;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setAvatarUrl(compressedDataUrl);
        void commitUpdate({ avatarDataUrl: compressedDataUrl }, 'প্রোফাইল ছবি আপডেট হয়েছে।');
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <section
      aria-label="শিক্ষার্থী প্রোফাইল কার্ড"
      className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[#071226] border border-slate-800/90 text-white shadow-lg"
    >
      {/* Subtle Circuit Board Pattern + Dark Blue Gradient */}
      <img
        src="/src/assets/images/diploma_study_blueprint_1794839045900.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
      <svg
        aria-hidden="true"
        className="absolute inset-0 w-full h-full opacity-20 pointer-events-none text-cyan-400"
      >
        <defs>
          <pattern id="heroCircuitGrid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path
              d="M10 10 H36 V32 H64 M24 80 V52 H48 V20 M0 60 H20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
            <circle cx="10" cy="10" r="2.2" fill="currentColor" />
            <circle cx="64" cy="32" r="2.2" fill="currentColor" />
            <circle cx="48" cy="20" r="2" fill="currentColor" />
            <circle cx="20" cy="60" r="2" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#heroCircuitGrid)" />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-br from-[#060E1F]/92 via-[#091833]/85 to-[#0C254A]/78" />

      <div className="relative p-5 sm:p-6 lg:p-7 space-y-5">
        {/* Top (Mobile) / Left (Desktop) Profile Row */}
        <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 sm:gap-6 text-center sm:text-left">
          {/* Circular Profile Picture + Camera Edit Overlay (>=44px mobile touch target) */}
          <div className="relative shrink-0">
            <button
              type="button"
              disabled={saving}
              onClick={() => fileInputRef.current?.click()}
              aria-label="প্রোফাইল ছবি পরিবর্তন করুন"
              className="w-24 h-24 sm:w-[96px] sm:h-[96px] rounded-full overflow-hidden bg-slate-800/90 border-2 border-cyan-400/60 flex items-center justify-center shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 transition-transform active:scale-[0.98]"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarUrl('')}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-10 h-10 text-cyan-300/85" />
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarFileChange}
              className="hidden"
              aria-label="প্রোফাইল ছবি আপলোড করুন"
            />

            <button
              type="button"
              disabled={saving}
              onClick={() => fileInputRef.current?.click()}
              title="ছবি পরিবর্তন করুন"
              aria-label="ক্যামেরা আইকন — ছবি পরিবর্তন করুন"
              className="absolute -bottom-2 -right-2 w-11 h-11 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-pointer"
            >
              <span className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 border-2 border-[#071226] text-white flex items-center justify-center shadow-md transition-colors">
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
              </span>
            </button>
          </div>

          {/* Inline-Editable Name + Prominent Polytechnic & Semester Info */}
          <div className="flex-1 min-w-0 w-full space-y-2.5">
            {/* Inline-Editable Name Row */}
            {isEditingName ? (
              <form
                onSubmit={(e) => void handleSaveName(e)}
                className="flex items-center justify-center sm:justify-start gap-2 max-w-md mx-auto sm:mx-0"
              >
                <input
                  type="text"
                  autoFocus
                  maxLength={80}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setDraftName(name);
                      setIsEditingName(false);
                    }
                  }}
                  placeholder="আপনার নাম লিখুন"
                  aria-label="শিক্ষার্থীর নাম"
                  className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 rounded-xl bg-white/12 border border-cyan-400/70 text-lg sm:text-xl font-bold text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
                <button
                  type="submit"
                  disabled={saving}
                  aria-label="নাম সংরক্ষণ করুন"
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftName(name);
                    setIsEditingName(false);
                  }}
                  aria-label="বাতিল করুন"
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-200 flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => {
                    setDraftName(name);
                    setIsEditingName(true);
                  }}
                  className="group min-h-[44px] inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/12 border border-white/15 border-b-cyan-400/60 hover:border-cyan-400/80 transition-colors text-left max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  title="নাম পরিবর্তন করতে ক্লিক করুন"
                  aria-label={`নাম পরিবর্তন করুন: ${name}`}
                >
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
                    {name}
                  </h1>
                  <Pencil className="w-4 h-4 text-cyan-300 group-hover:text-cyan-200 shrink-0" />
                </button>
              </div>
            )}

            {/* Prominent College & Semester Info / Editor */}
            {isEditingAcademic ? (
              <form
                onSubmit={(e) => void handleSaveAcademic(e)}
                className="p-3.5 rounded-xl bg-white/8 border border-white/15 space-y-3 max-w-xl mx-auto sm:mx-0 text-left"
              >
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-cyan-300/80 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={polyQuery}
                    onChange={(e) => {
                      const q = e.target.value;
                      setPolyQuery(q);
                      const matches = BANGLADESH_POLYTECHNICS.filter(
                        (p) =>
                          p.nameBn.toLowerCase().includes(q.trim().toLowerCase()) ||
                          p.nameEn.toLowerCase().includes(q.trim().toLowerCase()) ||
                          p.districtBn.toLowerCase().includes(q.trim().toLowerCase())
                      );
                      if (matches.length > 0 && selectedPreset !== CUSTOM_COLLEGE_VALUE) {
                        if (!matches.some((m) => m.nameBn === selectedPreset)) {
                          setSelectedPreset(matches[0].nameBn);
                        }
                      }
                    }}
                    placeholder="পলিটেকনিক খুঁজুন (যেমন: বগুড়া, ঢাকা, ফেনী...)"
                    aria-label="পলিটেকনিক ইনস্টিটিউট খুঁজুন"
                    className="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-[#0B1B36] border border-white/20 text-xs sm:text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="sm:col-span-2 space-y-1">
                    <label
                      htmlFor="hero-college-select"
                      className="text-xs font-medium text-cyan-200"
                    >
                      পলিটেকনিক ইনস্টিটিউট
                    </label>
                    <select
                      id="hero-college-select"
                      value={selectedPreset}
                      onChange={(e) => setSelectedPreset(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B1B36] border border-white/20 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    >
                      {filteredPolytechnics.map((poly) => (
                        <option key={poly.id} value={poly.nameBn}>
                          {poly.nameBn} ({poly.districtBn})
                        </option>
                      ))}
                      <option value={CUSTOM_COLLEGE_VALUE}>
                        অন্যান্য / নিজস্ব পলিটেকনিক লিখুন...
                      </option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="hero-department-select"
                      className="text-xs font-medium text-cyan-200"
                    >
                      ডিপার্টমেন্ট / টেকনোলজি
                    </label>
                    <select
                      id="hero-department-select"
                      value={draftDepartment}
                      onChange={(e) => setDraftDepartment(e.target.value as DepartmentId)}
                      className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B1B36] border border-white/20 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    >
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.nameBn} ({dept.shortName})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="hero-semester-select"
                      className="text-xs font-medium text-cyan-200"
                    >
                      সেমিস্টার
                    </label>
                    <select
                      id="hero-semester-select"
                      value={draftSemester}
                      onChange={(e) => setDraftSemester(Number(e.target.value) as SemesterNumber)}
                      className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B1B36] border border-white/20 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    >
                      {([1, 2, 3, 4, 5, 6, 7, 8] as SemesterNumber[]).map((s) => (
                        <option key={s} value={s}>
                          {SEMESTER_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedPreset === CUSTOM_COLLEGE_VALUE && (
                  <div className="space-y-1">
                    <label
                      htmlFor="hero-custom-college"
                      className="text-xs font-medium text-cyan-200"
                    >
                      আপনার পলিটেকনিকের নাম লিখুন
                    </label>
                    <input
                      id="hero-custom-college"
                      type="text"
                      required
                      maxLength={140}
                      value={customCollegeDraft}
                      onChange={(e) => setCustomCollegeDraft(e.target.value)}
                      placeholder="যেমন: বগুড়া পলিটেকনিক ইনস্টিটিউট"
                      className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B1B36] border border-cyan-400/50 text-xs sm:text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    <span>সংরক্ষণ করুন</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingAcademic(false);
                      setPolyQuery('');
                    }}
                    className="min-h-[44px] inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs sm:text-sm text-slate-200 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    <span>বাতিল</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-center sm:justify-start">
                  <button
                    type="button"
                    onClick={() => {
                      const known = BANGLADESH_POLYTECHNICS.some((p) => p.nameBn === institute);
                      setSelectedPreset(known ? institute : CUSTOM_COLLEGE_VALUE);
                      setCustomCollegeDraft(known ? '' : institute);
                      setDraftDepartment(department);
                      setDraftSemester(semester);
                      setPolyQuery('');
                      setIsEditingAcademic(true);
                    }}
                    title="পলিটেকনিক পরিবর্তন করুন"
                    className="min-h-[44px] inline-flex items-center justify-center sm:justify-start gap-2 px-2.5 py-1.5 -mx-2.5 sm:mx-0 rounded-xl hover:bg-white/10 border border-transparent hover:border-white/15 transition-colors text-center sm:text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  >
                    <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="text-[15px] sm:text-base font-semibold text-cyan-100 leading-snug text-balance">
                      {institute}
                    </span>
                    <Pencil className="w-3.5 h-3.5 text-cyan-300/80 shrink-0" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-2 gap-y-1">
                  <label className="relative min-h-[44px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-white/10 border border-transparent hover:border-white/15 transition-colors cursor-pointer">
                    <Cpu className="w-4 h-4 text-cyan-300 shrink-0" />
                    <span className="sr-only">ডিপার্টমেন্ট নির্বাচন করুন</span>
                    <select
                      aria-label="ডিপার্টমেন্ট নির্বাচন করুন"
                      value={department}
                      disabled={saving}
                      onChange={(e) =>
                        void handleQuickDepartmentSelect(e.target.value as DepartmentId)
                      }
                      className="appearance-none bg-transparent pr-5 py-0.5 text-sm sm:text-[15px] font-semibold text-slate-100 focus:outline-none cursor-pointer max-w-[240px] sm:max-w-[300px] truncate"
                    >
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept.id} value={dept.id} className="bg-[#0B1B36] text-white">
                          {dept.nameBn}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-cyan-300/80 pointer-events-none -ml-4 shrink-0" />
                  </label>

                  <span className="text-slate-500 hidden sm:inline" aria-hidden="true">
                    ·
                  </span>

                  <label className="relative min-h-[44px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-white/10 border border-transparent hover:border-white/15 transition-colors cursor-pointer">
                    <GraduationCap className="w-4 h-4 text-cyan-300 shrink-0" />
                    <span className="sr-only">সেমিস্টার নির্বাচন করুন</span>
                    <select
                      aria-label="সেমিস্টার নির্বাচন করুন"
                      value={semester}
                      disabled={saving}
                      onChange={(e) =>
                        void handleQuickSemesterSelect(Number(e.target.value) as SemesterNumber)
                      }
                      className="appearance-none bg-transparent pr-5 py-0.5 text-sm sm:text-[15px] font-semibold text-white focus:outline-none cursor-pointer"
                    >
                      {([1, 2, 3, 4, 5, 6, 7, 8] as SemesterNumber[]).map((s) => (
                        <option key={s} value={s} className="bg-[#0B1B36] text-white">
                          {SEMESTER_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-cyan-300/80 pointer-events-none -ml-4 shrink-0" />
                  </label>
                </div>
              </div>
            )}

            {statusError && (
              <p className="text-xs text-red-300 pt-0.5">{statusError}</p>
            )}
            {statusSuccess && (
              <p className="text-xs text-emerald-300 pt-0.5">{statusSuccess}</p>
            )}
          </div>
        </div>

        {/* Bottom Three Action Buttons */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onOpenPdfLibrary}
            className="col-span-2 sm:col-span-1 min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span>আমার PDF লাইব্রেরি</span>
          </button>

          <button
            type="button"
            onClick={onOpenFormulaHub}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm font-medium backdrop-blur-xs transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <Sigma className="w-4 h-4 shrink-0" />
            <span>ফর্মুলা হাব</span>
          </button>

          <button
            type="button"
            onClick={onOpenStudyTimer}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm font-medium backdrop-blur-xs transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>স্টাডি টাইমার</span>
          </button>
        </div>
      </div>
    </section>
  );
};

