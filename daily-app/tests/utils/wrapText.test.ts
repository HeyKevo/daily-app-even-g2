import { describe, expect, it } from "vitest";
import { measureTextWrap } from "@evenrealities/pretext";
import { wrapTextToLines } from "../../src/utils/wrapText";

const ROW_WIDTH_PX = 548;

describe("wrapTextToLines", () => {
  it("keeps a short message on a single line", () => {
    expect(wrapTextToLines("Error: offline", ROW_WIDTH_PX)).toEqual(["Error: offline"]);
  });

  it("splits a long message into rows that each fit the list row width", () => {
    const message =
      "Error: Unable to load RSS feeds. Details: Tagesschau: www.tagesschau.de unreachable " +
      "(Failed to fetch) and the dev proxy failed: HTTP 502 Bad Gateway";

    const lines = wrapTextToLines(message, ROW_WIDTH_PX);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureTextWrap(line, ROW_WIDTH_PX).lineCount).toBe(1);
    }
    // Nothing is dropped: the rows rejoin into the original message.
    expect(lines.join(" ")).toBe(message);
  });

  it("hard-breaks a single token that is wider than one row", () => {
    const longUrl = `https://example.com/${"a".repeat(400)}.xml`;

    // A row budget wide enough that the hard break, not the cap, decides the output.
    const lines = wrapTextToLines(longUrl, ROW_WIDTH_PX, 50);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureTextWrap(line, ROW_WIDTH_PX).lineCount).toBe(1);
    }
    expect(lines.join("")).toBe(longUrl);
  });

  it("caps the row count and marks the truncation", () => {
    const message = Array.from({ length: 200 }, (_, index) => `word${index}`).join(" ");

    const lines = wrapTextToLines(message, ROW_WIDTH_PX, 3);

    expect(lines).toHaveLength(3);
    expect(lines.at(-1)).toContain("...");
    for (const line of lines) {
      expect(measureTextWrap(line, ROW_WIDTH_PX).lineCount).toBe(1);
    }
  });

  it("returns no lines for blank input", () => {
    expect(wrapTextToLines("   ", ROW_WIDTH_PX)).toEqual([]);
    expect(wrapTextToLines("something", 0)).toEqual([]);
    expect(wrapTextToLines("something", ROW_WIDTH_PX, 0)).toEqual([]);
  });
});
