import { beforeAll, describe, expect, it } from "vitest";
import { measureTextWrap } from "@evenrealities/pretext";
import { DOMParser as XmlDomParser } from "@xmldom/xmldom";
import {
  EMPTY_CONTENT_TEXT,
  htmlToText,
  paginateText,
  parseRssFeed,
} from "../../../src/services/data/rssParser";
import type { RssFeedConfig } from "../../../src/services/data/rssConfig";

const FEED: RssFeedConfig = {
  id: "demo",
  title: "Demo Feed",
  url: "https://example.com/rss.xml",
  maxEntries: 10,
};

beforeAll(() => {
  // The G2 WebView ships a native DOMParser; node needs a standalone XML parser.
  (globalThis as unknown as { DOMParser: unknown }).DOMParser = XmlDomParser;
});

describe("parseRssFeed", () => {
  it("prefers content:encoded over the short description", () => {
    const paragraphs = Array.from(
      { length: 12 },
      (_, index) => `<p>Paragraph ${index + 1} carries a meaningful amount of article text.</p>`
    ).join("");
    const xml = buildRssFeed(`
      <item>
        <title>Full article</title>
        <link>https://example.com/full</link>
        <description>Short teaser sentence.</description>
        <content:encoded><![CDATA[${paragraphs}]]></content:encoded>
      </item>
    `);

    const [item] = parseRssFeed(xml, FEED);

    expect(item.title).toBe("Full article");
    expect(item.summary).toBe("Short teaser sentence.");
    expect(item.snippet).toBe("Short teaser sentence.");
    expect(item.content).toContain("Paragraph 1 carries");
    expect(item.content).toContain("Paragraph 12 carries");
    expect(item.content).not.toContain("Short teaser sentence.");
  });

  it("paginates the full article body instead of the list snippet", () => {
    const paragraphs = Array.from(
      { length: 12 },
      (_, index) => `<p>Paragraph ${index + 1} carries a meaningful amount of article text.</p>`
    ).join("");
    const xml = buildRssFeed(`
      <item>
        <title>Full article</title>
        <description>Short teaser sentence.</description>
        <content:encoded><![CDATA[${paragraphs}]]></content:encoded>
      </item>
    `);

    const [item] = parseRssFeed(xml, FEED);

    expect(item.pages.length).toBeGreaterThan(1);
    expect(item.pages.join(" ")).toContain("Paragraph 12 carries");
    expect(item.pages).toEqual(paginateText(item.content));
  });

  it("falls back to the description when no full content field exists", () => {
    const xml = buildRssFeed(`
      <item>
        <title>Teaser only</title>
        <description><![CDATA[<p>Only a short teaser is published in this feed.</p>]]></description>
      </item>
    `);

    const [item] = parseRssFeed(xml, FEED);

    expect(item.content).toBe("Only a short teaser is published in this feed.");
    expect(item.summary).toBe("Only a short teaser is published in this feed.");
    expect(item.pages).toEqual(["Only a short teaser is published in this feed."]);
  });

  it("derives a short list snippet when the feed only ships full content", () => {
    const body = Array.from({ length: 8 }, (_, index) => `<p>Body block ${index + 1}.</p>`).join("");
    const xml = buildRssFeed(`
      <item>
        <title>No summary</title>
        <content:encoded><![CDATA[${body}]]></content:encoded>
      </item>
    `);

    const [item] = parseRssFeed(xml, FEED);

    expect(item.snippet.length).toBeLessThanOrEqual(72);
    expect(item.snippet.startsWith("Body block 1.")).toBe(true);
    expect(item.content).toContain("Body block 8.");
  });

  it("keeps Atom entries working", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>Atom entry</title>
          <link rel="alternate" href="https://example.com/atom-entry" />
          <summary>Atom teaser.</summary>
          <content type="html">&lt;p&gt;Atom body paragraph.&lt;/p&gt;</content>
          <updated>Tue, 05 Aug 2025 10:00:00 GMT</updated>
        </entry>
      </feed>`;

    const [item] = parseRssFeed(xml, FEED);

    expect(item.title).toBe("Atom entry");
    expect(item.link).toBe("https://example.com/atom-entry");
    expect(item.summary).toBe("Atom teaser.");
    expect(item.content).toBe("Atom body paragraph.");
    expect(item.pubDateMs).not.toBeNull();
  });

  it("cleans HTML noise out of the article body", () => {
    const xml = buildRssFeed(`
      <item>
        <title>Noisy</title>
        <description>Teaser.</description>
        <content:encoded><![CDATA[
          <style>.ad { display: none; }</style>
          <p>First paragraph with <strong>markup</strong>.</p>
          <img src="https://tracker.example.com/pixel.gif" width="1" height="1" />
          <script>trackEverything();</script>
          <p>Second paragraph &amp; an entity &#8211; done.</p>
          <div class="broken
        ]]></content:encoded>
      </item>
    `);

    const [item] = parseRssFeed(xml, FEED);

    expect(item.content).toBe("First paragraph with markup.\n\nSecond paragraph & an entity - done.");
    expect(item.content).not.toContain("trackEverything");
    expect(item.content).not.toContain("display: none");
    expect(item.content).not.toContain("pixel.gif");
    expect(item.content).not.toContain("<");
  });

  it("does not crash on empty or missing item content", () => {
    const xml = buildRssFeed(`
      <item>
        <description></description>
      </item>
      <item>
        <title>Only a title</title>
      </item>
    `);

    const items = parseRssFeed(xml, FEED);

    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Untitled");
    expect(items[0].content).toBe("");
    expect(items[0].pages).toEqual([EMPTY_CONTENT_TEXT]);
    expect(items[1].title).toBe("Only a title");
    expect(items[1].pages).toEqual([EMPTY_CONTENT_TEXT]);
  });

  it("reports malformed XML as a readable error instead of crashing", () => {
    expect(() => parseRssFeed("<rss><channel><item><title>A</title>", FEED)).toThrow(
      /Invalid RSS XML for Demo Feed/
    );
  });

  it("respects the configured entry limit", () => {
    const xml = buildRssFeed(
      Array.from({ length: 5 }, (_, index) => `<item><title>Item ${index + 1}</title></item>`).join("")
    );

    expect(parseRssFeed(xml, { ...FEED, maxEntries: 2 })).toHaveLength(2);
  });
});

describe("htmlToText", () => {
  it("keeps paragraph separation", () => {
    expect(htmlToText("<p>Hello <strong>world</strong>.</p><p>Second paragraph.</p>")).toBe(
      "Hello world.\n\nSecond paragraph."
    );
  });

  it("turns list items and line breaks into readable lines", () => {
    expect(htmlToText("<ul><li>One</li><li>Two</li></ul><p>After<br/>break</p>")).toBe(
      "One\n\nTwo\n\nAfter\nbreak"
    );
  });

  it("decodes common entities", () => {
    expect(htmlToText("Tom &amp; Jerry &#8211; &quot;quoted&quot; &hellip; 5&nbsp;km")).toBe(
      'Tom & Jerry - "quoted" ... 5 km'
    );
  });

  it("collapses excessive whitespace and repeated blank lines", () => {
    expect(htmlToText("<p>One</p>\n\n\n\n<p>   Two   </p>")).toBe("One\n\nTwo");
  });

  it("returns an empty string for empty or tag-only markup", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText("   ")).toBe("");
    expect(htmlToText("<div></div>")).toBe("");
  });
});

describe("paginateText", () => {
  it("keeps generated pages inside the G2 detail body pixel budget", () => {
    const text = Array.from({ length: 160 }, (_, index) => `Word${index}`).join(" ");

    const pages = paginateText(text);

    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(480);
      expect(measureTextWrap(page, 568).height).toBeLessThanOrEqual(162);
    }
  });

  it("keeps a short article on a single page", () => {
    expect(paginateText("A very short article body.")).toEqual(["A very short article body."]);
  });

  it("splits multi paragraph articles without losing the paragraph breaks", () => {
    const article = Array.from(
      { length: 10 },
      (_, index) => `Paragraph ${index + 1} with enough words to occupy a couple of display lines.`
    ).join("\n\n");

    const pages = paginateText(article);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.some((page) => page.includes("\n\n"))).toBe(true);
    expect(pages.join(" ")).toContain("Paragraph 10");
    for (const page of pages) {
      expect(measureTextWrap(page, 568).height).toBeLessThanOrEqual(162);
    }
  });

  it("returns fallback text for empty content", () => {
    expect(paginateText("   ")).toEqual([EMPTY_CONTENT_TEXT]);
  });
});

function buildRssFeed(itemsXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
      <channel>
        <title>Demo Feed</title>
        ${itemsXml}
      </channel>
    </rss>`;
}
