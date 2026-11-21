import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  FileText,
  NotebookPen,
  Plus,
  Printer,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import { DEPARTMENTS, SEMESTER_LABELS, getSubjectsForUser } from '../data/curriculum';
import { DepartmentId, SemesterNumber, StudyMaterial, StudyNote, Subject } from '../types/study';
import { formatDateBn, toBnDigits } from '../utils/formatBn';
import { CircuitDiagrams } from './CircuitDiagrams';

interface SubjectsViewProps {
  defaultDepartment: DepartmentId;
  defaultSemester: SemesterNumber;
  completedChapterIds: string[];
  notes: StudyNote[];
  onToggleChapter: (chapterId: string) => void;
  onAddSubjectNote: (subject: Subject, title: string, content: string) => void;
}

export const SubjectsView: React.FC<SubjectsViewProps> = ({
  defaultDepartment,
  defaultSemester,
  completedChapterIds,
  notes,
  onToggleChapter,
  onAddSubjectNote,
}) => {
  const [selectedDept, setSelectedDept] = useState<DepartmentId>(defaultDepartment);
  const [selectedSemester, setSelectedSemester] = useState<SemesterNumber>(defaultSemester);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [activeMaterial, setActiveMaterial] = useState<{ subject: Subject; material: StudyMaterial } | null>(null);

  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false);

  useEffect(() => {
    setSelectedDept(defaultDepartment);
    setSelectedSemester(defaultSemester);
    setActiveSubjectId(null);
  }, [defaultDepartment, defaultSemester]);

  const semesterSubjects = getSubjectsForUser(selectedDept, selectedSemester);
  const q = searchQuery.trim().toLowerCase();
  const filteredSubjects = q
    ? semesterSubjects.filter(
        (s) =>
          s.nameBn.toLowerCase().includes(q) ||
          (s.nameEn ?? '').toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q)
      )
    : semesterSubjects;

  const totalSemesterCredits = semesterSubjects.reduce((sum, s) => sum + s.credits, 0);
  const selectedDeptObj = DEPARTMENTS.find((d) => d.id === selectedDept);

  const activeSubject = semesterSubjects.find((s) => s.id === activeSubjectId) ?? null;

  const subjectNotes = activeSubject
    ? notes.filter((n) => n.subjectId === activeSubject.id)
    : [];

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSubject || !noteTitle.trim() || !noteContent.trim()) return;
    onAddSubjectNote(activeSubject, noteTitle.trim(), noteContent.trim());
    setNoteTitle('');
    setNoteContent('');
    setNoteSavedFeedback(true);
    window.setTimeout(() => setNoteSavedFeedback(false), 2500);
  };

  const handleDownloadMaterial = (subject: Subject, material: StudyMaterial) => {
    const lines = [
      `StudyMate — ডিপ্লোমা স্টাডি গাইড`,
      `বিষয়: ${subject.nameBn} (কোড: ${subject.code})`,
      `শিরোনাম: ${material.titleBn}`,
      `--------------------------------------------------`,
      ``,
      `সারসংক্ষেপ:`,
      material.summaryBn,
      ``,
      `গুরুত্বপূর্ণ পয়েন্টসমূহ:`,
      ...material.keyPointsBn.map((pt, idx) => `${idx + 1}. ${pt}`),
    ];

    if (material.formulas && material.formulas.length > 0) {
      lines.push('', 'প্রয়োজনীয় সূত্র / কোড:');
      material.formulas.forEach((f) => lines.push(`• ${f}`));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${subject.code}_${material.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (activeSubject) {
    const completedCount = activeSubject.chapters.filter((c) =>
      completedChapterIds.includes(c.id)
    ).length;
    const progressPct =
      activeSubject.chapters.length > 0
        ? Math.round((completedCount / activeSubject.chapters.length) * 100)
        : 0;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setActiveSubjectId(null)}
            className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>সব বিষয়ে ফিরে যান</span>
          </button>

          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            প্রবিধান {toBnDigits(activeSubject.probidhan ?? '2022')} · কোড: {toBnDigits(activeSubject.code)} · তত্ত্বীয়: {toBnDigits(activeSubject.theoryPeriods ?? 0)} · ব্যবহারিক: {toBnDigits(activeSubject.practicalPeriods ?? 0)} · ক্রেডিট: {toBnDigits(activeSubject.credits)} · অগ্রগতি: {toBnDigits(progressPct)}%
          </p>
        </div>

        <section className="p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
                {activeSubject.nameBn}
              </h1>
              {activeSubject.nameEn && (
                <p className="text-sm font-medium text-sky-600 dark:text-sky-400 mt-0.5">
                  {activeSubject.nameEn}
                </p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {selectedDeptObj?.nameBn} · {SEMESTER_LABELS[selectedSemester]} · মোট {toBnDigits(activeSubject.chapters.length)}টি অধ্যায়
              </p>
            </div>
            <div className="w-full sm:w-48">
              <div className="flex items-center justify-between text-xs mb-1.5 text-slate-600 dark:text-slate-300 tabular-nums">
                <span>অধ্যায় সম্পন্ন</span>
                <span>{toBnDigits(completedCount)}/{toBnDigits(activeSubject.chapters.length)}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chapters Checklist + Practical Guides + Circuit Diagrams */}
          <div className="lg:col-span-7 space-y-6">
            <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  অধ্যায়সমূহ (Chapters)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  পড়া শেষ হলে প্রতিটি অধ্যায়ে টিক চিহ্ন দিন
                </p>
              </div>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {activeSubject.chapters.map((chapter) => {
                  const done = completedChapterIds.includes(chapter.id);
                  return (
                    <li key={chapter.id}>
                      <button
                        type="button"
                        onClick={() => onToggleChapter(chapter.id)}
                        className="w-full min-h-[64px] px-5 py-4 flex items-start gap-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <span className="mt-0.5 shrink-0">
                          {done ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <Circle className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-semibold ${
                              done
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            অধ্যায় {toBnDigits(chapter.number)}: {chapter.titleBn}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {chapter.topicsBn.join(' · ')} · আনুমানিক {toBnDigits(chapter.estimatedMinutes)} মিনিট
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Circuit & Power System Diagrams */}
            {activeSubject.diagramTypes && activeSubject.diagramTypes.length > 0 && (
              <CircuitDiagrams types={activeSubject.diagramTypes} />
            )}

            {/* Practical Guides */}
            {activeSubject.practicalGuides && activeSubject.practicalGuides.length > 0 && (
              <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-sky-500 shrink-0" />
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      ব্যবহারিক ও ল্যাব গাইড (Practical Guides)
                    </h2>
                  </div>
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {activeSubject.practicalGuides.map((guide) => (
                    <div key={guide.id} className="p-5 space-y-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {guide.titleBn}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                          <strong>উদ্দেশ্য:</strong> {guide.objectiveBn}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          প্রয়োজনীয় যন্ত্রপাতি:
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                          {guide.apparatusBn.join(' · ')}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                          কার্যপদ্ধতি:
                        </p>
                        <ol className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                          {guide.stepsBn.map((step, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="font-semibold text-sky-500 tabular-nums">
                                {toBnDigits(idx + 1)}.
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-200">
                        <strong>সতর্কতা:</strong> {guide.precautionsBn.join(' ')}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Materials & Personal Notes */}
          <div className="lg:col-span-5 space-y-6">
            <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  স্টাডি ম্যাটেরিয়াল ও PDF গাইড
                </h2>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {activeSubject.materials.map((mat) => (
                  <div key={mat.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {mat.titleBn}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {mat.summaryBn}
                        </p>
                      </div>
                      <FileText className="w-4 h-4 text-sky-500 shrink-0 mt-1" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveMaterial({ subject: activeSubject, material: mat })}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
                      >
                        পড়ুন / PDF প্রিন্ট
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadMaterial(activeSubject, mat)}
                        className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>ডাউনলোড</span>
                      </button>
                      {mat.externalUrl && (
                        <a
                          href={mat.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>BTEB পোর্টাল</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <NotebookPen className="w-4 h-4 text-sky-500" />
                  <span>এই বিষয়ের ব্যক্তিগত নোটস</span>
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {toBnDigits(subjectNotes.length)}টি
                </span>
              </div>

              <form onSubmit={handleSaveNote} className="space-y-2.5">
                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="নোটের শিরোনাম লিখুন..."
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <textarea
                  rows={3}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="গুরুত্বপূর্ণ সূত্র বা পরীক্ষার নোট এখানে লিখুন..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="submit"
                    className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>নোট সংরক্ষণ করুন</span>
                  </button>
                  {noteSavedFeedback && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      নোট সংরক্ষিত হয়েছে
                    </span>
                  )}
                </div>
              </form>

              {subjectNotes.length > 0 && (
                <ul className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  {subjectNotes.map((n) => (
                    <li key={n.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{n.title}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-line">
                        {n.content}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1.5">{formatDateBn(n.updatedAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        {/* Material Reader / Printable PDF Modal */}
        {activeMaterial && (
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setActiveMaterial(null)}
          >
            <div
              className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 p-6 space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                    {activeMaterial.subject.nameBn} · কোড {toBnDigits(activeMaterial.subject.code)}
                  </p>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                    {activeMaterial.material.titleBn}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveMaterial(null)}
                  aria-label="বন্ধ করুন"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 no-print"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                {activeMaterial.material.summaryBn}
              </p>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  গুরুত্বপূর্ণ পয়েন্টসমূহ
                </h4>
                <ul className="space-y-2">
                  {activeMaterial.material.keyPointsBn.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                      <span className="text-sky-500 font-semibold tabular-nums">{toBnDigits(idx + 1)}.</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {activeMaterial.material.formulas && activeMaterial.material.formulas.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    সূত্র ও সিনট্যাক্স
                  </h4>
                  <div className="p-4 rounded-xl bg-slate-900 text-sky-300 font-mono text-xs space-y-1.5 border border-slate-800">
                    {activeMaterial.material.formulas.map((formula, idx) => (
                      <div key={idx}>{formula}</div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-end gap-3 no-print">
                <button
                  type="button"
                  onClick={() => handleDownloadMaterial(activeMaterial.subject, activeMaterial.material)}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Download className="w-4 h-4" />
                  <span>টেক্সট ফাইল</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold"
                >
                  <Printer className="w-4 h-4" />
                  <span>PDF হিসেবে প্রিন্ট / সেভ</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
            সেমিস্টারভিত্তিক বিষয়সমূহ
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            ৮টি ডিপ্লোমা ডিপার্টমেন্ট ও ১ম–৮ম সেমিস্টার অনুযায়ী অধ্যায়, ডায়াগ্রাম, ব্যবহারিক ও নোট দেখুন
          </p>
        </div>
      </div>

      {/* Department & Semester Filter Controls */}
      <section className="p-4 lg:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">ডিপার্টমেন্ট (৮টি প্রযুক্তি)</p>
          <div className="flex flex-wrap gap-2">
            {DEPARTMENTS.map((dept) => {
              const active = selectedDept === dept.id;
              return (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => setSelectedDept(dept.id)}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {dept.shortName} · {dept.nameBn}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">সেমিস্টার</p>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
            {([1, 2, 3, 4, 5, 6, 7, 8] as SemesterNumber[]).map((sem) => {
              const active = selectedSemester === sem;
              return (
                <button
                  key={sem}
                  type="button"
                  onClick={() => setSelectedSemester(sem)}
                  className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors tabular-nums ${
                    active
                      ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {toBnDigits(sem)}ম
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
            BTEB প্রবিধান ২০২২ · <strong className="text-slate-900 dark:text-white">{selectedDeptObj?.nameBn}</strong> · {SEMESTER_LABELS[selectedSemester]} · মোট {toBnDigits(semesterSubjects.length)}টি বই · {toBnDigits(totalSemesterCredits)} ক্রেডিট
          </p>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="বইয়ের নাম বা কোড খুঁজুন..."
              className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>
      </section>

      {/* Subject Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSubjects.length === 0 ? (
          <div className="md:col-span-2 p-8 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500 dark:text-slate-400">
            আপনার অনুসন্ধানের সাথে মিলে এমন কোনো বই পাওয়া যায়নি।
          </div>
        ) : (
          filteredSubjects.map((subject) => {
            const doneCount = subject.chapters.filter((ch) =>
              completedChapterIds.includes(ch.id)
            ).length;
            const pct =
              subject.chapters.length > 0
                ? Math.round((doneCount / subject.chapters.length) * 100)
                : 0;

            const extras: string[] = [];
            if (subject.materials.length > 0) extras.push(`${toBnDigits(subject.materials.length)}টি গাইড`);
            if (subject.practicalGuides && subject.practicalGuides.length > 0) extras.push('ব্যবহারিক গাইড');
            if (subject.diagramTypes && subject.diagramTypes.length > 0) extras.push('সার্কিট ডায়াগ্রাম');

            return (
              <button
                key={subject.id}
                type="button"
                onClick={() => setActiveSubjectId(subject.id)}
                className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-sky-500/60 text-left transition-colors flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    কোড {toBnDigits(subject.code)} · তত্ত্বীয় {toBnDigits(subject.theoryPeriods ?? 0)} · ব্যবহারিক {toBnDigits(subject.practicalPeriods ?? 0)} · {toBnDigits(subject.credits)} ক্রেডিট
                  </p>
                  <div className="flex items-start gap-2.5">
                    <BookOpen className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        {subject.nameBn}
                      </h2>
                      {subject.nameEn && (
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                          {subject.nameEn}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {toBnDigits(subject.chapters.length)}টি অধ্যায়{extras.length > 0 ? ` · ${extras.join(' · ')}` : ''}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                    <span>অধ্যায় সম্পন্ন</span>
                    <span>
                      {toBnDigits(doneCount)}/{toBnDigits(subject.chapters.length)} ({toBnDigits(pct)}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-sky-500 transition-all duration-200"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </section>
    </div>
  );
};
