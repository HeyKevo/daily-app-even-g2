import type { StorageService } from "../storage/StorageService";
import {
  DEFAULT_RSS_FEEDS,
  RSS_MAX_ENTRIES,
  type EditableRssFeed,
  type RssFeedConfig,
} from "./rssConfig";

const STORAGE_KEY = "rss_config_v1";
const STORAGE_VERSION = 1;

interface StoredRssConfig {
  version: number;
  feeds: unknown;
}

interface NormalizedResult {
  feeds: EditableRssFeed[];
  changed: boolean;
}

export class RssConfigService {
  constructor(private readonly storage: StorageService) {}

  async ensureSeededDefaults(): Promise<void> {
    await this.loadEditableFeeds();
  }

  async loadEditableFeeds(): Promise<EditableRssFeed[]> {
    const stored = await this.storage.get(STORAGE_KEY);

    if (!stored.trim()) {
      const seeded = cloneFeeds(DEFAULT_RSS_FEEDS);
      await this.persistEditableFeeds(seeded);
      return seeded;
    }

    let parsed: StoredRssConfig;
    try {
      parsed = JSON.parse(stored) as StoredRssConfig;
    } catch {
      const seeded = cloneFeeds(DEFAULT_RSS_FEEDS);
      await this.persistEditableFeeds(seeded);
      return seeded;
    }

    if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.feeds)) {
      const seeded = cloneFeeds(DEFAULT_RSS_FEEDS);
      await this.persistEditableFeeds(seeded);
      return seeded;
    }

    const normalized = normalizeEditableFeeds(parsed.feeds);
    if (normalized.feeds.length === 0) {
      const seeded = cloneFeeds(DEFAULT_RSS_FEEDS);
      await this.persistEditableFeeds(seeded);
      return seeded;
    }

    if (normalized.changed) {
      await this.persistEditableFeeds(normalized.feeds);
    }

    return normalized.feeds;
  }

  async saveEditableFeeds(feeds: EditableRssFeed[]): Promise<void> {
    const normalized = normalizeEditableFeeds(feeds);
    const nextFeeds =
      normalized.feeds.length > 0 ? normalized.feeds : cloneFeeds(DEFAULT_RSS_FEEDS);

    await this.persistEditableFeeds(nextFeeds);
  }

  async loadRuntimeFeeds(): Promise<RssFeedConfig[]> {
    const feeds = await this.loadEditableFeeds();
    return feeds.map((feed) => ({
      ...feed,
      maxEntries: RSS_MAX_ENTRIES,
    }));
  }

  private async persistEditableFeeds(feeds: EditableRssFeed[]): Promise<void> {
    const payload = JSON.stringify({
      version: STORAGE_VERSION,
      feeds,
    });
    const ok = await this.storage.set(STORAGE_KEY, payload);
    if (!ok) {
      throw new Error("Unable to save the RSS configuration.");
    }
  }
}

function normalizeEditableFeeds(feeds: unknown[]): NormalizedResult {
  const normalized: EditableRssFeed[] = [];
  const usedIds = new Set<string>();
  let changed = false;

  for (const candidate of feeds) {
    if (!candidate || typeof candidate !== "object") {
      changed = true;
      continue;
    }

    const entry = candidate as Record<string, unknown>;
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const rawUrl = typeof entry.url === "string" ? entry.url.trim() : "";
    const url = canonicalizeFeedUrl(rawUrl);
    if (!title || !url || !isValidHttpUrl(url)) {
      changed = true;
      continue;
    }
    if (url !== rawUrl) {
      changed = true;
    }

    const fallbackId = createFeedId(title, url);
    const rawId = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!rawId) {
      changed = true;
    }

    const baseId = rawId || fallbackId;
    const finalId = dedupeId(baseId, usedIds);
    if (finalId !== rawId) {
      changed = true;
    }

    normalized.push({
      id: finalId,
      title,
      url,
    });
  }

  return { feeds: normalized, changed };
}

function dedupeId(baseId: string, usedIds: Set<string>): string {
  let candidate = baseId;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function createFeedId(title: string, url: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeSlug = slug || "feed";
  const hash = hashString(`${title}::${url}`).slice(0, 8);
  return `${safeSlug}-${hash}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function canonicalizeFeedUrl(value: string): string {
  if (!value) {
    return "";
  }

  try {
    const parsed = new URL(value);
    if (parsed.hostname === "groups.google.com") {
      parsed.protocol = "https:";
      parsed.pathname = parsed.pathname.replace(/^\/group\//, "/g/");
      return parsed.toString();
    }
    return value;
  } catch {
    return value;
  }
}

function cloneFeeds(feeds: EditableRssFeed[]): EditableRssFeed[] {
  return feeds.map((feed) => ({ ...feed }));
}
