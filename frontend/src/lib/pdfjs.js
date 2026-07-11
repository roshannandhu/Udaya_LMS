import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// PDF.js' legacy build supplies Promise.withResolvers for older WebViews, but
// some supported phone runtimes can still lack AbortSignal.any.
if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any !== 'function') {
  Object.defineProperty(AbortSignal, 'any', {
    configurable: true,
    writable: true,
    value(signals) {
      const controller = new AbortController();
      const entries = [];
      const abort = (signal) => {
        entries.forEach(([item, listener]) => item.removeEventListener('abort', listener));
        if (!controller.signal.aborted) controller.abort(signal?.reason);
      };

      for (const signal of signals) {
        if (signal.aborted) {
          abort(signal);
          break;
        }
        const listener = () => abort(signal);
        entries.push([signal, listener]);
        signal.addEventListener('abort', listener, { once: true });
      }
      return controller.signal;
    },
  });
}

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default pdfjsLib;
