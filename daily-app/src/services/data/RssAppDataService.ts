import type { DashboardData, DataService, DetailData, ListData } from "./DataService";
import { parseRssFeed, type ParsedRssItem } from "./rssParser";
import { RssConfigService } from "./RssConfigService";
import { ShoppingConfigService } from "./ShoppingConfigService";
import type { EditableShoppingItem } from "./shoppingConfig";
import type { EvenHubDeviceInfo, EvenHubDeviceStatus } from "../../bridge/evenHubTypes";

export const RSS_LIST_ID = "rss";
export const SHOPPING_LIST_ID = "shopping-list";
export const SHOPPING_DIVIDER_ITEM_ID = "__shopping-divider__";
const RSS_PROXY_PATH = "/rss-proxy";

export class RssAppDataService implements DataService {
  private rssItems: ParsedRssItem[] = [];
  private shoppingItems: EditableShoppingItem[] = [];
  private launchSource: string | null = null;
  private userName: string | null = null;
  private deviceStatusText = "G2: status unknown";
  constructor(
    private readonly rssConfigService: RssConfigService,
    private readonly shoppingConfigService: ShoppingConfigService
  ) {}

  private readonly dashboardBase: DashboardData = {
    title: "Dashboard",
    items: [
      {
        id: "dashboard-rss",
        label: "RSS Feeds",
        listId: RSS_LIST_ID,
        description: "Read the latest stories from your configured RSS feeds.",
      },
      {
        id: "dashboard-shopping-list",
        label: "Shopping List",
        listId: SHOPPING_LIST_ID,
        description: "Check off open items and review what is already done.",
      },
    ],
  };

  setLaunchSource(source: string): void {
    this.launchSource = source;
  }

  setUserName(name: string): void {
    this.userName = name.trim() || null;
  }

  setDeviceInfo(info: EvenHubDeviceInfo | null): void {
    if (!info) {
      this.deviceStatusText = "G2: not connected";
      return;
    }

    this.deviceStatusText = formatDeviceStatus(info.status, info.model);
  }

  setDeviceStatus(status: EvenHubDeviceStatus): void {
    this.deviceStatusText = formatDeviceStatus(status);
  }

  async refreshList(listId: string): Promise<void> {
    if (listId === SHOPPING_LIST_ID) {
      this.shoppingItems = await this.shoppingConfigService.loadEditableItems();
      return;
    }

    if (listId !== RSS_LIST_ID) {
      return;
    }

    const feeds = await this.rssConfigService.loadRuntimeFeeds();
    if (feeds.length === 0) {
      throw new Error("No valid RSS feeds configured.");
    }

    const responses = await Promise.allSettled(
      feeds.map(async (feed) => {
        try {
          const xml = await fetchFeedXml(feed.url);
          return parseRssFeed(xml, feed);
        } catch (error) {
          const reason = readErrorMessage(error);
          throw new Error(`${feed.title}: ${reason}`);
        }
      })
    );

    const loadedItems: ParsedRssItem[] = [];
    const failedFeeds: string[] = [];
    for (const response of responses) {
      if (response.status === "fulfilled") {
        loadedItems.push(...response.value);
      } else {
        failedFeeds.push(readErrorMessage(response.reason));
      }
    }

    if (loadedItems.length > 0) {
      this.rssItems = loadedItems.sort(compareByPublishedDateDesc);
      return;
    }

    if (this.rssItems.length > 0) {
      throw new Error("RSS feeds are unreachable. Showing the last update.");
    }

    const detail = failedFeeds.length > 0 ? ` Details: ${failedFeeds.join(" | ")}` : "";
    throw new Error(`Unable to load RSS feeds.${detail}`);
  }

  getDashboard(): DashboardData {
    return {
      ...this.dashboardBase,
      statusLine: this.getStatusLine(),
    };
  }

  private getStatusLine(): string {
    const parts = [this.deviceStatusText];
    if (this.launchSource) {
      parts.push(`Start: ${this.launchSource}`);
    }
    if (this.userName) {
      parts.push(`User: ${this.userName}`);
    }
    return parts.join(" | ");
  }

