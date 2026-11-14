import { scanAroundCore, type ScanWorkerRequest, type ScanWorkerResponse } from './candidates';

const workerScope = self as unknown as {
  onmessage: ((ev: MessageEvent<ScanWorkerRequest>) => void) | null;
  postMessage: (message: ScanWorkerResponse) => void;
};

workerScope.onmessage = (ev: MessageEvent<ScanWorkerRequest>) => {
  const req = ev.data;
  try {
    const result = scanAroundCore({
      centerXKm: req.centerXKm,
      centerYKm: req.centerYKm,
      radiusKm: req.radiusKm,
      query: req.query,
      eph: req.eph,
      tIdx: req.tIdx,
      windowHours: req.windowHours,
      mastHeightM: req.mastHeightM,
      clientDem: req.clientDem,
      options: req.options,
      artemisRegions: req.artemisRegions,
      onProgress: (progress, phase) => {
        workerScope.postMessage({
          type: 'progress',
          requestId: req.requestId,
          progress,
          phase,
        });
      },
    });

    workerScope.postMessage({
      type: 'result',
      requestId: req.requestId,
      result,
    });
  } catch (err) {
    workerScope.postMessage({
      type: 'error',
      requestId: req.requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
