import React, { useMemo, useState } from 'react';
import {
  Download,
  Edit3,
  ExternalLink,
  FileText,
  HardDrive,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { DEPARTMENTS, SUBJECTS_CATALOG } from '../data/curriculum';
import { bi } from '../i18n/translations';
import { LanguageMode, SharedPdfNote, StudyNote } from '../types/study';
import { formatDateBn, toBnDigits } from '../utils/formatBn';

interface NotesViewProps {
  notes: StudyNote[];
  sharedNotes: SharedPdfNote[];
  language: LanguageMode;
  onCreateNote: (title: string, content: string, subjectId?: string, subjectName?: string) => void;
  onUpdateNote: (id: string, title: string, content: string, subjectId?: string, subjectName?: string) => void;
  onDeleteNote: (id: string) => void;
  onTogglePin: (id: string) => void;
  onOpenOfflineVault: () => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  sharedNotes,
  language,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onTogglePin,
  onOpenOfflineVault,
}) => {
  const [tab, setTab] = useState<'personal' | 'shared'>('personal');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...notes]
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .filter((note) => {
        if (!q) return true;
        return (
          note.title.toLowerCase().includes(q) ||
          note.content.toLowerCase().includes(q) ||
          (note.subjectName ?? '').toLowerCase().includes(q)
        );
      });
  }, [notes, searchQuery]);

  const filteredShared = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sharedNotes;
    return sharedNotes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.summary.toLowerCase().includes(q) ||
        n.subjectCode.toLowerCase().includes(q)
    );
  }, [sharedNotes, searchQuery]);

  const openCreateModal = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setSubjectId('');
    setIsModalOpen(true);
  };

  const openEditModal = (note: StudyNote) => {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setSubjectId(note.subjectId ?? '');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    const matchedSubj = SUBJECTS_CATALOG.find((s) => s.id === subjectId);
    if (editingId) {
      onUpdateNote(editingId, title.trim(), content.trim(), matchedSubj?.id, matchedSubj?.nameBn);
    } else {
      onCreateNote(title.trim(), content.trim(), matchedSubj?.id, matchedSubj?.nameBn);
    }
    setIsModalOpen(false);
  };

  const handleExportNote = (note: StudyNote) => {
    const body = `${note.title}\n${note.subjectName ? `Subject: ${note.subjectName}\n` : ''}Date: ${formatDateBn(note.updatedAt)}\n------------------------------------\n\n${note.content}`;
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${note.title.slice(0, 30).replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
            {bi(language, 'নোটস ও শেয়ার্ড PDF ভল্ট', 'Notes & Shared PDF Vault')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {bi(
              language,
              `মোট ${toBnDigits(notes.length)}টি ব্যক্তিগত নোট · ${toBnDigits(sharedNotes.length)}টি শেয়ার্ড PDF নোট`,
              `${notes.length} personal notes · ${sharedNotes.length} shared PDF handouts`
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenOfflineVault}
            className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <HardDrive className="w-4 h-4 text-cyan-500" />
            <span>{bi(language, 'অফলাইন PDF ভল্ট', 'Offline PDF Vault')}</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>{bi(language, 'নতুন নোট লিখুন', 'New Note')}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab('personal')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
              tab === 'personal'
                ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {bi(language, 'আমার নোটস', 'My Notes')} ({notes.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('shared')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
              tab === 'shared'
                ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {bi(language, 'শেয়ার্ড স্টাডি PDF', 'Shared Study PDFs')} ({sharedNotes.length})
          </button>
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={bi(language, 'নোট খুঁজুন...', 'Search notes & PDFs...')}
            className="w-full min-h-[42px] pl-10 pr-3.5 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-sm"
          />
        </div>
      </div>

      {tab === 'shared' ? (
        filteredShared.length === 0 ? (
          <div className="p-10 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500">
            {bi(
              language,
              'Admin এখনো কোনো শেয়ার্ড স্টাডি PDF যোগ করেননি। আপনার ব্যক্তিগত নোটস এবং অফলাইন PDF ভল্ট ব্যবহার করুন।',
              'No Admin shared PDFs published yet. Use My Notes or import PDFs into the Offline Vault.'
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredShared.map((item) => {
              const deptName = DEPARTMENTS.find((d) => d.id === item.department);
              return (
                <article
                  key={item.id}
                  className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3"
                >
                  <div>
                    <p className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
                      {deptName?.shortName || item.department} · Sem {item.semester}
                      {item.subjectCode ? ` · ${item.subjectCode}` : ''}
                    </p>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                      {item.summary}
                    </p>
                  </div>
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    {item.pdfUrl ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setPreviewPdfUrl(item.pdfUrl)}
                          className="flex-1 min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>{bi(language, 'PDF প্রিভিউ', 'Preview PDF')}</span>
                        </button>
                        {item.downloadPermitted && (
                          <a
                            href={item.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="min-h-[36px] px-3 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-slate-500">Summary handout only</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : filteredNotes.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {searchQuery
              ? bi(language, 'কোনো নোট পাওয়া যায়নি।', 'No notes matched your search.')
              : bi(language, 'এখনো কোনো নোট তৈরি করা হয়নি।', 'No personal notes created yet.')}
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>{bi(language, 'প্রথম নোট তৈরি করুন', 'Create First Note')}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => (
            <article
              key={note.id}
              className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {note.subjectName ? `${note.subjectName} · ` : ''}
                    {formatDateBn(note.updatedAt)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onTogglePin(note.id)}
                    aria-label="Pin note"
                    className={`min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg ${
                      note.pinned
                        ? 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10'
                        : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Pin className="w-4 h-4" />
                  </button>
                </div>

                <h2 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                  {note.title}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line line-clamp-5 leading-relaxed">
                  {note.content}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => handleExportNote(note)}
                  aria-label="Download note"
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(note)}
                  aria-label="Edit note"
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteNote(note.id)}
                  aria-label="Delete note"
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Create/Edit Note Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingId ? bi(language, 'নোট সম্পাদনা', 'Edit Note') : bi(language, 'নতুন নোট', 'New Note')}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={bi(language, 'নোটের শিরোনাম', 'Note title')}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
              />

              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
              >
                <option value="">General Note</option>
                {[...SUBJECTS_CATALOG]
                  .sort((a, b) => a.code.localeCompare(b.code))
                  .map((subj) => (
                    <option key={subj.id} value={subj.id}>
                      {subj.code} — {subj.nameBn}
                    </option>
                  ))}
              </select>

              <textarea
                rows={6}
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={bi(language, 'আপনার নোট বা সূত্র লিখুন...', 'Write study notes or formulas...')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="min-h-[40px] px-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
                >
                  {bi(language, 'বাতিল', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
                >
                  {bi(language, 'সংরক্ষণ করুন', 'Save Note')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shared PDF Preview Modal */}
      {previewPdfUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewPdfUrl(null)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl bg-white dark:bg-[#0D1426] border border-slate-200 dark:border-slate-800 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900 dark:text-white">PDF Preview</span>
              <button
                type="button"
                onClick={() => setPreviewPdfUrl(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <iframe src={previewPdfUrl} title="Shared PDF" className="w-full h-[70vh] bg-slate-950" />
          </div>
        </div>
      )}
    </div>
  );
};
