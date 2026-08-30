import { measureTextWrap } from "@evenrealities/pretext";
import type { RssFeedConfig } from "./rssConfig";

const DEFAULT_SNIPPET_LENGTH = 72;
const DEFAULT_DETAIL_PAGE_LENGTH = 480;
const DEFAULT_PAGE_WIDTH_PX = 568;
const DEFAULT_PAGE_HEIGHT_PX = 162;

export const EMPTY_CONTENT_TEXT = "No content available.";
export const UNTITLED_ITEM_TEXT = "Untitled";

// Full article bodies first, short summaries last.
const CONTENT_FIELDS = [
  "content:encoded",
  "content",
  "dc:content",
  "description",
  "summary",
  "subtitle",
];

// Short list summaries first, the full body is only used as a derivation source.
const SUMMARY_FIELDS = ["description", "summary", "subtitle", "itunes:summary"];

export interface ParsedRssItem {
  id: string;
  title: string;
  /** Short, clean text used for the compact list presentation. */
  summary: string;
  /** One line derived from {@link summary}, already truncated for a list row. */
  snippet: string;
  /** Full readable article body, HTML free. */
  content: string;
  /** {@link content} split into G2 sized detail pages. */
  pages: string[];
  link?: string;
  source: string;
  pubDateText?: string;
  pubDateMs: number | null;
}

export function parseRssFeed(
  xml: string,
  feed: RssFeedConfig,
  options: { snippetLength?: number; pageLength?: number } = {}
): ParsedRssItem[] {
  const doc = parseXmlDocument(xml, feed.title);

  const snippetLength = options.snippetLength ?? DEFAULT_SNIPPET_LENGTH;
  const pageLength = options.pageLength ?? DEFAULT_DETAIL_PAGE_LENGTH;
  const entries = readFeedEntries(doc);

  return entries.slice(0, feed.maxEntries).map((entry, index) => {
    const title = normalizeWhitespace(readFieldText(entry, ["title"])) || UNTITLED_ITEM_TEXT;

    const content = htmlToText(readFieldText(entry, CONTENT_FIELDS));
    const summarySource = htmlToText(readFieldText(entry, SUMMARY_FIELDS));
    const summary = normalizeWhitespace(summarySource) || toOneLineSnippet(content, DEFAULT_SNIPPET_LENGTH * 3);
    const body = content || summary;

    const pubDateText = normalizeWhitespace(readFieldText(entry, ["pubDate", "published", "updated", "dc:date"]));
    const link = readLink(entry);
    const guid = normalizeWhitespace(readFieldText(entry, ["guid", "id"]));

    return {
      id: buildItemId(feed.id, guid || link || `${title}-${index}`),
      title,
      summary,
      snippet: toOneLineSnippet(summary, snippetLength),
      content: body,
      pages: paginateText(body, pageLength),
      link: link || undefined,
      source: feed.title,
      pubDateText: pubDateText || undefined,
      pubDateMs: toTimestamp(pubDateText),
    };
  });
}

function parseXmlDocument(xml: string, feedTitle: string): Document {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch (error) {
    throw new Error(`Invalid RSS XML for ${feedTitle}: ${readErrorMessage(error)}`);
  }

  if (!doc || !doc.documentElement || doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`Invalid RSS XML for ${feedTitle}`);
  }

  return doc;
}

/** RSS 2.0 / RDF use <item>, Atom uses <entry>. */
function readFeedEntries(doc: Document): Element[] {
  const items = Array.from(doc.getElementsByTagName("item"));
  if (items.length > 0) {
    return items;
  }
  return Array.from(doc.getElementsByTagName("entry"));
}

function childElements(entry: Element): Element[] {
  const elements: Element[] = [];
  const nodes = entry.childNodes;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node && node.nodeType === 1) {
      elements.push(node as Element);
    }
  }
  return elements;
}

/**
 * Returns the raw (still HTML bearing) text of the first field that carries content.
 * Only direct children are inspected so a nested <media:*> block cannot shadow the body.
 */
