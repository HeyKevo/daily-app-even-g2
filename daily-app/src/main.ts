import "./style.css";
import { AppController } from "./app/appController";
import { RssConfigService } from "./services/data/RssConfigService";
import { ShoppingConfigService } from "./services/data/ShoppingConfigService";
import type { EditableRssFeed } from "./services/data/rssConfig";
import type { EditableShoppingItem } from "./services/data/shoppingConfig";
import { EvenHubStorageService } from "./services/storage/EvenHubStorageService";

interface FeedDraft {
  id: string;
  title: string;
  url: string;
}

interface FeedFieldErrors {
  title?: string;
  url?: string;
}

interface FeedValidationResult {
  feeds: EditableRssFeed[];
  errors: FeedFieldErrors[];
  formError: string | null;
}

interface ShoppingDraft {
  id: string;
  title: string;
  done: boolean;
}

interface ShoppingFieldErrors {
  title?: string;
}

interface ShoppingValidationResult {
  items: EditableShoppingItem[];
  errors: ShoppingFieldErrors[];
  formError: string | null;
}

const app = requireElement<HTMLDivElement>("#app");
app.innerHTML = `
  <div class="card">
    <h1>Daily App</h1>
    <p>Configure the RSS and shopping data shown on the glasses.</p>
  </div>
  <div class="card">
    <div class="card-head">
      <h1>RSS Config</h1>
      <div class="badge" id="rss-config-status">storage: pending</div>
    </div>
    <p id="rss-config-feedback" class="feedback"></p>
    <div id="feed-list" class="feed-list"></div>
    <div class="actions">
      <button id="add-feed" type="button">Add feed</button>
      <button id="save-feeds" type="button">Save</button>
    </div>
  </div>
  <div class="card">
    <div class="card-head">
      <h1>Shopping Config</h1>
      <div class="badge" id="shopping-config-status">storage: pending</div>
    </div>
    <p id="shopping-config-feedback" class="feedback"></p>
    <div id="shopping-list" class="feed-list"></div>
    <div class="actions">
      <button id="add-shopping-item" type="button">Add todo</button>
      <button id="save-shopping-items" type="button">Save</button>
      <button id="load-shopping-external" type="button" disabled>
        Load open todos from an external source
      </button>
    </div>
  </div>
`;

const rssStatusEl = requireElement<HTMLElement>("#rss-config-status");
const rssFeedbackEl = requireElement<HTMLElement>("#rss-config-feedback");
const feedListEl = requireElement<HTMLDivElement>("#feed-list");
const addFeedButton = requireElement<HTMLButtonElement>("#add-feed");
const saveFeedsButton = requireElement<HTMLButtonElement>("#save-feeds");

const shoppingStatusEl = requireElement<HTMLElement>("#shopping-config-status");
const shoppingFeedbackEl = requireElement<HTMLElement>("#shopping-config-feedback");
const shoppingListEl = requireElement<HTMLDivElement>("#shopping-list");
const addShoppingItemButton = requireElement<HTMLButtonElement>("#add-shopping-item");
const saveShoppingItemsButton = requireElement<HTMLButtonElement>("#save-shopping-items");

const storageService = new EvenHubStorageService();
const rssConfigService = new RssConfigService(storageService);
const shoppingConfigService = new ShoppingConfigService(storageService);

let feeds: FeedDraft[] = [];
let feedErrors: FeedFieldErrors[] = [];
let isRssBusy = false;

let shoppingDrafts: ShoppingDraft[] = [];
let shoppingErrors: ShoppingFieldErrors[] = [];
let isShoppingBusy = false;

const controller = new AppController();
void controller.start().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("AppController start failed:", message);
});

feedListEl.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement | null;
  if (!target) {
    return;
  }

  const index = readIndex(target.dataset.index);
  const field = target.dataset.field;
  if (index === null || !feeds[index]) {
    return;
  }
  if (field !== "title" && field !== "url") {
    return;
  }

  feeds[index][field] = target.value;
  if (feedErrors[index]?.[field]) {
    feedErrors[index][field] = undefined;
    renderFeeds();
  }
});

