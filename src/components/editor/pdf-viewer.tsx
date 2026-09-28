'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ZoomInIcon,
  ZoomOutIcon,
  DownloadIcon,
  FileTextIcon,
  Maximize2Icon,
  Minimize2Icon,
  ColumnsIcon,
  MaximizeIcon,
  Loader2Icon,
  AlertCircleIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editor-store';
import { useUiLocale } from '@/lib/ui-locale';

type PDFDocumentProxy = {
  numPages: number;
  getPage: (n: number) => Promise<PDFPageProxy>;
  destroy: () => void;
};

type PDFPageProxy = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (ctx: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    transform?: number[];
  }) => { promise: Promise<void> };
};

interface PdfViewerProps {
  /** Increment this number to force a PDF reload even when the URL is unchanged. */
  refreshKey?: number;
  /** Project name used for download filename. */
  projectName?: string;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

export function PdfViewer({ refreshKey, projectName }: PdfViewerProps) {
  const { t } = useUiLocale();
  const latestPdfUrl = useEditorStore((s) => s.latestPdfUrl);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<Promise<void> | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pageInputValue, setPageInputValue] = useState('');
  const [pageInputFocused, setPageInputFocused] = useState(false);

  // ── Render a single page ──────────────────────────────────────────────
  const renderPage = useCallback(
    async (doc: PDFDocumentProxy, pageNum: number, pageScale: number) => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Wait for any in-flight render
      if (renderTaskRef.current) {
        await renderTaskRef.current.catch(() => null);
      }

      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: pageScale });
      // PDF points are vector data. Render the preview at display pixel density
      // while keeping its CSS size tied to the selected zoom level.
      const outputScale = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const task = page.render({ canvasContext: ctx, viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
      renderTaskRef.current = task.promise;
      await task.promise;
      renderTaskRef.current = null;
    },
    []
  );

  // ── Load PDF whenever URL changes or refreshKey increments ────────────
  useEffect(() => {
    if (!latestPdfUrl) {
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
      setNumPages(0);
      setCurrentPage(1);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    // Append a cache-busting timestamp so the browser always fetches the
    // latest compiled PDF even when the URL path is identical.
    const urlWithBust = `${latestPdfUrl}?t=${Date.now()}`;

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        pdfDocRef.current?.destroy();
        const doc = (await pdfjsLib.getDocument(urlWithBust)
          .promise) as unknown as PDFDocumentProxy;
        if (cancelled) {
          doc.destroy();
          return;
        }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setCurrentPage(1);
        await renderPage(doc, 1, scale);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load PDF'
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestPdfUrl, refreshKey]);

  // ── Re-render when page or scale changes (PDF already loaded) ─────────
  useEffect(() => {
    if (!pdfDocRef.current || isLoading) return;
    renderPage(pdfDocRef.current, currentPage, scale).catch(console.error);
  }, [currentPage, scale, isLoading, renderPage]);

  // ── Navigation helpers ────────────────────────────────────────────────
  const goPrev = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentPage((p) => Math.min(numPages, p + 1));
  }, [numPages]);

  const goFirst = useCallback(() => {
    setCurrentPage(1);
  }, []);

  const goLast = useCallback(() => {
    setCurrentPage(numPages);
  }, [numPages]);

  const jumpToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(numPages, page));
      setCurrentPage(clamped);
    },
    [numPages]
  );

  // ── Zoom helpers ──────────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    setScale((s) =>
      Math.min(MAX_SCALE, parseFloat((s + SCALE_STEP).toFixed(2)))
    );
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) =>
      Math.max(MIN_SCALE, parseFloat((s - SCALE_STEP).toFixed(2)))
    );
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1.0);
  }, []);

  // ── Fit modes ─────────────────────────────────────────────────────────
  const fitToWidth = useCallback(async () => {
    const container = containerRef.current;
    if (!container || !pdfDocRef.current) return;

    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      // Subtract padding (32px = 16px each side)
      const containerWidth = container.clientWidth - 32;
      const newScale = parseFloat((containerWidth / viewport.width).toFixed(2));
      setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale)));
    } catch {
      // If we can't get the page, silently fail
    }
  }, [currentPage]);

  const fitToPage = useCallback(async () => {
    const container = containerRef.current;
    if (!container || !pdfDocRef.current) return;

    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      // Subtract padding (32px each axis)
      const containerWidth = container.clientWidth - 32;
      const containerHeight = container.clientHeight - 32;
      const scaleX = containerWidth / viewport.width;
      const scaleY = containerHeight / viewport.height;
      const newScale = parseFloat(Math.min(scaleX, scaleY).toFixed(2));
      setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale)));
    } catch {
      // If we can't get the page, silently fail
    }
  }, [currentPage]);

  // ── Fullscreen ────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    try {
      if (!document.fullscreenElement) {
        await viewer.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen API not available or denied
    }
  }, []);

  // Track fullscreen state changes
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  // ── Keyboard navigation ───────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture keys when typing in the page input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'PageDown':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          goPrev();
          break;
        case 'Home':
          e.preventDefault();
          goFirst();
          break;
        case 'End':
          e.preventDefault();
          goLast();
          break;
        case '+':
        case '=':
          if (e.ctrlKey || e.key === '+') {
            e.preventDefault();
            zoomIn();
          }
          break;
        case '-':
          if (e.ctrlKey || e.key === '-') {
            e.preventDefault();
            zoomOut();
          }
          break;
        case '0':
          if (e.ctrlKey) {
            e.preventDefault();
            resetZoom();
          } else {
            resetZoom();
          }
          break;
      }
    }

    viewer.addEventListener('keydown', handleKeyDown);
    return () => {
      viewer.removeEventListener('keydown', handleKeyDown);
    };
  }, [goNext, goPrev, goFirst, goLast, zoomIn, zoomOut, resetZoom]);

  // ── Page input handlers ───────────────────────────────────────────────
  function handlePageInputFocus() {
    setPageInputFocused(true);
    setPageInputValue(String(currentPage));
  }

  function handlePageInputBlur() {
    setPageInputFocused(false);
    const parsed = parseInt(pageInputValue, 10);
    if (!isNaN(parsed)) {
      jumpToPage(parsed);
    }
    setPageInputValue('');
  }

  function handlePageInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
    if (e.key === 'Escape') {
      setPageInputValue('');
      e.currentTarget.blur();
    }
  }

  function handlePageInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Allow only digits
    const val = e.target.value.replace(/[^\d]/g, '');
    setPageInputValue(val);
  }

  // ── No PDF URL – empty state ──────────────────────────────────────────
  if (!latestPdfUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-muted/30 text-muted-foreground px-6 text-center">
        <FileTextIcon className="size-12 opacity-30" />
        <div>
          <p className="text-sm font-medium">{t('No PDF preview yet')}</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {t('Press')} <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px] font-mono">Ctrl+Enter</kbd> {t('to compile, or enable auto-compile in the toolbar')}
          </p>
        </div>
      </div>
    );
  }

  // ── Main viewer ───────────────────────────────────────────────────────
  return (
    <div
      ref={viewerRef}
      className="flex h-full flex-col bg-muted/20 outline-none"
      tabIndex={0}
    >
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-1 overflow-x-auto whitespace-nowrap border-b bg-background px-2 py-1 [&>div]:shrink-0">
        {/* Left: Page navigation */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={goPrev}
            disabled={currentPage <= 1 || isLoading}
            aria-label="Previous page"
            title="Previous page (Arrow Up / Page Up)"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>

          {/* Page jump input */}
          <div className="flex items-center text-xs tabular-nums text-muted-foreground">
            {numPages > 0 ? (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  value={pageInputFocused ? pageInputValue : String(currentPage)}
                  onFocus={handlePageInputFocus}
                  onBlur={handlePageInputBlur}
                  onKeyDown={handlePageInputKeyDown}
                  onChange={handlePageInputChange}
                  disabled={isLoading || numPages === 0}
                  className="h-5 w-8 rounded border border-transparent bg-transparent text-center text-xs tabular-nums text-foreground outline-none transition-colors hover:border-border focus:border-ring focus:bg-background"
                  aria-label="Current page"
                  title="Type a page number to jump"
                />
                <span className="text-muted-foreground/70">/</span>
                <span className="px-0.5">{numPages}</span>
              </>
            ) : (
              <span className="min-w-[3rem] text-center">—</span>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={goNext}
            disabled={currentPage >= numPages || isLoading}
            aria-label="Next page"
            title="Next page (Arrow Down / Page Down)"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>

        {/* Center: Zoom controls */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE || isLoading}
            aria-label="Zoom out"
            title="Zoom out (- or Ctrl+-)"
          >
            <ZoomOutIcon className="size-4" />
          </Button>

          <button
            onClick={resetZoom}
            disabled={isLoading}
            className="min-w-[3rem] rounded px-1 py-0.5 text-center text-xs tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            title="Reset zoom to 100% (0 or Ctrl+0)"
            aria-label={`Zoom level ${Math.round(scale * 100)}%, click to reset to 100%`}
          >
            {Math.round(scale * 100)}%
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={zoomIn}
            disabled={scale >= MAX_SCALE || isLoading}
            aria-label="Zoom in"
            title="Zoom in (+ or Ctrl+=)"
          >
            <ZoomInIcon className="size-4" />
          </Button>

          <div className="mx-0.5 h-4 w-px bg-border" />

          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={fitToWidth}
            disabled={isLoading || numPages === 0}
            aria-label="Fit to width"
            title="Fit to width"
          >
            <ColumnsIcon className="size-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={fitToPage}
            disabled={isLoading || numPages === 0}
            aria-label="Fit to page"
            title="Fit to page"
          >
            <MaximizeIcon className="size-3.5" />
          </Button>
        </div>

        {/* Right: Download, fullscreen */}
        <div className="flex items-center gap-0.5">
          <a
            href={latestPdfUrl}
            download={`${(projectName || 'output').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Download PDF"
              title={t('Download PDF')}
            >
              <DownloadIcon className="size-4" />
            </Button>
          </a>

          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2Icon className="size-4" />
            ) : (
              <Maximize2Icon className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {/* ── Canvas area ─────────────────────────────────────────────── */}
      <div ref={containerRef} className="relative flex-1 overflow-auto">
        {/* Loading overlay */}
        {isLoading && (
          <div
            role="status"
            aria-live="polite"
            aria-label="Loading PDF document"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm"
          >
            <Loader2Icon className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t('Loading PDF...')}</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <AlertCircleIcon className="size-5 shrink-0 text-destructive" />
              <div className="text-sm">
                <p className="font-medium text-destructive">
                  {t('Failed to load PDF')}
                </p>
                <p className="mt-0.5 text-muted-foreground">{error}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setError(null); setIsLoading(true); }} className="gap-1.5">
              {t('Retry')}
            </Button>
          </div>
        )}

        {/* Canvas — double-click to jump to approximate source line */}
        <div className="flex min-h-full justify-center p-4">
          <canvas
            ref={canvasRef}
            className="shadow-lg cursor-crosshair"
            style={{ display: error ? 'none' : 'block' }}
            onDoubleClick={(e) => {
              const canvas = canvasRef.current;
              if (!canvas || !pdfDocRef.current) return;
              const rect = canvas.getBoundingClientRect();
              const yRatio = (e.clientY - rect.top) / rect.height;
              // Estimate source line from vertical position on page
              // Rough heuristic: page content maps linearly to source lines
              const totalPages = pdfDocRef.current.numPages;
              const estimatedLine = Math.max(1, Math.round(
                ((currentPage - 1) / totalPages + yRatio / totalPages) * 100
              ));
              window.dispatchEvent(new CustomEvent('editor-goto-line', { detail: estimatedLine }));
            }}
            title="Double-click to jump to approximate source line"
          />
        </div>
      </div>
    </div>
  );
}
