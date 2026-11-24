import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { bi } from '../i18n/translations';
import { apiClient } from '../services/apiClient';
import { offlineDb } from '../services/offlineDb';
import { LanguageMode } from '../types/study';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PDF_WORKER_CACHE_KEY = 'pdfjs_worker_script_v1';
let cachedBlobWorkerUrl: string | null = null;
let workerPrefetchStarted = false;

export async function prefetchPdfWorkerForOffline(): Promise<void> {
  if (workerPrefetchStarted || typeof window === 'undefined' || !navigator.onLine) return;
  workerPrefetchStarted = true;
  try {
    const existing = await offlineDb.getCachedValue<string>(PDF_WORKER_CACHE_KEY);
    if (existing && existing.length > 1000) return;
    const res = await fetch(pdfWorkerUrl, { cache: 'force-cache' });
    if (!res.ok) return;
    const scriptText = await res.text();
    if (scriptText && scriptText.length > 1000) {
      await offlineDb.setCachedValue(PDF_WORKER_CACHE_KEY, scriptText);
    }
  } catch {
    workerPrefetchStarted = false;
  }
}

async function resolveOfflineWorkerBlobUrl(): Promise<string | null> {
  if (cachedBlobWorkerUrl) return cachedBlobWorkerUrl;
  try {
    const scriptText = await offlineDb.getCachedValue<string>(PDF_WORKER_CACHE_KEY);
    if (!scriptText || scriptText.length < 1000) return null;
    const blob = new Blob([scriptText], { type: 'text/javascript' });
    cachedBlobWorkerUrl = URL.createObjectURL(blob);
    pdfjsLib.GlobalWorkerOptions.workerSrc = cachedBlobWorkerUrl;
    return cachedBlobWorkerUrl;
  } catch {
    return null;
  }
}

export interface PdfReaderDocument {
  title: string;
  filename: string;
  bytes?: Uint8Array;
  url?: string;
  canDownload?: boolean;
}

interface PdfReaderModalProps {
  doc: PdfReaderDocument;
  language: LanguageMode;
  onClose: () => void;
}