feedListEl.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>("button[data-action='delete-feed']");
  if (!button) {
    return;
  }

  const index = readIndex(button.dataset.index);
  if (index === null || !feeds[index]) {
    return;
  }

  feeds.splice(index, 1);
  feedErrors.splice(index, 1);
  clearSectionFeedback(rssFeedbackEl);
  renderFeeds();
});

addFeedButton.addEventListener("click", () => {
  feeds.push(createEmptyFeed());
  feedErrors.push({});
  clearSectionFeedback(rssFeedbackEl);
  renderFeeds();
});

saveFeedsButton.addEventListener("click", async () => {
  clearSectionFeedback(rssFeedbackEl);
  const validation = validateFeeds(feeds);
  feedErrors = validation.errors;
  renderFeeds();

  if (validation.formError) {
    setSectionFeedback(rssFeedbackEl, validation.formError, "error");
    return;
  }

  setRssBusy(true);
  try {
    await rssConfigService.saveEditableFeeds(validation.feeds);
    const persisted = await rssConfigService.loadEditableFeeds();
    feeds = persisted.map((feed) => ({ ...feed }));
    feedErrors = feeds.map(() => ({}));
    setBadgeStatus(rssStatusEl, "storage: saved", "ok");
    setSectionFeedback(rssFeedbackEl, "RSS configuration saved.", "ok");
    renderFeeds();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setBadgeStatus(rssStatusEl, "storage: error", "error");
    setSectionFeedback(rssFeedbackEl, `Save failed: ${message}`, "error");
  } finally {
    setRssBusy(false);
  }
});

shoppingListEl.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement | null;
  if (!target) {
    return;
  }

  if (target.dataset.field !== "title") {
    return;
  }

  const index = readIndex(target.dataset.index);
  if (index === null || !shoppingDrafts[index]) {
    return;
  }

  shoppingDrafts[index].title = target.value;
  if (shoppingErrors[index]?.title) {
    shoppingErrors[index].title = undefined;
    renderShoppingItems();
  }
});

shoppingListEl.addEventListener("change", (event) => {
  const target = event.target as HTMLSelectElement | null;
  if (!target) {
    return;
  }

  if (target.dataset.field !== "done") {
    return;
  }

  const index = readIndex(target.dataset.index);
  if (index === null || !shoppingDrafts[index]) {
    return;
  }

  shoppingDrafts[index].done = target.value === "done";
});

shoppingListEl.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>("button[data-action='delete-shopping-item']");
  if (!button) {
    return;
  }

  const index = readIndex(button.dataset.index);
  if (index === null || !shoppingDrafts[index]) {
    return;
  }

  shoppingDrafts.splice(index, 1);
  shoppingErrors.splice(index, 1);
  clearSectionFeedback(shoppingFeedbackEl);
  renderShoppingItems();
});

addShoppingItemButton.addEventListener("click", () => {
  shoppingDrafts.push(createEmptyShoppingItem());
  shoppingErrors.push({});
  clearSectionFeedback(shoppingFeedbackEl);
  renderShoppingItems();
});

saveShoppingItemsButton.addEventListener("click", async () => {
  clearSectionFeedback(shoppingFeedbackEl);
  const validation = validateShoppingItems(shoppingDrafts);
  shoppingErrors = validation.errors;
  renderShoppingItems();

  if (validation.formError) {
    setSectionFeedback(shoppingFeedbackEl, validation.formError, "error");
    return;
  }

  setShoppingBusy(true);
  try {
    await shoppingConfigService.saveEditableItems(validation.items);
    const persisted = await shoppingConfigService.loadEditableItems();
    shoppingDrafts = persisted.map((item) => ({
      id: item.id,
      title: item.title,
      done: item.done,
    }));
    shoppingErrors = shoppingDrafts.map(() => ({}));
    setBadgeStatus(shoppingStatusEl, "storage: saved", "ok");
    setSectionFeedback(shoppingFeedbackEl, "Shopping configuration saved.", "ok");
    renderShoppingItems();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setBadgeStatus(shoppingStatusEl, "storage: error", "error");
    setSectionFeedback(shoppingFeedbackEl, `Save failed: ${message}`, "error");
  } finally {
    setShoppingBusy(false);
  }
});

void loadRssConfig();
void loadShoppingConfig();

