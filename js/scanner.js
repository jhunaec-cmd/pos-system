/*
  scanner.js
  ----------
  Detects input from a USB/Bluetooth barcode scanner. These scanners work
  by pretending to be a keyboard: they "type" every digit of the barcode
  almost instantly (a few milliseconds apart) and then send an Enter key.

  A human typing on a real keyboard can't type that fast, so we use timing
  as the signal: if a burst of characters arrives with very small gaps
  between keystrokes and ends in Enter, we treat it as a scan. Otherwise we
  do nothing and let the keystrokes behave normally (e.g. typing in the
  manual search box).

  This listens on the whole document, so scanning works no matter what
  element currently has focus - no need for a special always-focused input.
*/

// How many milliseconds between keystrokes still counts as "part of the
// same fast burst". Some scanners (especially older/Bluetooth ones) send
// characters a bit slower than others, so this is adjustable in Settings:
// - "low" is strict (fewer accidental triggers from fast human typing)
// - "high" is lenient (catches slower scanners, at a small risk of a very
//   fast typist accidentally triggering a "scan")
export const SENSITIVITY_PRESETS = {
  low: 25,
  medium: 50,
  high: 100,
};

const MIN_SCAN_LENGTH = 3; // shortest barcode we'll accept as a real scan

/**
 * Starts listening for scanner input.
 * @param {(code: string) => void} onScan - called with the scanned barcode text.
 * @param {"low"|"medium"|"high"} sensitivity - how lenient the timing check is.
 */
export function initScanner(onScan, sensitivity = "medium") {
  const maxKeyGap = SENSITIVITY_PRESETS[sensitivity] || SENSITIVITY_PRESETS.medium;

  let buffer = "";
  let lastKeyTime = 0;

  document.addEventListener("keydown", (event) => {
    // Ignore modifier/navigation keys entirely - they're not part of a barcode.
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    const now = performance.now();
    const gap = now - lastKeyTime;
    lastKeyTime = now;

    if (event.key === "Enter") {
      if (buffer.length >= MIN_SCAN_LENGTH) {
        event.preventDefault(); // stop the Enter from submitting whatever field has focus
        onScan(buffer);
      }
      buffer = "";
      return;
    }

    // A single printable character (letters, digits, symbols) - part of a
    // potential barcode.
    if (event.key.length === 1) {
      // Too slow since the last key: this is a fresh burst (or human typing),
      // start the buffer over.
      buffer = gap > maxKeyGap ? event.key : buffer + event.key;
    } else {
      // Any other key (Tab, arrows, Backspace, etc.) breaks the burst.
      buffer = "";
    }
  });
}
