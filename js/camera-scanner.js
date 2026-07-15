/*
  camera-scanner.js
  -----------------
  Reads barcodes using a phone/tablet/webcam camera, for devices that don't
  have a USB barcode scanner plugged in.

  This uses the browser's built-in BarcodeDetector API instead of an external
  barcode-reading library - it ships with Chrome, Edge, and Safari, so no
  extra code needs to be downloaded or maintained (keeping with the
  "no frameworks" approach). Its trade-off: Firefox doesn't support it yet,
  so isCameraScanSupported() lets the calling page hide the camera option
  there and fall back to manual search / a USB scanner instead.

  Also requires the page be served over https:// (or http://localhost) -
  browsers block camera access on plain http:// for privacy reasons.
*/

const DESIRED_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "codabar",
  "itf",
  "qr_code",
];

const DETECT_INTERVAL_MS = 350;

/** Whether this browser can scan barcodes with a camera at all. */
export function isCameraScanSupported() {
  return "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
}

/** Picks the barcode formats this browser actually supports, falling back
 * to our full wish-list if the browser can't tell us (older BarcodeDetector
 * implementations don't have getSupportedFormats). */
async function buildDetector() {
  let formats = DESIRED_FORMATS;

  if (typeof BarcodeDetector.getSupportedFormats === "function") {
    try {
      const supported = await BarcodeDetector.getSupportedFormats();
      const filtered = DESIRED_FORMATS.filter((format) => supported.includes(format));
      if (filtered.length > 0) formats = filtered;
    } catch {
      // Ignore - fall back to the full wish-list below.
    }
  }

  return new BarcodeDetector({ formats });
}

/**
 * Starts the camera and begins scanning for a barcode.
 * @param {HTMLVideoElement} videoEl - a <video> element to show the camera feed in.
 * @param {{ onDetect: (code: string) => void, onError: (error: Error) => void }} callbacks
 * @returns {Promise<() => void>} a `stop` function - call it to turn off the camera
 *          (also called automatically the moment a barcode is detected).
 */
export async function startCameraScanner(videoEl, { onDetect, onError }) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }, // prefer the rear camera on phones/tablets
    });
  } catch (error) {
    onError(error);
    return () => {};
  }

  videoEl.srcObject = stream;
  videoEl.setAttribute("playsinline", ""); // required so iOS Safari doesn't force fullscreen
  await videoEl.play();

  const detector = await buildDetector();
  let stopped = false;
  let checking = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(intervalId);
    stream.getTracks().forEach((track) => track.stop());
    videoEl.srcObject = null;
  };

  const intervalId = setInterval(async () => {
    if (stopped || checking) return;
    checking = true;
    try {
      const barcodes = await detector.detect(videoEl);
      if (barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        stop();
        onDetect(code);
      }
    } catch {
      // A frame wasn't ready to decode yet - just try again on the next tick.
    }
    checking = false;
  }, DETECT_INTERVAL_MS);

  return stop;
}