async function loadRssConfig(): Promise<void> {
  setRssBusy(true);
  setBadgeStatus(rssStatusEl, "storage: loading", "pending");
  clearSectionFeedback(rssFeedbackEl);

  try {
    const storedFeeds = await rssConfigService.loadEditableFeeds();
    feeds = storedFeeds.map((feed) => ({ ...feed }));
    feedErrors = feeds.map(() => ({}));
    setBadgeStatus(rssStatusEl, "storage: connected", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    feeds = [createEmptyFeed()];
    feedErrors = [{}];
    setBadgeStatus(rssStatusEl, "storage: error", "error");
    setSectionFeedback(rssFeedbackEl, `Unable to load the configuration: ${message}`, "error");
  } finally {
    setRssBusy(false);
    renderFeeds();
  }
}

async function loadShoppingConfig(): Promise<void> {
  setShoppingBusy(true);
  setBadgeStatus(shoppingStatusEl, "storage: loading", "pending");
  clearSectionFeedback(shoppingFeedbackEl);

  try {
    const storedItems = await shoppingConfigService.loadEditableItems();
    shoppingDrafts = storedItems.map((item) => ({
      id: item.id,
      title: item.title,
      done: item.done,
    }));
    shoppingErrors = shoppingDrafts.map(() => ({}));
    setBadgeStatus(shoppingStatusEl, "storage: connected", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    shoppingDrafts = [];
    shoppingErrors = [];
    setBadgeStatus(shoppingStatusEl, "storage: error", "error");
    setSectionFeedback(
      shoppingFeedbackEl,
      `Unable to load the shopping configuration: ${message}`,
      "error"
    );
  } finally {
    setShoppingBusy(false);
    renderShoppingItems();
  }
}

function renderFeeds(): void {
  const activeFeeds = feeds.length > 0 ? feeds : [createEmptyFeed()];
  if (feeds.length === 0) {
    feeds = activeFeeds;
    feedErrors = [{}];
  }

  feedListEl.innerHTML = "";
  for (let index = 0; index < feeds.length; index += 1) {
    const feed = feeds[index];
    const errors = feedErrors[index] ?? {};
    const row = document.createElement("div");
    row.className = "feed-row";
    row.innerHTML = `
      <div class="feed-row-head">
        <strong>Feed ${index + 1}</strong>
        <button type="button" class="danger" data-action="delete-feed" data-index="${index}" ${
          isRssBusy ? "disabled" : ""
        }>
          Delete
        </button>
      </div>
      <label class="field-label" for="feed-title-${index}">Title</label>
      <input
        id="feed-title-${index}"
        type="text"
        data-index="${index}"
        data-field="title"
        value="${escapeHtml(feed.title)}"
        placeholder="e.g. Ars Technica"
        ${isRssBusy ? "disabled" : ""}
      />
      <p class="validation-error">${errors.title ?? ""}</p>
      <label class="field-label" for="feed-url-${index}">RSS URL</label>
      <input
        id="feed-url-${index}"
        type="url"
        data-index="${index}"
        data-field="url"
        value="${escapeHtml(feed.url)}"
        placeholder="https://example.com/rss.xml"
        ${isRssBusy ? "disabled" : ""}
      />
      <p class="validation-error">${errors.url ?? ""}</p>
    `;
    feedListEl.appendChild(row);
  }
}

function renderShoppingItems(): void {
  shoppingListEl.innerHTML = "";

  if (shoppingDrafts.length === 0) {
    const hint = document.createElement("p");
    hint.className = "empty-state";
    hint.textContent = "No shopping items configured yet.";
    shoppingListEl.appendChild(hint);
    return;
  }

  for (let index = 0; index < shoppingDrafts.length; index += 1) {
    const item = shoppingDrafts[index];
    const errors = shoppingErrors[index] ?? {};
    const row = document.createElement("div");
    row.className = "feed-row";
    row.innerHTML = `
      <div class="feed-row-head">
        <strong>Todo ${index + 1}</strong>
        <button type="button" class="danger" data-action="delete-shopping-item" data-index="${index}" ${
          isShoppingBusy ? "disabled" : ""
        }>
          Delete
        </button>
      </div>
      <label class="field-label" for="shopping-title-${index}">Title</label>
      <input
        id="shopping-title-${index}"
        type="text"
        data-index="${index}"
        data-field="title"
        value="${escapeHtml(item.title)}"
        placeholder="e.g. Milk"
        ${isShoppingBusy ? "disabled" : ""}
      />
      <p class="validation-error">${errors.title ?? ""}</p>
      <label class="field-label" for="shopping-done-${index}">Status</label>
      <select
        id="shopping-done-${index}"
        data-index="${index}"
        data-field="done"
        ${isShoppingBusy ? "disabled" : ""}
      >
        <option value="open" ${item.done ? "" : "selected"}>open</option>
        <option value="done" ${item.done ? "selected" : ""}>done</option>
      </select>
    `;
    shoppingListEl.appendChild(row);
  }
}

function validateFeeds(drafts: FeedDraft[]): FeedValidationResult {
  const nextErrors: FeedFieldErrors[] = drafts.map(() => ({}));
  const validFeeds: EditableRssFeed[] = [];

  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    const title = draft.title.trim();
    const url = draft.url.trim();

    if (!title) {
      nextErrors[index].title = "Title is required.";
    }
    if (!url) {
      nextErrors[index].url = "URL is required.";
    } else if (!isValidHttpUrl(url)) {
      nextErrors[index].url = "The URL must start with http:// or https://.";
    }

    if (nextErrors[index].title || nextErrors[index].url) {
      continue;
    }

    validFeeds.push({
      id: draft.id.trim(),
      title,
      url,
    });
  }

  if (validFeeds.length === 0) {
    return {
      feeds: [],
      errors: nextErrors,
      formError: "At least one valid feed is required.",
    };
  }

  if (nextErrors.some((entry) => Boolean(entry.title || entry.url))) {
    return {
      feeds: validFeeds,
      errors: nextErrors,
      formError: "Please correct the highlighted fields.",
    };
  }

  return {
    feeds: validFeeds,
    errors: nextErrors,
    formError: null,
  };
}

function validateShoppingItems(drafts: ShoppingDraft[]): ShoppingValidationResult {
  const nextErrors: ShoppingFieldErrors[] = drafts.map(() => ({}));
  const validItems: EditableShoppingItem[] = [];

  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    const title = draft.title.trim();
    if (!title) {
      nextErrors[index].title = "Title is required.";
      continue;
    }

    validItems.push({
      id: draft.id.trim(),
      title,
      done: draft.done,
      position: index,
    });
  }

  if (nextErrors.some((entry) => Boolean(entry.title))) {
    return {
      items: validItems,
      errors: nextErrors,
      formError: "Please correct the highlighted fields.",
    };
  }

  return {
    items: validItems,
    errors: nextErrors,
    formError: null,
  };
}

