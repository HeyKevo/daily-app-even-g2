export interface RssFeedConfig {
  id: string;
  title: string;
  url: string;
  maxEntries: number;
}

export interface EditableRssFeed {
  id: string;
  title: string;
  url: string;
}

export const RSS_MAX_ENTRIES = 50;

export const DEFAULT_RSS_FEEDS: EditableRssFeed[] = [
  {
    id: "tagesschau",
    title: "Tagesschau",
    url: "https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml",
  },
  {
    id: "ars-technica-ai",
    title: "Ars Technica - AI",
    url: "https://arstechnica.com/ai/feed/",
  },
  {
    id: "ars-technica-everything",
    title: "Ars Technica - Everything",
    url: "https://feeds.arstechnica.com/arstechnica/index",
  },
  {
    id: "the-register-ai-ml",
    title: "The Register - AI + ML",
    url: "https://api.theregister.com/api/v1/article?limit=25&orderBy=published&query=tag%3A%22ai+and+ml%22&remapper=rss&site_id=2",
  },
  {
    id: "the-register-software",
    title: "The Register - Software",
    url: "https://api.theregister.com/api/v1/article?limit=25&orderBy=published&query=tag%3Asoftware&remapper=rss&site_id=2",
  },
  {
    id: "the-register-devops",
    title: "The Register - DevOps",
    url: "https://api.theregister.com/api/v1/article?limit=25&orderBy=published&query=tag%3Adevops&remapper=rss&site_id=2",
  },
  {
    id: "simon-willison-everything",
    title: "Simon Willison - Everything",
    url: "https://simonwillison.net/atom/everything/",
  },
  {
    id: "simon-willison-long-form",
    title: "Simon Willison - Long-form only",
    url: "https://simonwillison.net/atom/entries/",
  },
  {
    id: "pragmatic-engineer",
    title: "The Pragmatic Engineer",
    url: "https://newsletter.pragmaticengineer.com/feed",
  },
  {
    id: "platformer",
    title: "Platformer",
    url: "https://www.platformer.news/rss/",
  },
  {
    id: "404-media",
    title: "404 Media",
    url: "https://www.404media.co/rss/",
  },
  {
    id: "ieee-spectrum-ai",
    title: "IEEE Spectrum - AI",
    url: "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss",
  },
  {
    id: "ieee-spectrum-everything",
    title: "IEEE Spectrum - Everything",
    url: "https://spectrum.ieee.org/feeds/feed.rss",
  },
];
