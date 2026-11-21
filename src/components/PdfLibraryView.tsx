import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Download,
  Edit3,
  Eye,
  FileText,
  HardDrive,
  Lock,
  LogIn,
  Plus,
  Search,
  Trash2,
  Upload,
  WifiOff,
  X,
} from 'lucide-react';
import { bi } from '../i18n/translations';
import {
  getActiveAccessToken,
  isSupabaseConfigured,
  isSupabaseMissingRelationError,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  supabase,
} from '../lib/supabaseClient';
import { offlineDb } from '../services/offlineDb';
import { AppView, AuthUser, LanguageMode, OfflinePdfRecord, UserPdfRecord } from '../types/study';
import { formatDateBn, toBnDigits } from '../utils/formatBn';

const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB

interface PdfLibraryViewProps {
  language: LanguageMode;
  currentUser: AuthUser | null;
  isOnline: boolean;
  onNavigate: (view: AppView) => void;
  onTrackRecentPdf: (pdfId: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function verifyPdfMagicBytes(file: File): Promise<boolean> {
  try {
    const slice = await file.slice(0, 5).text();
    return slice === '%PDF-';
  } catch {
    return false;
  }
}

export const PdfLibraryView: React.FC<PdfLibraryViewProps> = ({
  language,
  currentUser,
  isOnline,
  onNavigate,
  onTrackRecentPdf,
}) => {
  const [cloudPdfs, setCloudPdfs] = useState<UserPdfRecord[]>([]);
  const [offlinePdfs, setOfflinePdfs] = useState<OfflinePdfRecord[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [migrationMissing, setMigrationMissing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'size'>('newest');

  // Upload Drawer / Form State
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Rename State
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Reader Modal State
  const [readerDoc, setReaderDoc] = useState<{
    title: string;
    url: string;
    isBlobUrl: boolean;
    filename: string;
  } | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const isSupabaseUser = Boolean(
    isSupabaseConfigured && supabase && currentUser && !currentUser.id.startsWith('usr-')
  );

  const showToast = (msg: string) => {
    setErrorMsg(null);
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(null), 3500);
  };

  const loadOfflineVault = useCallback(async () => {
    const items = await offlineDb.listOfflinePdfs();
    setOfflinePdfs(items);
  }, []);

  const loadCloudPdfs = useCallback(async () => {
    if (!isSupabaseUser || !supabase || !currentUser || !isOnline) return;
    setLoadingList(true);
    setMigrationMissing(false);
    try {
      const { data, error } = await supabase
        .from('user_pdfs')
        .select('id, user_id, custom_title, original_filename, storage_path, file_size_bytes, mime_type, created_at, updated_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) {
        if (isSupabaseMissingRelationError(error)) {
          setMigrationMissing(true);
        } else {
          setErrorMsg(error.message);
        }
        return;
      }

      const mapped: UserPdfRecord[] = (data ?? []).map((row) => ({
        id: String(row.id),
        userId: String(row.user_id),
        customTitle: String(row.custom_title),
        originalFilename: String(row.original_filename),
        storagePath: String(row.storage_path),
        fileSizeBytes: Number(row.file_size_bytes),
        mimeType: String(row.mime_type || 'application/pdf'),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }));
      setCloudPdfs(mapped);
    } finally {
      setLoadingList(false);
    }
  }, [currentUser, isOnline, isSupabaseUser]);

  useEffect(() => {
    void loadOfflineVault();
    void loadCloudPdfs();
  }, [loadOfflineVault, loadCloudPdfs]);

  // Cleanup blob URL when reader closes
  useEffect(() => {
    return () => {
      if (readerDoc?.isBlobUrl) {
        URL.revokeObjectURL(readerDoc.url);
      }
    };
  }, [readerDoc]);

  const handleFilePicked = async (file: File | null) => {
    setErrorMsg(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const lower = file.name.toLowerCase();
    if (file.type !== 'application/pdf' && !lower.endsWith('.pdf')) {
      setErrorMsg(
        bi(language, 'শুধুমাত্র বৈধ PDF (.pdf) ফাইল আপলোড করা যাবে।', 'Only valid PDF (.pdf) files are allowed.')
      );
      setSelectedFile(null);
      return;
    }

    if (file.size <= 0 || file.size > MAX_PDF_BYTES) {
      setErrorMsg(
        bi(
          language,
          'PDF ফাইলের আকার ৫০ MB-এর কম হতে হবে।',
          'PDF file size must be between 1 byte and 50 MB.'
        )
      );
      setSelectedFile(null);
      return;
    }

    const validHeader = await verifyPdfMagicBytes(file);
    if (!validHeader) {
      setErrorMsg(
        bi(
          language,
          'ফাইলটি সঠিক PDF ফরম্যাটে নেই (%PDF- হেডার পাওয়া যায়নি)।',
          'File does not have a valid PDF signature (%PDF- header missing).'
        )
      );
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    if (!customTitle.trim()) {
      setCustomTitle(file.name.replace(/\.pdf$/i, '').slice(0, 120));
    }
  };

  const uploadPdfWithProgress = (
    storagePath: string,
    file: File,
    accessToken: string
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const encodedPath = storagePath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      const endpoint = `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/user-pdfs/${encodedPath}`;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);
      xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.setRequestHeader('Content-Type', 'application/pdf');
      xhr.setRequestHeader('x-upsert', 'false');

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          setUploadProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100);
          resolve();
        } else {
          let detail = `Upload failed (${xhr.status})`;
          try {
            const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string };
            detail = parsed.message || parsed.error || detail;
          } catch {
            // keep default message
          }
          reject(new Error(detail));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during PDF upload.'));
      xhr.send(file);
    });
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!selectedFile) {
      setErrorMsg(bi(language, 'একটি PDF ফাইল নির্বাচন করুন।', 'Please select a PDF file.'));
      return;
    }
    const cleanTitle = customTitle.trim();
    if (cleanTitle.length < 2) {
      setErrorMsg(bi(language, 'বই বা ডকুমেন্টের নাম লিখুন।', 'Please enter a document title.'));
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // If signed into Supabase Cloud, upload to private Storage bucket `user-pdfs` + `user_pdfs` table
      if (isSupabaseUser && supabase && currentUser) {
        if (!isOnline) {
          throw new Error(
            bi(
              language,
              'ক্লাউডে PDF আপলোড করতে ইন্টারনেট সংযোগ প্রয়োজন।',
              'Internet connection is required for private cloud PDF upload.'
            )
          );
        }
        const token = await getActiveAccessToken();
        if (!token) {
          throw new Error('Authentication session expired. Please sign in again.');
        }

        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${currentUser.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;

        await uploadPdfWithProgress(storagePath, selectedFile, token);

        const { error: insertError } = await supabase.from('user_pdfs').insert({
          user_id: currentUser.id,
          custom_title: cleanTitle,
          original_filename: selectedFile.name,
          storage_path: storagePath,
          file_size_bytes: selectedFile.size,
          mime_type: 'application/pdf',
        });

        if (insertError) {
          // Roll back storage file on metadata failure
          await supabase.storage.from('user-pdfs').remove([storagePath]);
          throw new Error(insertError.message);
        }

        await loadCloudPdfs();
        showToast(bi(language, 'PDF নিরাপদে ক্লাউড লাইব্রেরিতে সংরক্ষিত হয়েছে।', 'PDF uploaded to your private cloud library.'));
      } else {
        // Offline / Local Vault fallback when user hasn't signed into Supabase yet
        const record: OfflinePdfRecord = {
          id: `local-pdf-${Date.now()}`,
          title: cleanTitle,
          sourceType: 'pdf-blob',
          mimeType: 'application/pdf',
          sizeBytes: selectedFile.size,
          blob: selectedFile,
          savedAt: new Date().toISOString(),
        };
        setUploadProgress(80);
        await offlineDb.saveOfflinePdf(record);
        setUploadProgress(100);
        await loadOfflineVault();
        showToast(
          bi(
            language,
            'PDF এই ডিভাইসের অফলাইন ভল্টে সেভ হয়েছে। ক্লাউড সিঙ্কের জন্য Supabase অ্যাকাউন্টে লগইন করুন।',
            'Saved to device Offline Vault. Sign in with Supabase for cross-device private cloud storage.'
          )
        );
      }

      setSelectedFile(null);
      setCustomTitle('');
      setUploadOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleOpenCloudPdf = async (pdf: UserPdfRecord) => {
    if (!supabase) return;
    setOpeningId(pdf.id);
    setErrorMsg(null);
    try {
      const offlineCached = await offlineDb.getOfflinePdf(pdf.id);
      if (!isOnline && offlineCached?.blob) {
        const blobUrl = URL.createObjectURL(offlineCached.blob);
        onTrackRecentPdf(pdf.id);
        setReaderDoc({
          title: pdf.customTitle,
          url: blobUrl,
          isBlobUrl: true,
          filename: `${pdf.customTitle}.pdf`,
        });
        return;
      }

      const { data, error } = await supabase.storage
        .from('user-pdfs')
        .createSignedUrl(pdf.storagePath, 3600);

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || 'Unable to generate secure PDF link.');
      }

      onTrackRecentPdf(pdf.id);
      setReaderDoc({
        title: pdf.customTitle,
        url: data.signedUrl,
        isBlobUrl: false,
        filename: `${pdf.customTitle}.pdf`,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to open PDF');
    } finally {
      setOpeningId(null);
    }
  };

  const handleDownloadCloudPdf = async (pdf: UserPdfRecord) => {
    if (!supabase) return;
    setOpeningId(pdf.id);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.storage.from('user-pdfs').download(pdf.storagePath);
      if (error || !data) {
        throw new Error(error?.message || 'Download failed.');
      }
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pdf.customTitle.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setOpeningId(null);
    }
  };

  const handleCacheOfflineCloudPdf = async (pdf: UserPdfRecord) => {
    if (!supabase) return;
    setOpeningId(pdf.id);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.storage.from('user-pdfs').download(pdf.storagePath);
      if (error || !data) throw new Error(error?.message || 'Unable to cache offline.');
      await offlineDb.saveOfflinePdf({
        id: pdf.id,
        title: pdf.customTitle,
        sourceType: 'pdf-blob',
        mimeType: 'application/pdf',
        sizeBytes: pdf.fileSizeBytes,
        blob: data,
        savedAt: new Date().toISOString(),
      });
      await loadOfflineVault();
      showToast(bi(language, 'অফলাইন পড়ার জন্য ডিভাইসে সেভ হয়েছে।', 'Saved for offline reading on this device.'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save offline copy');
    } finally {
      setOpeningId(null);
    }
  };

  const handleRenameCloudPdf = async (pdf: UserPdfRecord) => {
    const trimmed = renameValue.trim();
    if (!supabase || !currentUser || trimmed.length < 2) return;
    try {
      const { error } = await supabase
        .from('user_pdfs')
        .update({ custom_title: trimmed, updated_at: new Date().toISOString() })
        .eq('id', pdf.id)
        .eq('user_id', currentUser.id);
      if (error) throw new Error(error.message);
      setRenamingId(null);
      await loadCloudPdfs();
      showToast(bi(language, 'PDF নাম পরিবর্তন করা হয়েছে।', 'PDF renamed.'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const handleDeleteCloudPdf = async (pdf: UserPdfRecord) => {
    if (!supabase || !currentUser) return;
    try {
      await supabase.storage.from('user-pdfs').remove([pdf.storagePath]);
      const { error } = await supabase
        .from('user_pdfs')
        .delete()
        .eq('id', pdf.id)
        .eq('user_id', currentUser.id);
      if (error) throw new Error(error.message);
      await offlineDb.deleteOfflinePdf(pdf.id).catch(() => {});
      await Promise.all([loadCloudPdfs(), loadOfflineVault()]);
      showToast(bi(language, 'PDF মুছে ফেলা হয়েছে।', 'PDF deleted permanently.'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleOpenOfflineRecord = (rec: OfflinePdfRecord) => {
    if (!rec.blob) return;
    const url = URL.createObjectURL(rec.blob);
    onTrackRecentPdf(rec.id);
    setReaderDoc({
      title: rec.title,
      url,
      isBlobUrl: true,
      filename: `${rec.title}.pdf`,
    });
  };

  const handleDownloadOfflineRecord = (rec: OfflinePdfRecord) => {
    if (!rec.blob) return;
    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rec.title.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredCloudPdfs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = cloudPdfs.filter(
      (p) =>
        !q ||
        p.customTitle.toLowerCase().includes(q) ||
        p.originalFilename.toLowerCase().includes(q)
    );
    if (sortBy === 'name') {
      return [...list].sort((a, b) => a.customTitle.localeCompare(b.customTitle));
    }
    if (sortBy === 'size') {
      return [...list].sort((a, b) => b.fileSizeBytes - a.fileSizeBytes);
    }
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [cloudPdfs, searchQuery, sortBy]);

  const localOnlyOfflinePdfs = useMemo(() => {
    const cloudIds = new Set(cloudPdfs.map((c) => c.id));
    const q = searchQuery.trim().toLowerCase();
    return offlinePdfs.filter(
      (o) => (!cloudIds.has(o.id) || !isOnline) && (!q || o.title.toLowerCase().includes(q))
    );
  }, [cloudPdfs, offlinePdfs, isOnline, searchQuery]);

  const offlineIdsSet = useMemo(() => new Set(offlinePdfs.map((o) => o.id)), [offlinePdfs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-600 dark:text-cyan-400">
            <Lock className="w-3.5 h-3.5" />
            <span>
              {bi(language, 'ব্যক্তিগত এনক্রিপ্টেড লাইব্রেরি', 'Private Per-User Cloud Library')}
            </span>
          </div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
            {bi(language, 'আমার PDF লাইব্রেরি', 'My PDF Library')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {bi(
              language,
              `ক্লাউড ফাইল: ${toBnDigits(cloudPdfs.length)}টি · অফলাইন কপি: ${toBnDigits(offlinePdfs.length)}টি · সর্বোচ্চ ৫০ MB/ফাইল`,
              `${cloudPdfs.length} cloud files · ${offlinePdfs.length} offline copies · Max 50 MB per PDF`
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setUploadOpen((prev) => !prev);
            setErrorMsg(null);
          }}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{bi(language, 'নতুন PDF আপলোড করুন', 'Upload New PDF')}</span>
        </button>
      </div>

      {/* Supabase Auth / Migration Status Notice */}
      {!isSupabaseUser && (
        <div className="p-4 rounded-2xl bg-cyan-500/8 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {bi(
                language,
                'ব্যক্তিগত ক্লাউড PDF সিঙ্ক চালু করতে সাইন ইন করুন',
                'Sign in to sync your private PDFs to Supabase Cloud'
              )}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {bi(
                language,
                'লগইন ছাড়াই আপনি এখন ডিভাইসের অফলাইন ভল্টে PDF সংরক্ষণ ও পড়তে পারবেন। লগইন করলে আপনার PDF গুলো শুধু আপনার অ্যাকাউন্টেই নিরাপদ থাকবে।',
                'You can store and read PDFs in your device Offline Vault right now, or sign in to save them privately in your Supabase Cloud account.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shrink-0"
          >
            <LogIn className="w-4 h-4" />
            <span>{bi(language, 'সাইন ইন / অ্যাকাউন্ট', 'Sign In')}</span>
          </button>
        </div>
      )}

      {migrationMissing && (
        <div className="p-4 rounded-2xl bg-amber-500/12 border border-amber-500/40 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-amber-700 dark:text-amber-300">
              Supabase Database Migration Required
            </p>
            <p className="text-slate-700 dark:text-slate-300">
              Run <code className="font-mono">supabase/migrations/002_polytechnic_hub_v2_upgrade.sql</code> in your Supabase SQL Editor to create the <code className="font-mono">user_pdfs</code> table, <code className="font-mono">user-pdfs</code> storage bucket, and RLS policies.
            </p>
          </div>
        </div>
      )}

      {!isOnline && (
        <div className="p-3 rounded-xl bg-amber-500/12 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            {bi(
              language,
              'আপনি অফলাইনে আছেন। নিচে ডিভাইসে সংরক্ষিত অফলাইন PDF গুলো পড়তে পারবেন।',
              'You are offline. Cached device PDFs remain readable below.'
            )}
          </span>
        </div>
      )}

      {statusMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-500/12 border border-red-500/30 text-xs text-red-600 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Upload Form Panel */}
      {uploadOpen && (
        <form
          onSubmit={(e) => void handleUploadSubmit(e)}
          className="rounded-2xl bg-white dark:bg-[#111827] border border-cyan-500/40 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-cyan-500" />
              <span>
                {bi(
                  language,
                  'মোবাইল বা কম্পিউটার থেকে PDF আপলোড করুন',
                  'Upload PDF from Mobile or Computer'
                )}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => setUploadOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {bi(language, '১. PDF ফাইল নির্বাচন করুন (সর্বোচ্চ ৫০ MB)', '1. Choose PDF File (Max 50 MB)')}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                disabled={uploading}
                onChange={(e) => void handleFilePicked(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-cyan-500/15 file:text-cyan-700 dark:file:text-cyan-300 hover:file:bg-cyan-500/25 cursor-pointer"
              />
              {selectedFile && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  {selectedFile.name} · {formatBytes(selectedFile.size)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {bi(language, '২. কাস্টম বই / ডকুমেন্টের নাম দিন', '2. Custom Book / Document Title')}
              </label>
              <input
                type="text"
                required
                disabled={uploading}
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder={bi(
                  language,
                  'যেমন: পাওয়ার প্ল্যান্ট ইঞ্জিনিয়ারিং নোট',
                  'e.g. Power Plant Engineering Notes'
                )}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {uploading && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  {bi(language, 'আপলোড হচ্ছে...', 'Uploading PDF...')}
                </span>
                <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                  {uploadProgress}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => setUploadOpen(false)}
              className="min-h-[40px] px-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              {bi(language, 'বাতিল', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={uploading || !selectedFile || !customTitle.trim()}
              className="min-h-[40px] inline-flex items-center gap-2 px-5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>
                {uploading
                  ? bi(language, 'সংরক্ষণ হচ্ছে...', 'Saving...')
                  : bi(language, 'আপলোড ও সেভ করুন', 'Upload & Save')}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Search & Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={bi(language, 'আপনার PDF খুঁজুন...', 'Search your uploaded PDFs...')}
            className="w-full min-h-[42px] pl-10 pr-3.5 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-sm"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'newest' | 'name' | 'size')}
          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-semibold"
        >
          <option value="newest">{bi(language, 'সর্বশেষ আপলোড', 'Newest First')}</option>
          <option value="name">{bi(language, 'নাম অনুযায়ী (A-Z)', 'Title (A-Z)')}</option>
          <option value="size">{bi(language, 'ফাইল সাইজ অনুযায়ী', 'Largest First')}</option>
        </select>
      </div>

      {/* Private Cloud PDFs Grid */}
      {isSupabaseUser && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-500" />
            <span>{bi(language, 'আমার ক্লাউড PDF সমূহ', 'My Cloud PDFs')}</span>
          </h2>

          {loadingList ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              {bi(language, 'PDF তালিকা লোড হচ্ছে...', 'Loading your private PDF library...')}
            </div>
          ) : filteredCloudPdfs.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <FileText className="w-9 h-9 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {searchQuery
                  ? bi(language, 'খোঁজা নাম অনুযায়ী কোনো PDF পাওয়া যায়নি।', 'No PDFs matched your search.')
                  : bi(
                      language,
                      'আপনার ব্যক্তিগত লাইব্রেরিতে এখনো কোনো PDF আপলোড করা হয়নি।',
                      'Your private PDF library is empty. Upload your study books or handouts to begin.'
                    )}
              </p>
              {!uploadOpen && (
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  <span>{bi(language, 'প্রথম PDF আপলোড করুন', 'Upload First PDF')}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCloudPdfs.map((pdf) => {
                const isRenaming = renamingId === pdf.id;
                const isCachedOffline = offlineIdsSet.has(pdf.id);
                return (
                  <article
                    key={pdf.id}
                    className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/12 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {formatBytes(pdf.fileSizeBytes)} · {formatDateBn(pdf.createdAt)}
                        </span>
                      </div>

                      {isRenaming ? (
                        <div className="flex items-center gap-1.5 pt-1">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="flex-1 min-h-[36px] px-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-cyan-500 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => void handleRenameCloudPdf(pdf)}
                            className="min-h-[36px] px-2.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId(null)}
                            className="min-h-[36px] px-2 rounded-lg text-slate-400"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                          {pdf.customTitle}
                        </h3>
                      )}

                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {pdf.originalFilename}
                        {isCachedOffline ? ' · Offline Ready' : ''}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={openingId === pdf.id}
                        onClick={() => void handleOpenCloudPdf(pdf)}
                        className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-60"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>
                          {openingId === pdf.id
                            ? bi(language, 'খুলছে...', 'Opening...')
                            : bi(language, 'পড়ুন', 'Read')}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDownloadCloudPdf(pdf)}
                        aria-label="Download PDF"
                        title={bi(language, 'ডাউনলোড', 'Download')}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Download className="w-4 h-4" />
                      </button>

                      {!isCachedOffline && (
                        <button
                          type="button"
                          onClick={() => void handleCacheOfflineCloudPdf(pdf)}
                          aria-label="Save offline copy"
                          title={bi(language, 'অফলাইন সেভ', 'Save Offline')}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <HardDrive className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(pdf.id);
                          setRenameValue(pdf.customTitle);
                        }}
                        aria-label="Rename PDF"
                        title={bi(language, 'নাম পরিবর্তন', 'Rename')}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDeleteCloudPdf(pdf)}
                        aria-label="Delete PDF"
                        title={bi(language, 'মুছুন', 'Delete')}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Local / Offline Vault PDFs */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-emerald-500" />
          <span>
            {bi(language, 'অফলাইন PDF ভল্ট (এই ডিভাইস)', 'Device Offline PDF Vault')}
          </span>
        </h2>

        {localOnlyOfflinePdfs.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
            {bi(
              language,
              'এই ডিভাইসে এখনো কোনো অফলাইন PDF ক্যাশ করা হয়নি।',
              'No device-cached PDFs yet. Upload a PDF or save any cloud PDF for offline access.'
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {localOnlyOfflinePdfs.map((rec) => (
              <article
                key={rec.id}
                className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3"
              >
                <div>
                  <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                    Offline · {formatBytes(rec.sizeBytes)} · {formatDateBn(rec.savedAt)}
                  </p>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1 line-clamp-2">
                    {rec.title}
                  </h3>
                </div>
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!rec.blob}
                    onClick={() => handleOpenOfflineRecord(rec)}
                    className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{bi(language, 'পড়ুন', 'Read')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!rec.blob}
                    onClick={() => handleDownloadOfflineRecord(rec)}
                    aria-label="Download offline PDF"
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void offlineDb.deleteOfflinePdf(rec.id).then(loadOfflineVault)}
                    aria-label="Remove offline PDF"
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* In-App PDF Reader Modal */}
      {readerDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
          onClick={() => setReaderDoc(null)}
        >
          <div
            className="w-full max-w-5xl h-[90vh] rounded-2xl bg-white dark:bg-[#0D1426] border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {readerDoc.title}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{readerDoc.filename}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={readerDoc.url}
                  download={readerDoc.filename}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{bi(language, 'ডাউনলোড', 'Download')}</span>
                </a>
                <button
                  type="button"
                  onClick={() => setReaderDoc(null)}
                  aria-label="Close reader"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <iframe
              src={readerDoc.url}
              title={readerDoc.title}
              className="flex-1 w-full bg-slate-950"
            />
          </div>
        </div>
      )}
    </div>
  );
};
