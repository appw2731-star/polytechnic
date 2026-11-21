import React, { useMemo, useState } from 'react';
import {
  Atom,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Edit3,
  Heart,
  Plus,
  Search,
  Sigma,
  Trash2,
  X,
} from 'lucide-react';
import { MATHEMATICS_CHAPTERS, PHYSICS_CHAPTERS } from '../data/formulas';
import { bi } from '../i18n/translations';
import { apiClient } from '../services/apiClient';
import {
  AuthUser,
  FormulaItem,
  FormulaSubjectCategory,
  LanguageMode,
} from '../types/study';
import { toBnDigits } from '../utils/formatBn';
import { MathFormula } from './MathFormula';

interface FormulaHubViewProps {
  language: LanguageMode;
  formulas: FormulaItem[];
  favoriteFormulaIds: string[];
  currentUser: AuthUser | null;
  onToggleFavoriteFormula: (formulaId: string) => void;
  onRefreshFormulas: () => Promise<void>;
}

export const FormulaHubView: React.FC<FormulaHubViewProps> = ({
  language,
  formulas,
  favoriteFormulaIds,
  currentUser,
  onToggleFavoriteFormula,
  onRefreshFormulas,
}) => {
  const [category, setCategory] = useState<FormulaSubjectCategory>('physics');
  const [selectedChapter, setSelectedChapter] = useState<string>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedExampleIds, setExpandedExampleIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Admin quick add/edit modal inside Formula Hub
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFormula, setEditingFormula] = useState<FormulaItem | null>(null);
  const [fChapter, setFChapter] = useState(PHYSICS_CHAPTERS[0].id);
  const [fNameEn, setFNameEn] = useState('');
  const [fNameBn, setFNameBn] = useState('');
  const [fLatex, setFLatex] = useState('');
  const [fPlain, setFPlain] = useState('');
  const [fExpBn, setFExpBn] = useState('');
  const [fExpEn, setFExpEn] = useState('');
  const [fProbBn, setFProbBn] = useState('');
  const [fSolBn, setFSolBn] = useState('');
  const [saving, setSaving] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';
  const chapters = category === 'physics' ? PHYSICS_CHAPTERS : MATHEMATICS_CHAPTERS;

  const subjectFormulas = useMemo(
    () => formulas.filter((f) => f.subject === category),
    [formulas, category]
  );

  const filteredFormulas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return subjectFormulas.filter((f) => {
      if (selectedChapter !== 'all' && f.chapter !== selectedChapter) return false;
      if (favoritesOnly && !favoriteFormulaIds.includes(f.id)) return false;
      if (!q) return true;
      return (
        f.nameEn.toLowerCase().includes(q) ||
        f.nameBn.toLowerCase().includes(q) ||
        f.chapter.toLowerCase().includes(q) ||
        f.chapterBn.toLowerCase().includes(q) ||
        f.expressionPlain.toLowerCase().includes(q) ||
        f.explanationBn.toLowerCase().includes(q) ||
        f.explanationEn.toLowerCase().includes(q) ||
        f.symbols.some(
          (s) =>
            s.symbol.toLowerCase().includes(q) ||
            s.meaningEn.toLowerCase().includes(q) ||
            s.meaningBn.toLowerCase().includes(q)
        )
      );
    });
  }, [subjectFormulas, selectedChapter, favoritesOnly, favoriteFormulaIds, searchQuery]);

  const handleCategorySwitch = (next: FormulaSubjectCategory) => {
    setCategory(next);
    setSelectedChapter('all');
    setFChapter(next === 'physics' ? PHYSICS_CHAPTERS[0].id : MATHEMATICS_CHAPTERS[0].id);
  };

  const handleCopyFormula = async (item: FormulaItem) => {
    const textToCopy = `${language === 'en' ? item.nameEn : item.nameBn}: ${item.expressionPlain}\nLaTeX: ${item.expressionLatex}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore clipboard permission errors
    }
  };

  const openCreateModal = () => {
    setEditingFormula(null);
    setFChapter(chapters[0].id);
    setFNameEn('');
    setFNameBn('');
    setFLatex('');
    setFPlain('');
    setFExpBn('');
    setFExpEn('');
    setFProbBn('');
    setFSolBn('');
    setAdminError(null);
    setEditorOpen(true);
  };

  const openEditModal = (item: FormulaItem) => {
    setEditingFormula(item);
    setFChapter(item.chapter);
    setFNameEn(item.nameEn);
    setFNameBn(item.nameBn);
    setFLatex(item.expressionLatex);
    setFPlain(item.expressionPlain);
    setFExpBn(item.explanationBn);
    setFExpEn(item.explanationEn);
    setFProbBn(item.exampleProblemBn);
    setFSolBn(item.exampleSolutionBn);
    setAdminError(null);
    setEditorOpen(true);
  };

  const handleAdminSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAdminError(null);
    try {
      const chInfo = chapters.find((c) => c.id === fChapter);
      await apiClient.adminSaveFormula({
        id: editingFormula?.id,
        subject: category,
        chapter: fChapter,
        chapterBn: chInfo?.bn ?? fChapter,
        nameEn: fNameEn,
        nameBn: fNameBn || fNameEn,
        expressionLatex: fLatex,
        expressionPlain: fPlain || fLatex,
        symbols: editingFormula?.symbols ?? [],
        explanationBn: fExpBn || fExpEn,
        explanationEn: fExpEn || fExpBn,
        exampleProblemBn: fProbBn,
        exampleProblemEn: fProbBn,
        exampleSolutionBn: fSolBn,
        exampleSolutionEn: fSolBn,
      });
      await onRefreshFormulas();
      setEditorOpen(false);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAdminDelete = async (item: FormulaItem) => {
    try {
      await apiClient.adminDeleteFormula(item.subject, item.id);
      await onRefreshFormulas();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
            {bi(language, 'সম্পূর্ণ ফর্মুলা হাব', 'Complete Formula Hub')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {bi(
              language,
              `পদার্থবিজ্ঞান (১১ অধ্যায়) ও গণিত (১২ অধ্যায়) · মোট ${toBnDigits(formulas.length)}টি নির্ভুল সূত্র`,
              `Physics (11 chapters) & Mathematics (12 chapters) · ${formulas.length} verified formulas`
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => handleCategorySwitch('physics')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                category === 'physics'
                  ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Atom className="w-3.5 h-3.5" />
              <span>{bi(language, 'পদার্থবিজ্ঞান', 'Physics')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleCategorySwitch('mathematics')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                category === 'mathematics'
                  ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Sigma className="w-3.5 h-3.5" />
              <span>{bi(language, 'গণিত', 'Mathematics')}</span>
            </button>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              <span>{bi(language, 'সূত্র যোগ করুন', 'Add Formula')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Favorites Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={bi(
              language,
              'সূত্রের নাম, অধ্যায়, প্রতীক বা ব্যাখ্যা দিয়ে খুঁজুন...',
              'Search formula name, chapter, symbol, or explanation...'
            )}
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={() => setFavoritesOnly((prev) => !prev)}
          className={`min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold transition-colors shrink-0 ${
            favoritesOnly
              ? 'border-rose-500/50 bg-rose-500/12 text-rose-600 dark:text-rose-400'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-300'
          }`}
        >
          <Heart className={`w-4 h-4 ${favoritesOnly ? 'fill-current' : ''}`} />
          <span>{bi(language, 'প্রিয় সূত্রসমূহ', 'Favorites')}</span>
        </button>
      </div>

      {/* Chapter Filter Controls */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedChapter('all')}
          className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
            selectedChapter === 'all'
              ? 'border-cyan-500 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {bi(language, 'সকল অধ্যায়', 'All Chapters')} ({subjectFormulas.length})
        </button>
        {chapters.map((ch) => {
          const count = subjectFormulas.filter((f) => f.chapter === ch.id).length;
          const active = selectedChapter === ch.id;
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => setSelectedChapter(ch.id)}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                active
                  ? 'border-cyan-500 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {language === 'en' ? ch.en : ch.bn} ({count})
            </button>
          );
        })}
      </div>

      {/* Formulas Grid */}
      {filteredFormulas.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500">
          {bi(language, 'এই অধ্যায় বা সার্চে কোনো সূত্র পাওয়া যায়নি।', 'No formulas matched your current filter.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredFormulas.map((item) => {
            const isFav = favoriteFormulaIds.includes(item.id);
            const showExample = Boolean(expandedExampleIds[item.id]);
            const isCopied = copiedId === item.id;

            return (
              <article
                key={item.id}
                className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3.5">
                  {/* Title & Actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400">
                        {language === 'en' ? item.chapter : item.chapterBn}
                      </p>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                        {language === 'en' ? item.nameEn : item.nameBn}
                      </h2>
                      {language === 'bn' && item.nameEn !== item.nameBn && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{item.nameEn}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleCopyFormula(item)}
                        aria-label="Copy formula"
                        title={bi(language, 'সূত্র কপি করুন', 'Copy formula')}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400"
                      >
                        {isCopied ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleFavoriteFormula(item.id)}
                        aria-label="Favorite formula"
                        title={bi(language, 'প্রিয় তালিকায় রাখুন', 'Toggle favorite')}
                        className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border ${
                          isFav
                            ? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                            : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                      </button>

                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            aria-label="Edit formula"
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-cyan-500"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleAdminDelete(item)}
                            aria-label="Delete formula"
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* KaTeX Expression Box */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0A1020] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-cyan-300 overflow-x-auto">
                    <MathFormula latex={item.expressionLatex} displayMode />
                  </div>

                  {/* Short Explanation */}
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {language === 'en' ? item.explanationEn : item.explanationBn}
                  </p>

                  {/* Symbols Meaning */}
                  {item.symbols.length > 0 && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-3 space-y-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {bi(language, 'প্রতীক পরিচিতি', 'Symbol Definitions')}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                        {item.symbols.map((sym, idx) => (
                          <div key={idx} className="flex items-baseline gap-1.5">
                            <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 shrink-0">
                              {sym.symbol}
                            </span>
                            <span className="text-slate-700 dark:text-slate-300">
                              = {language === 'en' ? sym.meaningEn : sym.meaningBn}
                              {sym.unit ? ` (${sym.unit})` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Worked Example & Solution Toggle */}
                {(item.exampleProblemBn || item.exampleProblemEn) && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedExampleIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                      }
                      className="w-full min-h-[36px] flex items-center justify-between text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                    >
                      <span>{bi(language, 'উদাহরণ ও সমাধান দেখুন', 'Worked Example & Solution')}</span>
                      {showExample ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {showExample && (
                      <div className="mt-2.5 p-3.5 rounded-xl bg-cyan-500/8 border border-cyan-500/20 space-y-2 text-xs leading-relaxed">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {bi(language, 'সমস্যা: ', 'Problem: ')}
                          {language === 'en' ? item.exampleProblemEn : item.exampleProblemBn}
                        </p>
                        <p className="text-slate-700 dark:text-slate-300">
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {bi(language, 'সমাধান: ', 'Solution: ')}
                          </span>
                          {language === 'en' ? item.exampleSolutionEn : item.exampleSolutionBn}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Admin Add / Edit Formula Modal */}
      {isAdmin && editorOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEditorOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingFormula
                  ? `Edit ${category === 'physics' ? 'Physics' : 'Math'} Formula`
                  : `Add ${category === 'physics' ? 'Physics' : 'Math'} Formula`}
              </h2>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {adminError && (
              <div className="p-3 rounded-xl bg-red-500/12 border border-red-500/30 text-xs text-red-600 dark:text-red-300">
                {adminError}
              </div>
            )}

            <form onSubmit={(e) => void handleAdminSave(e)} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={fChapter}
                  onChange={(e) => setFChapter(e.target.value)}
                  className="min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.en} ({c.bn})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={fNameEn}
                  onChange={(e) => setFNameEn(e.target.value)}
                  placeholder="Formula Name (English)"
                  className="min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <input
                type="text"
                value={fNameBn}
                onChange={(e) => setFNameBn(e.target.value)}
                placeholder="Formula Name (Bangla)"
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={fLatex}
                  onChange={(e) => setFLatex(e.target.value)}
                  placeholder="LaTeX e.g. F = G \frac{m_1 m_2}{r^2}"
                  className="min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                />
                <input
                  type="text"
                  value={fPlain}
                  onChange={(e) => setFPlain(e.target.value)}
                  placeholder="Plain copyable e.g. F = G*m1*m2/r^2"
                  className="min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                />
              </div>

              {fLatex.trim() && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0A1020] border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] text-slate-500 mb-1">Live KaTeX Preview:</p>
                  <MathFormula latex={fLatex} displayMode />
                </div>
              )}

              <textarea
                rows={2}
                required
                value={fExpBn}
                onChange={(e) => setFExpBn(e.target.value)}
                placeholder="Short Explanation (Bangla)"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
              <textarea
                rows={2}
                value={fExpEn}
                onChange={(e) => setFExpEn(e.target.value)}
                placeholder="Short Explanation (English)"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
              <input
                type="text"
                value={fProbBn}
                onChange={(e) => setFProbBn(e.target.value)}
                placeholder="Worked Example Problem"
                className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
              <input
                type="text"
                value={fSolBn}
                onChange={(e) => setFSolBn(e.target.value)}
                placeholder="Worked Example Solution"
                className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[40px] px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Formula'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
