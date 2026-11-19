/** Hand a printed quote from an iOS Home Screen app to Safari.
    The hash carries only fields the printed sheet shows. */

import { normalizeQuote, normalizeQuoteLine } from "./quote-math.f52633f.js";

const PRINT_BUDGET = 8000;

export function isStandalone(nav = globalThis.navigator, matchMedia = globalThis.matchMedia) {
  let displayMode = false;
  try {
    displayMode = Boolean(matchMedia && matchMedia("(display-mode: standalone)")?.matches);
  } catch (error) {
    displayMode = false;
  }
  return nav?.standalone === true || displayMode;
}

function publicLine(line) {
  const clean = normalizeQuoteLine(line);
  return {
    id: clean.id,
    name: clean.name,
    description: clean.description,
    tier: clean.tier || "",
    price: clean.price,
    qty: clean.qty,
    listPrice: clean.listPrice,
    custom: clean.custom,
    labor: clean.labor,
    taxable: clean.taxable,
    partNumber: clean.partNumber,
    partTouched: true,
  };
}

/** Keep the vehicle text that is on the sheet, and drop every private field. */
export function printableQuote(quote, vehicle) {
  const source = normalizeQuote(quote);
  const shown = vehicle == null ? source.vehicle : String(vehicle);
  return {
    customerName: source.customerName,
    phone: source.phone,
    vehicle: shown,
    vehicleTouched: shown !== "" || source.vehicleTouched,
    salesperson: source.salesperson,
    number: source.number,
    lines: source.lines.map(publicLine),
  };
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(text) {
  const pad = (4 - (text.length % 4)) % 4;
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(pad);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Synchronous LZ77 so the Safari link can open inside the tap. */
function compressBytes(input) {
  const out = [];
  const head = new Map();
  const prev = new Int32Array(input.length);
  const link = (at) => {
    if (at + 2 >= input.length) return;
    const key = (input[at] << 16) | (input[at + 1] << 8) | input[at + 2];
    prev[at] = head.has(key) ? head.get(key) : -1;
    head.set(key, at);
  };
  let i = 0;
  while (i < input.length) {
    let bestLen = 0;
    let bestDist = 0;
    if (i + 3 <= input.length) {
      const key = (input[i] << 16) | (input[i + 1] << 8) | input[i + 2];
      let j = head.has(key) ? head.get(key) : -1;
      let guard = 0;
      while (j >= 0 && i - j <= 65535 && guard < 48) {
        const maxLen = Math.min(255, input.length - i);
        let len = 0;
        while (len < maxLen && input[j + len] === input[i + len]) len += 1;
        if (len > bestLen) {
          bestLen = len;
          bestDist = i - j;
        }
        j = prev[j];
        guard += 1;
      }
    }
    link(i);
    if (bestLen >= 4) {
      out.push(255, bestLen, bestDist >> 8, bestDist & 255);
      for (let k = i + 1; k < i + bestLen; k += 1) link(k);
      i += bestLen;
    } else if (input[i] >= 254) {
      out.push(254, input[i]);
      i += 1;
    } else {
      out.push(input[i]);
      i += 1;
    }
  }
  return Uint8Array.from(out);
}

function decompressBytes(input) {
  const out = [];
  for (let i = 0; i < input.length; i += 1) {
    const marker = input[i];
    if (marker === 255) {
      const len = input[i + 1];
      const dist = (input[i + 2] << 8) | input[i + 3];
      i += 3;
      if (!len || !dist || dist > out.length) throw new Error("Bad print payload.");
      for (let n = 0; n < len; n += 1) out.push(out[out.length - dist]);
    } else if (marker === 254) {
      i += 1;
      out.push(input[i]);
    } else {
      out.push(marker);
    }
  }
  return Uint8Array.from(out);
}

export function encodePrintHash(quote, vehicle, baseLength = 0) {
  const json = JSON.stringify(printableQuote(quote, vehicle));
  const plainBytes = new TextEncoder().encode(json);
  const plain = bytesToBase64Url(plainBytes);
  const room = PRINT_BUDGET - Math.max(0, Number(baseLength) || 0) - "#print=".length;
  let token = plain;
  if (plain.length > room) {
    const packed = `z${bytesToBase64Url(compressBytes(plainBytes))}`;
    if (packed.length < plain.length) token = packed;
  }
  return `#print=${token}`;
}

export function decodePrintHash(hash) {
  const match = String(hash || "").match(/(?:^|#)print=([^&#]*)/);
  if (!match) return null;
  try {
    let token = match[1];
    try {
      token = decodeURIComponent(token);
    } catch (error) {
      token = match[1];
    }
    const compressed = token.startsWith("z");
    const bytes = base64UrlToBytes(compressed ? token.slice(1) : token);
    const jsonBytes = compressed ? decompressBytes(bytes) : bytes;
    const data = JSON.parse(new TextDecoder().decode(jsonBytes));
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return printableQuote(data);
  } catch (error) {
    return null;
  }
}

export function printUrlLength(href) {
  return String(href || "").length;
}
