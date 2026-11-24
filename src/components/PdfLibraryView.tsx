import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Download,
  Edit3,
  Eye,
  FileText,
  Filter,
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
import { DEPARTMENTS, SEMESTER_LABELS, SEMESTER_LABELS_EN } from '../data/curriculum';
import { bi } from '../i18n/translations';
import { apiClient } from '../services/apiClient';
import {
  deletePdfMetadataFromFirestore,
  syncPdfMetadataToFirestore,
} from '../services/firestoreService';
import { offlineDb } from '../services/offlineDb';
import {
  AppView,
  AuthUser,
  DepartmentId,
  LanguageMode,
  OfflinePdfRecord,
  SemesterNumber,
  SharedPdfNote,
  UserPdfRecord,
} from '../types/study';
import { formatDateBn, toBnDigits } from '../utils/formatBn';
import {
  PdfReaderDocument,
  PdfReaderModal,
  prefetchPdfWorkerForOffline,
} from './PdfReaderModal';

const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB

interface PdfLibraryViewProps {
  language: LanguageMode;
  currentUser: AuthUser | null;
  sharedNotes: SharedPdfNote[];
  defaultDepartment: DepartmentId;
  defaultSemester: SemesterNumber;
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
  sharedNotes,
  defaultDepartment,
  defaultSemester,
  isOnline,
  onNavigate,
  onTrackRecentPdf,
}) => {
  const [cloudPdfs, setCloudPdfs] = useState<UserPdfRecord[]>([]);
  const [offlinePdfs, setOfflinePdfs] = useState<OfflinePdfRecord[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState<string>('all');
  const [filterSem, setFilterSem] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'size'>('newest');

  // Upload Drawer / Form State
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [uploadDept, setUploadDept] = useState<string>(defaultDepartment);
  const [uploadSem, setUploadSem] = useState<number>(defaultSemester);
  const [uploadSubject, setUploadSubject] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Inline Rename & Metadata Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDept, setEditDept] = useState<string>(defaultDepartment);
  const [editSem, setEditSem] = useState<number>(defaultSemester);

  // Reader Modal State
  const [readerDoc, setReaderDoc] = useState<PdfReaderDocument | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

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
    if (!currentUser || !isOnline) {
      setCloudPdfs([]);
      return;
    }
    setLoadingList(true);
    try {
      const res = await apiClient.getPdfs();
      setCloudPdfs(res.pdfs);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load PDFs');
    } finally {
      setLoadingList(false);
    }
  }, [currentUser, isOnline]);

  useEffect(() => {
    void loadOfflineVault();
    void loadCloudPdfs();
    if (isOnline) {
      void prefetchPdfWorkerForOffline();
    }
  }, [loadOfflineVault, loadCloudPdfs, isOnline]);

  const handleFilePicked = async (file: File | null) => {
    setErrorMsg(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const lower = file.name.toLowerCase();
    if (file.type !== 'application/pdf' && !lower.endsWith('.pdf')) {
      setErrorMsg(
        bi(
          language,
          'শুধুমাত্র বৈধ PDF (.pdf) ফাইল আপলোড করা যাবে।',
          'Only valid PDF (.pdf) files are allowed.'
        )
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
      // Read detached ArrayBuffer bytes upfront so the PDF is durably cached for offline reading
      const rawBuffer = await selectedFile.arrayBuffer();
      const detachedBytes = rawBuffer.slice(0);
      const stableBlob = new Blob([detachedBytes], { type: 'application/pdf' });

      if (currentUser && isOnline) {
        try {
          const upRes = await apiClient.uploadPdfWithProgress(
            selectedFile,
            {
              customTitle: cleanTitle,
              originalFilename: selectedFile.name,
              department: uploadDept,
              semester: uploadSem,
              subjectName: uploadSubject.trim(),
            },
            (pct) => setUploadProgress(pct)
          );
          void syncPdfMetadataToFirestore(upRes.pdf).catch((err) => {
            console.warn('Firestore PDF metadata sync notice:', err instanceof Error ? err.message : err);
          });

          // Automatically cache the uploaded PDF in IndexedDB for instant offline reading
          await offlineDb.saveOfflinePdf({
            id: upRes.pdf.id,
            title: cleanTitle,
            department: uploadDept,
            semester: uploadSem,
            subjectCode: uploadSubject.trim() || undefined,
            sourceType: 'pdf-blob',
            mimeType: 'application/pdf',
            sizeBytes: upRes.pdf.fileSizeBytes || selectedFile.size,
            blob: stableBlob,
            bytes: detachedBytes.slice(0),
            savedAt: new Date().toISOString(),
          });
          void prefetchPdfWorkerForOffline();

          await Promise.all([loadCloudPdfs(), loadOfflineVault()]);
          showToast(
            bi(
              language,
              'PDF ক্লাউড এবং এই ডিভাইসের অফলাইন ভল্টে সেভ হয়েছে—এখন অফলাইনেও পড়তে পারবেন।',
              'PDF uploaded to cloud & automatically saved for offline reading.'
            )
          );
        } catch (cloudErr) {
          // Fallback: preserve PDF in device Offline Vault so user can still read it offline
          const fallbackRecord: OfflinePdfRecord = {
            id: `local-pdf-${Date.now()}`,
            title: cleanTitle,
            department: uploadDept,
            semester: uploadSem,
            subjectCode: uploadSubject.trim() || undefined,
            sourceType: 'pdf-blob',
            mimeType: 'application/pdf',
            sizeBytes: selectedFile.size,
            blob: stableBlob,
            bytes: detachedBytes.slice(0),
            savedAt: new Date().toISOString(),
          };
          setUploadProgress(90);
          await offlineDb.saveOfflinePdf(fallbackRecord);
          setUploadProgress(100);
          await loadOfflineVault();
          showToast(
            bi(
              language,
              `ক্লাউডে আপলোড না হওয়ায় PDF টি অফলাইন ভল্টে সেভ করা হয়েছে (${cloudErr instanceof Error ? cloudErr.message : 'Network error'})।`,
              'Cloud upload failed, so the PDF was saved to your Device Offline Vault.'
            )
          );
        }
      } else {
        const record: OfflinePdfRecord = {
          id: `local-pdf-${Date.now()}`,
          title: cleanTitle,
          department: uploadDept,
          semester: uploadSem,
          subjectCode: uploadSubject.trim() || undefined,
          sourceType: 'pdf-blob',
          mimeType: 'application/pdf',
          sizeBytes: selectedFile.size,
          blob: stableBlob,
          bytes: detachedBytes.slice(0),
          savedAt: new Date().toISOString(),
        };
        setUploadProgress(75);
        await offlineDb.saveOfflinePdf(record);
        setUploadProgress(100);
        await loadOfflineVault();
        showToast(
          bi(
            language,
            'PDF এই ডিভাইসের অফলাইন ভল্টে সেভ হয়েছে—অফলাইনেও পড়তে পারবেন।',
            'Saved to your Device Offline Vault for offline reading.'
          )
        );
      }

      setSelectedFile(null);
      setCustomTitle('');
      setUploadSubject('');
      setUploadOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleOpenCloudPdf = async (pdf: UserPdfRecord) => {
    setOpeningId(pdf.id);
    setErrorMsg(null);
    try {
      const offlineCached = await offlineDb.getOfflinePdf(pdf.id);
      const cachedBytes = offlineCached
        ? await offlineDb.readOfflinePdfBytes(offlineCached)
        : null;

      if (!isOnline) {
        if (cachedBytes) {
          onTrackRecentPdf(pdf.id);
          setReaderDoc({
            title: pdf.customTitle,
            filename: pdf.originalFilename || `${pdf.customTitle}.pdf`,
            bytes: cachedBytes,
            canDownload: true,
          });
          return;
        }
        throw new Error(
          bi(
            language,
            'এই PDF টি অফলাইনে সেভ করা নেই। অনলাইনে এসে একবার খুলুন বা অফলাইন সেভ করুন।',
            'This PDF is not cached offline yet. Open or save it once while online.'
          )
        );
      }

      try {
        const bytes = await apiClient.fetchAuthenticatedPdfBytes(
          `/api/pdfs/${encodeURIComponent(pdf.id)}/file`
        );
        // Auto-cache in background so subsequent offline reads work automatically
        if (!cachedBytes) {
          const copyBuf = bytes.slice().buffer;
          void offlineDb
            .saveOfflinePdf({
              id: pdf.id,
              title: pdf.customTitle,
              department: pdf.department,
              semester: pdf.semester,
              subjectCode: pdf.subjectName || undefined,
              sourceType: 'pdf-blob',
              mimeType: 'application/pdf',
              sizeBytes: pdf.fileSizeBytes || bytes.byteLength,
              blob: new Blob([copyBuf], { type: 'application/pdf' }),
              bytes: copyBuf,
              savedAt: new Date().toISOString(),
            })
            .then(() => loadOfflineVault())
            .catch(() => {});
        }
        onTrackRecentPdf(pdf.id);
        setReaderDoc({
          title: pdf.customTitle,
          filename: pdf.originalFilename || `${pdf.customTitle}.pdf`,
          bytes,
          canDownload: true,
        });
      } catch (networkErr) {
        if (cachedBytes) {
          onTrackRecentPdf(pdf.id);
          setReaderDoc({
            title: pdf.customTitle,
            filename: pdf.originalFilename || `${pdf.customTitle}.pdf`,
            bytes: cachedBytes,
            canDownload: true,
          });
          return;
        }
        throw networkErr;
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to open PDF');
    } finally {
      setOpeningId(null);
    }
  };

  const handleDownloadCloudPdf = async (pdf: UserPdfRecord) => {
    setOpeningId(pdf.id);
    setErrorMsg(null);
    try {
      let bytes: Uint8Array | null = null;
      if (isOnline) {
        try {
          bytes = await apiClient.fetchAuthenticatedPdfBytes(
            `/api/pdfs/${encodeURIComponent(pdf.id)}/file`
          );
        } catch {
          bytes = null;
        }
      }
      if (!bytes) {
        const offlineCached = await offlineDb.getOfflinePdf(pdf.id);
        bytes = offlineCached ? await offlineDb.readOfflinePdfBytes(offlineCached) : null;
      }
      if (!bytes) {
        throw new Error(
          bi(language, 'PDF ডাউনলোড করা যায়নি।', 'Download failed — file not available offline.')
        );
      }
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
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
    setOpeningId(pdf.id);
    setErrorMsg(null);
    try {
      const bytes = await apiClient.fetchAuthenticatedPdfBytes(
        `/api/pdfs/${encodeURIComponent(pdf.id)}/file`
      );
      const copyBuf = bytes.slice().buffer;
      const blob = new Blob([copyBuf], { type: 'application/pdf' });
      await offlineDb.saveOfflinePdf({
        id: pdf.id,
        title: pdf.customTitle,
        department: pdf.department,
        semester: pdf.semester,
        subjectCode: pdf.subjectName || undefined,
        sourceType: 'pdf-blob',
        mimeType: 'application/pdf',
        sizeBytes: pdf.fileSizeBytes || bytes.byteLength,
        blob,
        bytes: copyBuf,
        savedAt: new Date().toISOString(),
      });
      await loadOfflineVault();
      showToast(
        bi(language, 'অফলাইন পড়ার জন্য ডিভাইসে সেভ হয়েছে।', 'Saved for offline reading on this device.')
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save offline copy');
    } finally {
      setOpeningId(null);
    }
  };

  const handleSavePdfEdit = async (pdf: UserPdfRecord) => {
    const trimmed = editTitle.trim();
    if (trimmed.length < 2) return;
    try {
      const updatedRes = await apiClient.updatePdfMeta(pdf.id, {
        customTitle: trimmed,
        department: editDept,
        semester: editSem,
      });
      void syncPdfMetadataToFirestore(updatedRes.pdf).catch((err) => {
        console.warn('Firestore PDF edit sync notice:', err instanceof Error ? err.message : err);
      });
      const existingOffline = await offlineDb.getOfflinePdf(pdf.id);
      if (existingOffline) {
        await offlineDb.saveOfflinePdf({
          ...existingOffline,
          title: trimmed,
          department: editDept,
          semester: editSem,
        });
      }
      setEditingId(null);
      await Promise.all([loadCloudPdfs(), loadOfflineVault()]);
      showToast(bi(language, 'PDF তথ্য আপডেট করা হয়েছে।', 'PDF details updated.'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const handleDeleteCloudPdf = async (pdf: UserPdfRecord) => {
    try {
      await apiClient.deletePdf(pdf.id);
      void deletePdfMetadataFromFirestore(pdf.id).catch((err) => {
        console.warn('Firestore PDF delete sync notice:', err instanceof Error ? err.message : err);
      });
      await offlineDb.deleteOfflinePdf(pdf.id).catch(() => {});
      await Promise.all([loadCloudPdfs(), loadOfflineVault()]);
      showToast(bi(language, 'PDF মুছে ফেলা হয়েছে।', 'PDF deleted permanently.'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleOpenSharedNote = async (sn: SharedPdfNote) => {
    if (!sn.pdfUrl) {
      setErrorMsg(
        bi(language, 'এই বইয়ের জন্য কোনো PDF লিংক বা ফাইল যুক্ত নেই।', 'No PDF file attached to this book.')
      );
      return;
    }
    setOpeningId(sn.id);
    setErrorMsg(null);
    try {
      onTrackRecentPdf(sn.id);
      const offlineCached = await offlineDb.getOfflinePdf(sn.id);
      const cachedBytes = offlineCached
        ? await offlineDb.readOfflinePdfBytes(offlineCached)
        : null;

      if (!isOnline && cachedBytes) {
        setReaderDoc({
          title: sn.title,
          filename: `${sn.title}.pdf`,
          bytes: cachedBytes,
          canDownload: sn.downloadPermitted,
        });
        return;
      }

      if (sn.pdfUrl.startsWith('/')) {
        try {
          const bytes = await apiClient.fetchAuthenticatedPdfBytes(sn.pdfUrl);
          if (!cachedBytes) {
            const copyBuf = bytes.slice().buffer;
            void offlineDb
              .saveOfflinePdf({
                id: sn.id,
                title: sn.title,
                department: sn.department,
                semester: sn.semester,
                subjectCode: sn.subjectCode || undefined,
                sourceType: 'pdf-blob',
                mimeType: 'application/pdf',
                sizeBytes: bytes.byteLength,
                blob: new Blob([copyBuf], { type: 'application/pdf' }),
                bytes: copyBuf,
                savedAt: new Date().toISOString(),
              })
              .then(() => loadOfflineVault())
              .catch(() => {});
          }
          setReaderDoc({
            title: sn.title,
            filename: `${sn.title}.pdf`,
            bytes,
            canDownload: sn.downloadPermitted,
          });
        } catch (fetchErr) {
          if (cachedBytes) {
            setReaderDoc({
              title: sn.title,
              filename: `${sn.title}.pdf`,
              bytes: cachedBytes,
              canDownload: sn.downloadPermitted,
            });
            return;
          }
          throw fetchErr;
        }
      } else {
        setReaderDoc({
          title: sn.title,
          filename: `${sn.title}.pdf`,
          url: sn.pdfUrl,
          canDownload: sn.downloadPermitted,
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to open PDF book');
    } finally {
      setOpeningId(null);
    }
  };

  const handleOpenOfflineRecord = async (rec: OfflinePdfRecord) => {
    setOpeningId(rec.id);
    setErrorMsg(null);
    try {
      const bytes = await offlineDb.readOfflinePdfBytes(rec);
      if (!bytes || bytes.byteLength === 0) {
        setErrorMsg(
          bi(
            language,
            'এই অফলাইন PDF ফাইলটি পড়া যাচ্ছে না। অনুগ্রহ করে আবার আপলোড বা অফলাইন সেভ করুন।',
            'Could not read cached PDF bytes from this device. Please re-upload or re-cache it.'
          )
        );
        return;
      }
      onTrackRecentPdf(rec.id);
      setReaderDoc({
        title: rec.title,
        filename: `${rec.title}.pdf`,
        bytes,
        canDownload: true,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to open offline PDF');
    } finally {
      setOpeningId(null);
    }
  };

  const handleDownloadOfflineRecord = async (rec: OfflinePdfRecord) => {
    setErrorMsg(null);
    try {
      const bytes = await offlineDb.readOfflinePdfBytes(rec);
      if (!bytes || bytes.byteLength === 0) {
        setErrorMsg(bi(language, 'অফলাইন PDF ডাউনলোড করা যায়নি।', 'Could not read offline PDF for download.'));
        return;
      }
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${rec.title.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const filteredCloudPdfs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = cloudPdfs.filter((p) => {
      const matchText =
        !q ||
        p.customTitle.toLowerCase().includes(q) ||
        p.originalFilename.toLowerCase().includes(q) ||
        (p.subjectName || '').toLowerCase().includes(q);
      const matchDept = filterDept === 'all' || (p.department || 'power') === filterDept;
      const matchSem = filterSem === 'all' || Number(p.semester || 4) === Number(filterSem);
      return matchText && matchDept && matchSem;
    });
    if (sortBy === 'name') {
      return [...list].sort((a, b) => a.customTitle.localeCompare(b.customTitle));
    }
    if (sortBy === 'size') {
      return [...list].sort((a, b) => b.fileSizeBytes - a.fileSizeBytes);
    }
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [cloudPdfs, searchQuery, filterDept, filterSem, sortBy]);

  const filteredSharedBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sharedNotes.filter((sn) => {
      const matchText =
        !q ||
        sn.title.toLowerCase().includes(q) ||
        sn.subjectCode.toLowerCase().includes(q) ||
        sn.summary.toLowerCase().includes(q);
      const matchDept = filterDept === 'all' || sn.department === filterDept;
      const matchSem = filterSem === 'all' || sn.semester === Number(filterSem);
      return matchText && matchDept && matchSem;
    });
  }, [sharedNotes, searchQuery, filterDept, filterSem]);

  const filteredOfflinePdfs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return offlinePdfs.filter((o) => {
      const matchText =
        !q ||
        o.title.toLowerCase().includes(q) ||
        (o.subjectCode || '').toLowerCase().includes(q);
      const matchDept = filterDept === 'all' || !o.department || o.department === filterDept;
      const matchSem = filterSem === 'all' || !o.semester || o.semester === Number(filterSem);
      return matchText && matchDept && matchSem;
    });
  }, [offlinePdfs, searchQuery, filterDept, filterSem]);

  const offlineIdsSet = useMemo(() => new Set(offlinePdfs.map((o) => o.id)), [offlinePdfs]);

  const renderOfflineVaultSection = () => (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-emerald-500" />
          <span>
            {bi(
              language,
              `অফলাইন PDF ভল্ট (এই ডিভাইস · ${toBnDigits(filteredOfflinePdfs.length)}টি)`,
              `Device Offline PDF Vault (${filteredOfflinePdfs.length})`
            )}
          </span>
        </h2>
        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          {bi(language, 'ইন্টারনেট ছাড়াই পড়া যাবে', 'Readable without internet')}
        </span>
      </div>

      {filteredOfflinePdfs.length === 0 ? (
        <div className="p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
          {bi(
            language,
            'এই ডিভাইসে এখনো কোনো অফলাইন PDF সংরক্ষিত নেই। নতুন PDF আপলোড করলে তা স্বয়ংক্রিয়ভাবে এখানে অফলাইন পড়ার জন্য সেভ হবে।',
            'No device-cached PDFs yet. Any PDF you upload is automatically cached here for offline reading.'
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOfflinePdfs.map((rec) => {
            const hasData = Boolean(rec.bytes || rec.blob);
            return (
              <article
                key={rec.id}
                className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-emerald-500/25 dark:border-emerald-500/20 flex flex-col justify-between gap-3"
              >
                <div>
                  <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                    Offline Ready · {formatBytes(rec.sizeBytes)} · {formatDateBn(rec.savedAt)}
                  </p>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1 line-clamp-2">
                    {rec.title}
                  </h3>
                  {(rec.department || rec.semester || rec.subjectCode) && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      {rec.department ? rec.department.toUpperCase() : 'PDF'}
                      {rec.semester ? ` · Sem ${rec.semester}` : ''}
                      {rec.subjectCode ? ` · ${rec.subjectCode}` : ''}
                    </p>
                  )}
                </div>
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!hasData || openingId === rec.id}
                    onClick={() => void handleOpenOfflineRecord(rec)}
                    className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>
                      {openingId === rec.id
                        ? bi(language, 'খুলছে...', 'Opening...')
                        : bi(language, 'অফলাইনে পড়ুন', 'Read Offline')}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!hasData}
                    onClick={() => void handleDownloadOfflineRecord(rec)}
                    aria-label="Download offline PDF"
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"
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
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-600 dark:text-cyan-400">
            <Lock className="w-3.5 h-3.5" />
            <span>
              {bi(language, 'ব্যক্তিগত ও ডিপার্টমেন্ট PDF লাইব্রেরি', 'Personal & Department PDF Library')}
            </span>
          </div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
            {bi(language, 'আমার PDF লাইব্রেরি', 'My PDF Library')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {bi(
              language,
              `ক্লাউড ফাইল: ${toBnDigits(cloudPdfs.length)}টি · পাবলিক বই: ${toBnDigits(sharedNotes.length)}টি · অফলাইন কপি: ${toBnDigits(offlinePdfs.length)}টি`,
              `${cloudPdfs.length} private cloud PDFs · ${sharedNotes.length} department books · ${offlinePdfs.length} offline copies`
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

      {/* Sign-in Prompt for Unauthenticated Users */}
      {!currentUser && (
        <div className="p-4 rounded-2xl bg-cyan-500/8 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {bi(
                language,
                'ব্যক্তিগত ক্লাউড PDF সিঙ্ক চালু করতে সাইন ইন করুন',
                'Sign in to save & sync your private PDFs across devices'
              )}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {bi(
                language,
                'লগইন ছাড়াই আপনি ডিপার্টমেন্টের পাবলিক বই পড়তে এবং এই ডিভাইসে অফলাইন PDF সেভ করতে পারবেন।',
                'You can browse public Department PDF Books and save offline PDFs on this device right now, or sign in for private cloud backup.'
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
                {bi(language, '২. বই / ডকুমেন্টের নাম দিন', '2. Book / Document Title')}
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

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {bi(language, '৩. ডিপার্টমেন্ট / টেকনোলজি', '3. Department / Technology')}
              </label>
              <select
                value={uploadDept}
                disabled={uploading}
                onChange={(e) => setUploadDept(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
              >
                <option value="common">
                  {bi(language, 'সকল ডিপার্টমেন্ট (Common)', 'All Departments (Common)')}
                </option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {language === 'en' ? `${d.shortName} — ${d.nameEn}` : `${d.shortName} — ${d.nameBn}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  {bi(language, '৪. সেমিস্টার', '4. Semester')}
                </label>
                <select
                  value={uploadSem}
                  disabled={uploading}
                  onChange={(e) => setUploadSem(Number(e.target.value))}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                >
                  {([1, 2, 3, 4, 5, 6, 7, 8] as SemesterNumber[]).map((s) => (
                    <option key={s} value={s}>
                      {language === 'en' ? SEMESTER_LABELS_EN[s] : SEMESTER_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  {bi(language, 'বিষয়ের নাম (ঐচ্ছিক)', 'Subject (Optional)')}
                </label>
                <input
                  type="text"
                  disabled={uploading}
                  value={uploadSubject}
                  onChange={(e) => setUploadSubject(e.target.value)}
                  placeholder="67141 / Math-2"
                  className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>
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

      {/* Search & Department/Semester Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
        <div className="relative lg:col-span-5">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={bi(language, 'বই বা PDF খুঁজুন...', 'Search books, titles, or subject codes...')}
            className="w-full min-h-[42px] pl-10 pr-3.5 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-sm"
          />
        </div>

        <div className="lg:col-span-3 relative">
          <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="w-full min-h-[42px] pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-semibold"
          >
            <option value="all">{bi(language, 'সকল ডিপার্টমেন্ট', 'All Departments')}</option>
            <option value="common">{bi(language, 'কমন বিষয়', 'Common Subjects')}</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.shortName} · {language === 'en' ? d.nameEn : d.nameBn}
              </option>
            ))}
          </select>
        </div>

        <select
          value={filterSem}
          onChange={(e) => setFilterSem(e.target.value)}
          className="lg:col-span-2 min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-semibold"
        >
          <option value="all">{bi(language, 'সকল সেমিস্টার', 'All Semesters')}</option>
          {([1, 2, 3, 4, 5, 6, 7, 8] as SemesterNumber[]).map((s) => (
            <option key={s} value={String(s)}>
              {language === 'en' ? SEMESTER_LABELS_EN[s] : SEMESTER_LABELS[s]}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'newest' | 'name' | 'size')}
          className="lg:col-span-2 min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-semibold"
        >
          <option value="newest">{bi(language, 'সর্বশেষ আপলোড', 'Newest First')}</option>
          <option value="name">{bi(language, 'নাম (A-Z)', 'Title (A-Z)')}</option>
          <option value="size">{bi(language, 'ফাইল সাইজ', 'Largest First')}</option>
        </select>
      </div>

      {/* When offline, show Device Offline PDF Vault right at the top */}
      {!isOnline && renderOfflineVaultSection()}

      {/* Department & Admin PDF Books Section */}
      {filteredSharedBooks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cyan-500" />
            <span>
              {bi(language, 'ডিপার্টমেন্ট ও অ্যাডমিন PDF বইসমূহ', 'Department & Curated PDF Books')}
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSharedBooks.map((sn) => {
              const dept = DEPARTMENTS.find((d) => d.id === sn.department);
              return (
                <article
                  key={sn.id}
                  className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                      <span>
                        {dept?.shortName || sn.department.toUpperCase()} · Sem {sn.semester}
                      </span>
                      {sn.subjectCode && <span>#{sn.subjectCode}</span>}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                      {sn.title}
                    </h3>
                    {sn.summary && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {sn.summary}
                      </p>
                    )}
                  </div>
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={openingId === sn.id || !sn.pdfUrl}
                      onClick={() => void handleOpenSharedNote(sn)}
                      className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>
                        {openingId === sn.id
                          ? bi(language, 'খুলছে...', 'Opening...')
                          : bi(language, 'অ্যাপে পড়ুন', 'Read In-App')}
                      </span>
                    </button>
                    {sn.downloadPermitted && sn.pdfUrl && (
                      <a
                        href={sn.pdfUrl}
                        download={`${sn.title}.pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title={bi(language, 'ডাউনলোড', 'Download')}
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Private Cloud PDFs Grid (shown when online) */}
      {currentUser && isOnline && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-500" />
            <span>{bi(language, 'আমার ব্যক্তিগত ক্লাউড PDF', 'My Private Cloud PDFs')}</span>
          </h2>

          {loadingList ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              {bi(language, 'PDF তালিকা লোড হচ্ছে...', 'Loading your private PDF library...')}
            </div>
          ) : filteredCloudPdfs.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <FileText className="w-9 h-9 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {searchQuery || filterDept !== 'all' || filterSem !== 'all'
                  ? bi(language, 'ফিল্টার অনুযায়ী কোনো PDF পাওয়া যায়নি।', 'No PDFs matched your filter.')
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
                const isEditing = editingId === pdf.id;
                const isCachedOffline = offlineIdsSet.has(pdf.id);
                const deptLabel =
                  DEPARTMENTS.find((d) => d.id === pdf.department)?.shortName ||
                  (pdf.department || 'Common').toUpperCase();
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
                        <div className="text-right">
                          <p className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                            {deptLabel} · Sem {pdf.semester || 4}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {formatBytes(pdf.fileSizeBytes)} · {formatDateBn(pdf.createdAt)}
                          </p>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="space-y-2 pt-1">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full min-h-[36px] px-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-cyan-500 text-xs"
                          />
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              value={editDept}
                              onChange={(e) => setEditDept(e.target.value)}
                              className="min-h-[34px] px-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                            >
                              <option value="common">Common</option>
                              {DEPARTMENTS.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.shortName}
                                </option>
                              ))}
                            </select>
                            <select
                              value={editSem}
                              onChange={(e) => setEditSem(Number(e.target.value))}
                              className="min-h-[34px] px-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                            >
                              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                                <option key={s} value={s}>
                                  Sem {s}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleSavePdfEdit(pdf)}
                              className="flex-1 min-h-[34px] px-2.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                          {pdf.customTitle}
                        </h3>
                      )}

                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {pdf.subjectName ? `${pdf.subjectName} · ` : ''}
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
                          setEditingId(pdf.id);
                          setEditTitle(pdf.customTitle);
                          setEditDept(pdf.department || defaultDepartment);
                          setEditSem(pdf.semester || defaultSemester);
                        }}
                        aria-label="Edit PDF details"
                        title={bi(language, 'তথ্য ও নাম পরিবর্তন', 'Rename & Edit')}
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

      {/* Local / Offline Vault PDFs (shown below cloud section when online) */}
      {isOnline && renderOfflineVaultSection()}

      {/* Canvas-Based PDF.js In-App Reader Modal */}
      {readerDoc && (
        <PdfReaderModal
          doc={readerDoc}
          language={language}
          onClose={() => setReaderDoc(null)}
        />
      )}
    </div>
  );
};