function readFieldText(entry: Element, fieldNames: string[]): string {
  const children = childElements(entry);

  for (const fieldName of fieldNames) {
    const wanted = fieldName.toLowerCase();
    for (const child of children) {
      if (!matchesFieldName(child, wanted)) {
        continue;
      }
      const value = child.textContent ?? "";
      if (value.trim()) {
        return value;
      }
    }
  }

  return "";
}

function matchesFieldName(element: Element, wantedLowerCase: string): boolean {
  const nodeName = (element.nodeName || "").toLowerCase();
  if (nodeName === wantedLowerCase) {
    return true;
  }

  // Namespace aware parsers expose "content:encoded" as localName "encoded",
  // so only compare local names for unprefixed lookups.
  if (wantedLowerCase.includes(":")) {
    return false;
  }

  const localName = (element.localName || nodeName).toLowerCase();
  return localName === wantedLowerCase && !nodeName.includes(":");
}

function readLink(entry: Element): string {
  const direct = normalizeWhitespace(readFieldText(entry, ["link"]));
  if (direct) {
    return direct;
  }

  // Atom stores the target in the href attribute of <link rel="alternate" />.
  for (const child of childElements(entry)) {
    if (!matchesFieldName(child, "link")) {
      continue;
    }
    const rel = child.getAttribute?.("rel");
    if (rel && rel !== "alternate") {
      continue;
    }
    const href = normalizeWhitespace(child.getAttribute?.("href") || "");
    if (href) {
      return href;
    }
  }

  return "";
}

const REMOVED_BLOCK_TAGS = "script|style|noscript|iframe|svg|video|audio|form|template|figcaption";
const REMOVED_VOID_TAGS = "img|image|picture|source|track|embed|object|param|input|button|canvas|link|meta|base|area|map";
const PARAGRAPH_TAGS = "p|div|li|h[1-6]|blockquote|section|article|figure|tr|pre|hr|header|footer|aside|nav|ul|ol|dl|dt|dd|table|tbody|thead";

/**
 * Converts feed HTML into plain text suitable for the G2 display without pulling in a DOM.
 * Scripts, styles, images and tracking pixels are dropped, block elements become
 * paragraph breaks and entities are decoded.
 */
