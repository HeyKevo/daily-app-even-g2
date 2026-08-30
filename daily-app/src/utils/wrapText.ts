import { measureTextWrap, pxTruncate } from "@evenrealities/pretext";

const ELLIPSIS = "...";

/**
 * Splits text into lines that each render within `maxWidthPx` on the G2 canvas.
 *
 * SDK list rows do not wrap: a long label is silently cut at the row edge. Status
 * and error copy therefore has to be pre-wrapped into one label per line so the
 * whole message stays readable.
 *
 * When the text needs more than `maxLines` lines the last kept line is truncated
 * with an ellipsis, so the caller never emits more rows than it reserved.
 */
export function wrapTextToLines(text: string, maxWidthPx: number, maxLines = 8): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || maxWidthPx <= 0 || maxLines <= 0) {
    return [];
  }

  const lines: string[] = [];
  let current = "";

  const flush = () => {
    if (current) {
      lines.push(current);
      current = "";
    }
  };

  for (const word of normalized.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (fitsLine(candidate, maxWidthPx)) {
      current = candidate;
      continue;
    }

    flush();

    if (fitsLine(word, maxWidthPx)) {
      current = word;
      continue;
    }

    // A single token wider than the row (a long URL, say) is broken hard so no
    // characters are dropped.
    let rest = word;
    while (rest && !fitsLine(rest, maxWidthPx)) {
      const head = takeFittingPrefix(rest, maxWidthPx);
      if (!head) {
        break;
      }
      lines.push(head);
      rest = rest.slice(head.length);
    }
    current = rest;
  }

  flush();

  if (lines.length <= maxLines) {
    return lines;
  }

  const kept = lines.slice(0, maxLines);
  const lastLine = kept[maxLines - 1] ?? "";
  kept[maxLines - 1] = pxTruncate(`${lastLine}${ELLIPSIS}`, maxWidthPx);
  return kept;
}

function fitsLine(text: string, maxWidthPx: number): boolean {
  return measureTextWrap(text, maxWidthPx).lineCount <= 1;
}

/** Longest prefix of `token` that still renders on one line. */
function takeFittingPrefix(token: string, maxWidthPx: number): string {
  let low = 1;
  let high = token.length;
  let best = "";

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = token.slice(0, middle);
    if (fitsLine(candidate, maxWidthPx)) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return best;
}
