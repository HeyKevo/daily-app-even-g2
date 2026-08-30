import { describe, expect, it } from "vitest";
import { RssConfigService } from "../../../src/services/data/RssConfigService";
import { DEFAULT_RSS_FEEDS, RSS_MAX_ENTRIES } from "../../../src/services/data/rssConfig";
import type { StorageService } from "../../../src/services/storage/StorageService";

class MemoryStorageService implements StorageService {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string> {
    return this.values.get(key) ?? "";
  }

  async set(key: string, value: string): Promise<boolean> {
    this.values.set(key, value);
    return true;
  }

  seed(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const STORAGE_KEY = "rss_config_v1";

const EXPECTED_DEFAULT_URLS = [
  "https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml",
  "https://arstechnica.com/ai/feed/",
  "https://feeds.arstechnica.com/arstechnica/index",
  "https://api.theregister.com/api/v1/article?limit=25&orderBy=published&query=tag%3A%22ai+and+ml%22&remapper=rss&site_id=2",
  "https://api.theregister.com/api/v1/article?limit=25&orderBy=published&query=tag%3Asoftware&remapper=rss&site_id=2",
  "https://api.theregister.com/api/v1/article?limit=25&orderBy=published&query=tag%3Adevops&remapper=rss&site_id=2",
  "https://simonwillison.net/atom/everything/",
  "https://simonwillison.net/atom/entries/",
  "https://newsletter.pragmaticengineer.com/feed",
  "https://www.platformer.news/rss/",
  "https://www.404media.co/rss/",
  "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss",
  "https://spectrum.ieee.org/feeds/feed.rss",
];

describe("DEFAULT_RSS_FEEDS", () => {
  it("ships the curated feed list with unique ids and valid https urls", () => {
    expect(DEFAULT_RSS_FEEDS.map((feed) => feed.url)).toEqual(EXPECTED_DEFAULT_URLS);

    const ids = DEFAULT_RSS_FEEDS.map((feed) => feed.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const feed of DEFAULT_RSS_FEEDS) {
      expect(feed.title.trim()).not.toBe("");
      expect(new URL(feed.url).protocol).toBe("https:");
    }
  });
});

describe("RssConfigService", () => {
  it("seeds every default feed on first load", async () => {
    const storage = new MemoryStorageService();
    const service = new RssConfigService(storage);

    const feeds = await service.loadEditableFeeds();

    expect(feeds).toEqual(DEFAULT_RSS_FEEDS);
    const stored = await storage.get(STORAGE_KEY);
    expect(JSON.parse(stored)).toEqual({ version: 1, feeds: DEFAULT_RSS_FEEDS });
  });

  it("persists the seeded defaults through ensureSeededDefaults", async () => {
    const storage = new MemoryStorageService();
    const service = new RssConfigService(storage);

    await service.ensureSeededDefaults();

    const stored = JSON.parse(await storage.get(STORAGE_KEY)) as { feeds: unknown };
    expect(stored.feeds).toEqual(DEFAULT_RSS_FEEDS);
  });

  it("keeps the defaults intact when mapped to runtime feeds", async () => {
    const storage = new MemoryStorageService();
    const service = new RssConfigService(storage);

    const runtime = await service.loadRuntimeFeeds();

    expect(runtime).toHaveLength(DEFAULT_RSS_FEEDS.length);
    expect(runtime[3]).toEqual({
      ...DEFAULT_RSS_FEEDS[3],
      maxEntries: RSS_MAX_ENTRIES,
    });
  });

  it("does not re-seed defaults over feeds the user already configured", async () => {
    const storage = new MemoryStorageService();
    storage.seed(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        feeds: [{ id: "mine", title: "Mine", url: "https://example.com/rss" }],
      })
    );
    const service = new RssConfigService(storage);

    const feeds = await service.loadEditableFeeds();

    expect(feeds).toEqual([{ id: "mine", title: "Mine", url: "https://example.com/rss" }]);
  });

  it("falls back to the defaults when stored data is unusable", async () => {
    const storage = new MemoryStorageService();
    storage.seed(STORAGE_KEY, "{not json");
    const service = new RssConfigService(storage);

    const feeds = await service.loadEditableFeeds();

    expect(feeds).toEqual(DEFAULT_RSS_FEEDS);
  });

  it("restores the defaults when the user saves an empty feed list", async () => {
    const storage = new MemoryStorageService();
    const service = new RssConfigService(storage);

    await service.saveEditableFeeds([]);

    expect(await service.loadEditableFeeds()).toEqual(DEFAULT_RSS_FEEDS);
  });
});