export function htmlToText(value: string): string {
  if (!value || !value.trim()) {
    return "";
  }

  let text = value;

  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<\?[\s\S]*?\?>/g, " ");
  text = text.replace(new RegExp(`<(${REMOVED_BLOCK_TAGS})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi"), " ");
  // Unterminated script/style blocks would otherwise leak their source into the article.
  text = text.replace(new RegExp(`<(${REMOVED_BLOCK_TAGS})\\b[^>]*>[\\s\\S]*$`, "gi"), " ");
  text = text.replace(new RegExp(`<\\/?(${REMOVED_VOID_TAGS})\\b[^>]*>`, "gi"), " ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(new RegExp(`<\\/?(${PARAGRAPH_TAGS})\\b[^>]*>`, "gi"), "\n\n");
  text = text.replace(/<[^>]*>/g, "");
  // Trailing malformed markup such as "<div class=" never closes; drop the artifact.
  text = text.replace(/<[^<>]*$/, "");

  return normalizeParagraphs(decodeHtmlEntities(text));
}

/** Kept for callers that only need HTML removed; identical to {@link htmlToText}. */
export function stripHtml(value: string): string {
  return htmlToText(value);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  shy: "",
  ndash: "-",
  mdash: "-",
  minus: "-",
  hellip: "...",
  lsquo: "'",
  rsquo: "'",
  sbquo: "'",
  ldquo: '"',
  rdquo: '"',
  bdquo: '"',
  laquo: '"',
  raquo: '"',
  bull: "*",
  middot: "*",
  deg: " degrees",
  copy: "(c)",
  reg: "(r)",
  trade: "(tm)",
  times: "x",
  divide: "/",
  euro: "EUR",
  pound: "GBP",
  yen: "JPY",
  cent: "c",
  auml: "ae",
  ouml: "oe",
  uuml: "ue",
  Auml: "Ae",
  Ouml: "Oe",
  Uuml: "Ue",
  szlig: "ss",
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) {
        return match;
      }
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }

    const exact = NAMED_ENTITIES[entity];
    if (exact !== undefined) {
      return exact;
    }

    const lowercase = NAMED_ENTITIES[entity.toLowerCase()];
    return lowercase ?? match;
  });
}

// The G2 font renders plain ASCII best, so typographic punctuation is folded down.
const TYPOGRAPHY_REPLACEMENTS: Record<string, string> = {
  "\u00a0": " ",
  "\u00ad": "",
  "«": '"',
  "»": '"',
  "·": "*",
  "‒": "-",
  "–": "-",
  "—": "-",
  "―": "-",
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "•": "*",
  "…": "...",
  "′": "'",
  "″": '"',
};

const TYPOGRAPHY_PATTERN = new RegExp(`[${Object.keys(TYPOGRAPHY_REPLACEMENTS).join("")}]`, "g");

function foldTypography(value: string): string {
  return value.replace(TYPOGRAPHY_PATTERN, (character) => TYPOGRAPHY_REPLACEMENTS[character] ?? character);
}

/** Collapses whitespace inside lines but keeps at most one blank line between paragraphs. */
export function normalizeParagraphs(value: string): string {
  return foldTypography(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\p{Cf}\p{Zs}]/gu, " ")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function toOneLineSnippet(value: string, maxLength = DEFAULT_SNIPPET_LENGTH): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function paginateText(value: string, maxPageLength = DEFAULT_DETAIL_PAGE_LENGTH): string[] {
  const normalized = normalizeParagraphs(value);
  if (!normalized) {
    return [EMPTY_CONTENT_TEXT];
  }

  if (fitsPage(normalized, maxPageLength)) {
    return [normalized];
  }

  const pages: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) {
      pages.push(current.trim());
    }
    current = "";
  };

  for (const paragraph of normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (fitsPage(candidate, maxPageLength)) {
      current = candidate;
      continue;
    }

    flush();

    if (fitsPage(paragraph, maxPageLength)) {
      current = paragraph;
      continue;
    }

    const chunks = splitParagraph(paragraph, maxPageLength);
    pages.push(...chunks.slice(0, -1));
    current = chunks.at(-1) ?? "";
  }

  flush();

  return pages.length > 0 ? pages : [EMPTY_CONTENT_TEXT];
}

function splitParagraph(paragraph: string, maxPageLength: number): string[] {
  const pages: string[] = [];
  const words = normalizeWhitespace(paragraph).split(" ");
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (fitsPage(candidate, maxPageLength)) {
      current = candidate;
      continue;
    }

    if (current) {
      pages.push(current);
      current = "";
    }

    if (fitsPage(word, maxPageLength)) {
      current = word;
      continue;
    }

    const chunks = splitLongToken(word, maxPageLength);
    pages.push(...chunks.slice(0, -1));
    current = chunks.at(-1) ?? "";
  }

  if (current) {
    pages.push(current);
  }

  return pages.filter((page) => page.length > 0);
}

function fitsPage(text: string, maxPageLength: number): boolean {
  return (
    text.length <= maxPageLength &&
    measureTextWrap(text, DEFAULT_PAGE_WIDTH_PX).height <= DEFAULT_PAGE_HEIGHT_PX
  );
}

function splitLongToken(token: string, maxPageLength: number): string[] {
  const chunks: string[] = [];
  let cursor = 0;
  const chunkLength = Math.max(1, maxPageLength);
  while (cursor < token.length) {
    chunks.push(token.slice(cursor, cursor + chunkLength));
    cursor += chunkLength;
  }
  return chunks;
}

function toTimestamp(value: string): number | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function readErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function buildItemId(feedId: string, uniqueKey: string): string {
  let hash = 0;
  for (let index = 0; index < uniqueKey.length; index += 1) {
    hash = (hash << 5) - hash + uniqueKey.charCodeAt(index);
    hash |= 0;
  }

  return `${feedId}-${Math.abs(hash).toString(36)}`;
}