  getList(listId: string): ListData {
    if (listId === SHOPPING_LIST_ID) {
      const sorted = sortShoppingItems(this.shoppingItems);
      const openItems = sorted.filter((item) => !item.done);
      const doneItems = sorted.filter((item) => item.done);
      const hasDivider = openItems.length > 0 && doneItems.length > 0;

      return {
        id: SHOPPING_LIST_ID,
        title: "Shopping List",
        items: [
          ...openItems.map((item) => ({
            id: item.id,
            label: `[ ] ${item.title}`,
          })),
          ...(hasDivider
            ? [{ id: SHOPPING_DIVIDER_ITEM_ID, label: "-------- Done --------" }]
            : []),
          ...doneItems.map((item) => ({
            id: item.id,
            label: `[x] ${item.title}`,
          })),
        ],
      };
    }

    if (listId !== RSS_LIST_ID) {
      return {
        id: listId,
        title: "List",
        items: [],
      };
    }

    return {
      id: RSS_LIST_ID,
      title: "RSS Feeds",
      items: this.rssItems.map((item) => ({
        id: item.id,
        label: `${item.title} - ${item.snippet}`,
      })),
    };
  }

  async toggleShoppingItem(itemId: string): Promise<void> {
    const index = this.shoppingItems.findIndex((item) => item.id === itemId);
    if (index < 0) {
      return;
    }

    const nextItems = this.shoppingItems.map((item) => ({ ...item }));
    const target = nextItems[index];
    if (!target) {
      return;
    }

    target.done = !target.done;
    await this.shoppingConfigService.saveEditableItems(nextItems);
    // Read back from storage so glasses state and companion LocalStorage stay in sync.
    this.shoppingItems = await this.shoppingConfigService.loadEditableItems();
  }

  async addShoppingItem(title: string): Promise<void> {
    await this.shoppingConfigService.addEditableItem(title);
    this.shoppingItems = await this.shoppingConfigService.loadEditableItems();
  }

  getDetail(itemId: string): DetailData {
    const item = this.rssItems.find((entry) => entry.id === itemId);
    if (!item) {
      return {
        id: itemId,
        title: "Item not found",
        description: "This RSS item is no longer available.",
        pages: ["This RSS item is no longer available."],
        source: "RSS",
      };
    }

    return {
      id: item.id,
      title: item.title,
      // The detail screen reads the full article body, not the short list summary.
      description: item.content,
      pages: item.pages,
      source: item.source,
      link: item.link,
      pubDateText: item.pubDateText,
    };
  }

  getAdjacentItemId(itemId: string, direction: "up" | "down"): string | null {
    const index = this.rssItems.findIndex((item) => item.id === itemId);
    if (index < 0) {
      return null;
    }

    const offset = direction === "up" ? -1 : 1;
    const targetIndex = index + offset;
    const target = this.rssItems[targetIndex];

    return target ? target.id : null;
  }
}

function formatDeviceStatus(status: EvenHubDeviceStatus | undefined, model = "G2"): string {
  if (!status) {
    return `${model.toUpperCase()}: status unknown`;
  }

  const battery = typeof status.batteryLevel === "number" ? ` ${status.batteryLevel}%` : "";
  const wearing = status.isWearing === undefined ? "" : status.isWearing ? " worn" : " not worn";
  const charging = status.isCharging ? " charging" : "";
  return `${model.toUpperCase()}: ${status.connectType}${battery}${wearing}${charging}`;
}

function sortShoppingItems(items: EditableShoppingItem[]): EditableShoppingItem[] {
  return [...items].sort((a, b) => {
    const byState = Number(a.done) - Number(b.done);
    if (byState !== 0) {
      return byState;
    }

    const byPosition = a.position - b.position;
    if (byPosition !== 0) {
      return byPosition;
    }

    return a.title.localeCompare(b.title);
  });
}

function compareByPublishedDateDesc(a: ParsedRssItem, b: ParsedRssItem): number {
  const aDate = a.pubDateMs;
  const bDate = b.pubDateMs;

  if (aDate === null && bDate === null) {
    return a.title.localeCompare(b.title);
  }
  if (aDate === null) {
    return 1;
  }
  if (bDate === null) {
    return -1;
  }
  return bDate - aDate;
}

function readErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}

async function fetchFeedXml(url: string): Promise<string> {
  try {
    return await fetchXml(url);
  } catch (directError) {
    if (!shouldUseProxyFallback(directError)) {
      throw directError;
    }
    if (!import.meta.env.DEV) {
      throw new Error(
        `${readErrorMessage(directError)} (blocked by CORS, proxy fallback is available in DEV only)`
      );
    }

    const proxiedUrl = `${RSS_PROXY_PATH}?url=${encodeURIComponent(url)}`;
    try {
      return await fetchXml(proxiedUrl);
    } catch (proxyError) {
      throw new Error(
        `${readErrorMessage(directError)}; proxy fallback failed: ${readErrorMessage(proxyError)}`
      );
    }
  }
}

async function fetchXml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

function shouldUseProxyFallback(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  const message = readErrorMessage(error).toLowerCase();
  return message.includes("cors") || message.includes("failed to fetch");
}