export const PdfReaderModal: React.FC<PdfReaderModalProps> = ({ doc, language, onClose }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const loadingTaskRef = useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const rawBytesRef = useRef<Uint8Array | null>(null);

  const [loadingDoc, setLoadingDoc] = useState(true);
  const [renderingPage, setRenderingPage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fallbackBlobUrl, setFallbackBlobUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    void prefetchPdfWorkerForOffline();
  }, []);

  // Load PDF document from bytes or URL
  useEffect(() => {
    let cancelled = false;
    let activeFallbackUrl: string | null = null;

    const loadDocument = async () => {
      setLoadingDoc(true);
      setLoadError(null);
      setFallbackBlobUrl(null);
      setNumPages(0);
      setPageNumber(1);

      try {
        let dataBytes: Uint8Array;
        if (doc.bytes && doc.bytes.byteLength > 0) {
          dataBytes = new Uint8Array(doc.bytes);
        } else if (doc.url) {
          dataBytes = await apiClient.fetchAuthenticatedPdfBytes(doc.url);
        } else {
          throw new Error('No PDF source provided.');
        }

        if (cancelled) return;
        rawBytesRef.current = new Uint8Array(dataBytes);

        // If currently offline and we have a cached local Blob worker script, use it immediately
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          await resolveOfflineWorkerBlobUrl();
        }

        const openWithPdfJs = async (): Promise<pdfjsLib.PDFDocumentProxy> => {
          const copy = new Uint8Array(rawBytesRef.current ?? dataBytes);
          const loadingTask = pdfjsLib.getDocument({
            data: copy,
            useWorkerFetch: false,
          });
          loadingTaskRef.current = loadingTask;
          return loadingTask.promise;
        };

        let loadedPdf: pdfjsLib.PDFDocumentProxy;
        try {
          loadedPdf = await openWithPdfJs();
        } catch (firstErr) {
          // Retry with locally cached Blob worker script (for offline resilience)
          const blobWorker = await resolveOfflineWorkerBlobUrl();
          if (blobWorker && !cancelled) {
            try {
              loadedPdf = await openWithPdfJs();
            } catch {
              // Seamless fallback to native browser PDF viewer via Blob URL
              const pdfBlob = new Blob([new Uint8Array(rawBytesRef.current)], {
                type: 'application/pdf',
              });
              activeFallbackUrl = URL.createObjectURL(pdfBlob);
              if (!cancelled) {
                setFallbackBlobUrl(activeFallbackUrl);
              }
              return;
            }
          } else if (rawBytesRef.current && rawBytesRef.current.byteLength > 0 && !cancelled) {
            const pdfBlob = new Blob([new Uint8Array(rawBytesRef.current)], {
              type: 'application/pdf',
            });
            activeFallbackUrl = URL.createObjectURL(pdfBlob);
            setFallbackBlobUrl(activeFallbackUrl);
            return;
          } else {
            throw firstErr;
          }
        }

        if (cancelled) {
          await loadingTaskRef.current?.destroy().catch(() => {});
          return;
        }
        pdfDocRef.current = loadedPdf;
        setNumPages(loadedPdf.numPages);

        // Compute comfortable initial fit scale based on container width
        try {
          const firstPage = await loadedPdf.getPage(1);
          const unscaledViewport = firstPage.getViewport({ scale: 1 });
          const areaWidth = scrollAreaRef.current?.clientWidth
            ? Math.max(280, scrollAreaRef.current.clientWidth - 36)
            : Math.min(820, window.innerWidth - 48);
          const fitScale = Math.max(0.65, Math.min(1.6, areaWidth / unscaledViewport.width));
          if (!cancelled) {
            setScale(Number(fitScale.toFixed(2)));
          }
        } catch {
          // keep default scale
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : bi(language, 'PDF ফাইল লোড করা যায়নি।', 'Could not load PDF document.')
          );
        }
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    };

    void loadDocument();

    return () => {
      cancelled = true;
      if (activeFallbackUrl) {
        URL.revokeObjectURL(activeFallbackUrl);
      }
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
      if (loadingTaskRef.current) {
        void loadingTaskRef.current.destroy().catch(() => {});
        loadingTaskRef.current = null;
      }
      pdfDocRef.current = null;
    };
  }, [doc, language]);

  // Render active page to canvas
  const renderPage = useCallback(async (pageNum: number, zoomScale: number) => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignore
      }
    }

    setRenderingPage(true);
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: zoomScale });
      const dpr = Math.min(2, window.devicePixelRatio || 1);

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, viewport.width, viewport.height);

      const task = page.render({
        canvasContext: ctx,
        canvas,
        viewport,
      });
      renderTaskRef.current = task;
      await task.promise;
    } catch (err: unknown) {
      const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: string }).name) : '';
      if (name !== 'RenderingCancelledException') {
        setLoadError(
          err instanceof Error ? err.message : 'Failed to render PDF page.'
        );
      }
    } finally {
      setRenderingPage(false);
    }
  }, []);

  useEffect(() => {
    if (!loadingDoc && !loadError && numPages > 0) {
      void renderPage(pageNumber, scale);
    }
  }, [loadingDoc, loadError, numPages, pageNumber, scale, renderPage]);

  const handleDownload = () => {
    const safeFilename = doc.filename.replace(/[\\/:*?"<>|]/g, '_');
    const bytes = rawBytesRef.current ?? doc.bytes;
    if (bytes && bytes.byteLength > 0) {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = safeFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      return;
    }
    if (doc.url) {
      const a = document.createElement('a');
      a.href = doc.url;
      a.download = safeFilename;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && containerRef.current?.requestFullscreen) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        setIsFullscreen((prev) => !prev);
      }
    } catch {
      setIsFullscreen((prev) => !prev);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-1 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        className={`${
          isFullscreen ? 'w-screen h-screen rounded-none' : 'w-full max-w-6xl h-[92vh] rounded-2xl'
        } bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden shadow-2xl`}
      >
        {/* Top Header */}
        <div className="px-3 sm:px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 bg-slate-50 dark:bg-[#0D1628]">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{doc.title}</p>
            <p className="text-[11px] text-slate-500 truncate">{doc.filename}</p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {doc.canDownload !== false && (
              <button
                type="button"
                onClick={handleDownload}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{bi(language, 'ডাউনলোড', 'Download')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              title={bi(language, 'পূর্ণ স্ক্রিন', 'Toggle Fullscreen')}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close reader"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation & Zoom Bar */}
        {numPages > 0 && !loadError && (
          <div className="px-3 sm:px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-[#0F172A] shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1 text-xs font-mono text-slate-700 dark:text-slate-200 px-1.5">
                <input
                  type="number"
                  min={1}
                  max={numPages}
                  value={pageNumber}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (next >= 1 && next <= numPages) setPageNumber(next);
                  }}
                  className="w-12 min-h-[30px] text-center rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                />
                <span>/ {numPages}</span>
              </div>
              <button
                type="button"
                disabled={pageNumber >= numPages}
                onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.15).toFixed(2))))}
                aria-label="Zoom out"
                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-300 w-12 text-center tabular-nums">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(2.6, Number((s + 0.15).toFixed(2))))}
                aria-label="Zoom in"
                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setScale(1.0)}
                title={bi(language, '১০০% জুম', 'Reset zoom')}
                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Viewport */}
        <div
          ref={scrollAreaRef}
          className={`flex-1 overflow-auto bg-slate-200/80 dark:bg-[#050A14] ${
            fallbackBlobUrl ? 'p-0' : 'p-3 sm:p-5 flex justify-center items-start'
          }`}
        >
          {loadingDoc ? (
            <div className="my-auto flex flex-col items-center gap-3 text-slate-600 dark:text-slate-300">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
              <p className="text-xs font-medium">
                {bi(language, 'PDF ডকুমেন্ট লোড হচ্ছে...', 'Rendering PDF document...')}
              </p>
            </div>
          ) : fallbackBlobUrl ? (
            <iframe
              src={fallbackBlobUrl}
              title={doc.title}
              className="w-full h-full min-h-[75vh] border-0 bg-white"
            />
          ) : loadError ? (
            <div className="my-auto max-w-md rounded-2xl bg-white dark:bg-[#111827] border border-red-500/30 p-6 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {bi(language, 'ইন-অ্যাপ PDF প্রদর্শনে সমস্যা হয়েছে', 'Unable to Render PDF In-App')}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">{loadError}</p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {doc.canDownload !== false && (
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{bi(language, 'ডাউনলোড করুন', 'Download PDF')}</span>
                  </button>
                )}
                {doc.url && doc.url.startsWith('http') && (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{bi(language, 'ব্রাউজারে খুলুন', 'Open External')}</span>
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="relative shadow-xl rounded-lg overflow-hidden bg-white">
              {renderingPage && (
                <div className="absolute top-2 right-2 z-10 px-2 py-1 rounded-md bg-slate-900/70 text-white text-[10px] font-medium">
                  Rendering...
                </div>
              )}
              <canvas ref={canvasRef} className="block" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