function setBadgeStatus(element: HTMLElement, text: string, tone: "pending" | "ok" | "error"): void {
  element.textContent = text;
  element.classList.remove("badge-pending", "badge-ok", "badge-error");
  element.classList.add(`badge-${tone}`);
}

function setSectionFeedback(element: HTMLElement, text: string, tone: "ok" | "error"): void {
  element.textContent = text;
  element.classList.remove("feedback-ok", "feedback-error");
  element.classList.add(tone === "ok" ? "feedback-ok" : "feedback-error");
}

function clearSectionFeedback(element: HTMLElement): void {
  element.textContent = "";
  element.classList.remove("feedback-ok", "feedback-error");
}

function setRssBusy(nextBusy: boolean): void {
  isRssBusy = nextBusy;
  addFeedButton.disabled = nextBusy;
  saveFeedsButton.disabled = nextBusy;
  renderFeeds();
}

function setShoppingBusy(nextBusy: boolean): void {
  isShoppingBusy = nextBusy;
  addShoppingItemButton.disabled = nextBusy;
  saveShoppingItemsButton.disabled = nextBusy;
  renderShoppingItems();
}

function createEmptyFeed(): FeedDraft {
  return { id: "", title: "", url: "" };
}

function createEmptyShoppingItem(): ShoppingDraft {
  return { id: "", title: "", done: false };
}

function readIndex(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  return element;
}
