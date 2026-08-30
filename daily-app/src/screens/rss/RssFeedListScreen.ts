import type { Screen } from "../../navigation/screen";
import type { InputEvent } from "../../input/keyBindings";
import type { DataService, ListData, ListItem } from "../../services/data/DataService";
import type { Logger } from "../../utils/logger";
import type { Router } from "../../navigation/router";
import { clamp } from "../../utils/clamp";
import { buildRssFeedListViewModel } from "../../ui/components/RssFeedListView";
import type { ViewModel } from "../../ui/render/renderPipeline";
import { readSelectedIndex, readSelectedItemName } from "../shared/readSelectedIndex";

const STATUS_ITEM_ID = "__status__";
const PREVIOUS_PAGE_ITEM_ID = "__rss-prev-page__";
const NEXT_PAGE_ITEM_ID = "__rss-next-page__";
const PREVIOUS_PAGE_LABEL = "[Previous page]";
const NEXT_PAGE_LABEL = "[Next page]";
const MAX_ROWS_PER_PAGE = 20;

interface RssItemRow {
  kind: "item";
  id: string;
  label: string;
  detailItemId: string;
}

interface RssActionRow {
  kind: "back" | "next";
  id: string;
  label: string;
}

interface RssStatusRow {
  kind: "status";
  id: string;
  label: string;
}

type RssRow = RssItemRow | RssActionRow | RssStatusRow;

interface PaginatedRows {
  title: string;
  rows: RssRow[];
  pageIndex: number;
  pageCount: number;
}

export function createRssFeedListScreen(
  listId: string,
  dataService: DataService,
  logger: Logger,
  router: Router,
  requestRender: () => void
): Screen {
  let selectedRowIndex = 0;
  let pageIndex = 0;
  let isLoading = false;
  let loadError: string | null = null;
  let refreshSequence = 0;

  async function refresh(): Promise<void> {
    const sequence = refreshSequence + 1;
    refreshSequence = sequence;

    isLoading = true;
    loadError = null;
    requestRender();

    try {
      await dataService.refreshList(listId);
      if (sequence !== refreshSequence) {
        return;
      }

      const list = dataService.getList(listId);
      const paginated = paginateRows(list, pageIndex, false, null);
      pageIndex = paginated.pageIndex;
      selectedRowIndex = clamp(selectedRowIndex, 0, Math.max(0, paginated.rows.length - 1));
    } catch (error) {
      if (sequence !== refreshSequence) {
        return;
      }
      loadError = error instanceof Error ? error.message : "Unknown RSS error";
    } finally {
      if (sequence !== refreshSequence) {
        return;
      }
      isLoading = false;
      requestRender();
    }
  }

  return {
    id: `list:${listId}`,
    onEnter() {
      // The host re-enters list screens with top-row hover, so keep local selection aligned.
      selectedRowIndex = 0;
      logger.info(`Enter List ${listId}`);
      void refresh();
    },
    onExit() {
      refreshSequence += 1;
      logger.info(`Exit List ${listId}`);
    },
    onInput(event: InputEvent) {
      const list = dataService.getList(listId);
      const paginated = paginateRows(list, pageIndex, isLoading, loadError);
      pageIndex = paginated.pageIndex;

      const hasRows = paginated.rows.length > 0;
      const maxRowIndex = Math.max(0, paginated.rows.length - 1);
      const resolvedIndex = resolveRowSelectionIndex(paginated.rows, event, maxRowIndex);

      if (resolvedIndex !== null && hasRows) {
        selectedRowIndex = clamp(resolvedIndex, 0, maxRowIndex);
      }

      if (event.type === "Up" && hasRows) {
        selectedRowIndex = clamp(selectedRowIndex - 1, 0, maxRowIndex);
      }

      if (event.type === "Down" && hasRows) {
        selectedRowIndex = clamp(selectedRowIndex + 1, 0, maxRowIndex);
      }

      if (hasRows) {
        selectedRowIndex = clamp(selectedRowIndex, 0, maxRowIndex);
      }

      if (event.type === "Click" && hasRows) {
        const row = paginated.rows[selectedRowIndex];
        if (row?.kind === "item") {
          logger.info(`Open Detail: ${row.detailItemId} (row ${selectedRowIndex}, page ${pageIndex + 1})`);
          router.toDetail(row.detailItemId);
          return;
        }

        if (row?.kind === "next") {
          pageIndex = clamp(pageIndex + 1, 0, Math.max(0, paginated.pageCount - 1));
          selectedRowIndex = 0;
          return;
        }

        if (row?.kind === "back") {
          pageIndex = clamp(pageIndex - 1, 0, Math.max(0, paginated.pageCount - 1));
          selectedRowIndex = 0;
          return;
        }
      }

      if (event.type === "DoubleClick") {
        router.back();
      }
    },
    getViewModel(): ViewModel {
      const paginated = paginateRows(dataService.getList(listId), pageIndex, isLoading, loadError);
      pageIndex = paginated.pageIndex;
      const boundedIndex = clamp(selectedRowIndex, 0, Math.max(0, paginated.rows.length - 1));
      selectedRowIndex = boundedIndex;

      return buildRssFeedListViewModel(
        {
          id: listId,
          title: paginated.title,
          items: paginated.rows.map((row) => ({ id: row.id, label: row.label })),
        },
        boundedIndex,
        `${paginated.pageIndex + 1}/${paginated.pageCount}`
      );
    },
  };
}

function resolveRowSelectionIndex(
  rows: RssRow[],
  event: InputEvent,
  maxRowIndex: number
): number | null {
  const selectedName = readSelectedItemName(event);
  if (selectedName) {
    const normalizedName = selectedName.trim().toLowerCase();
    const byNameIndex = rows.findIndex(
      (row) => row.label.trim().toLowerCase() === normalizedName || row.id.trim().toLowerCase() === normalizedName
    );
    if (byNameIndex >= 0) {
      return byNameIndex;
    }

    const numberedMatch = /^item\s*(\d+)$/i.exec(selectedName.trim());
    if (numberedMatch) {
      const oneBasedIndex = Number(numberedMatch[1]);
      if (Number.isFinite(oneBasedIndex) && oneBasedIndex >= 1) {
        return clamp(oneBasedIndex - 1, 0, maxRowIndex);
      }
    }
  }

  const selectedIndex = readSelectedIndex(event);
  if (selectedIndex === null) {
    return null;
  }

  return normalizeEventIndex(selectedIndex, maxRowIndex);
}

function normalizeEventIndex(selectedIndex: number, maxIndex: number): number {
  if (!Number.isFinite(selectedIndex)) {
    return 0;
  }

  if (selectedIndex < 0) {
    return 0;
  }

  // Prefer zero-based indexes when in-range.
  if (selectedIndex <= maxIndex) {
    return clamp(selectedIndex, 0, maxIndex);
  }

  // One-based fallback for out-of-range payloads.
  return clamp(selectedIndex - 1, 0, maxIndex);
}

function paginateRows(
  list: ListData,
  requestedPageIndex: number,
  isLoading: boolean,
  loadError: string | null
): PaginatedRows {
  const visible = withStatusState(list, isLoading, loadError);
  if (visible.items.length === 0) {
    return {
      title: visible.title,
      rows: [],
      pageIndex: 0,
      pageCount: 1,
    };
  }

  const hasOnlyStatusItem = visible.items.length === 1 && visible.items[0]?.id === STATUS_ITEM_ID;
  if (hasOnlyStatusItem) {
    const statusItem = visible.items[0];
    if (!statusItem) {
      return {
        title: visible.title,
        rows: [],
        pageIndex: 0,
        pageCount: 1,
      };
    }

    return {
      title: visible.title,
      rows: [{ kind: "status", id: statusItem.id, label: statusItem.label }],
      pageIndex: 0,
      pageCount: 1,
    };
  }

  const pageStarts = buildPageStarts(visible.items.length);
  const boundedPageIndex = clamp(requestedPageIndex, 0, Math.max(0, pageStarts.length - 1));
  const start = pageStarts[boundedPageIndex] ?? 0;
  const end = pageStarts[boundedPageIndex + 1] ?? visible.items.length;
  const pageItems = visible.items.slice(start, end);
  const hasBack = boundedPageIndex > 0;
  const hasNext = boundedPageIndex < pageStarts.length - 1;

  const rows: RssRow[] = [];
  if (hasBack) {
    rows.push({
      kind: "back",
      id: PREVIOUS_PAGE_ITEM_ID,
      label: PREVIOUS_PAGE_LABEL,
    });
  }

  for (const item of pageItems) {
    rows.push({
      kind: "item",
      id: item.id,
      label: item.label,
      detailItemId: item.id,
    });
  }

  if (hasNext) {
    rows.push({
      kind: "next",
      id: NEXT_PAGE_ITEM_ID,
      label: NEXT_PAGE_LABEL,
    });
  }

  return {
    title: visible.title,
    rows,
    pageIndex: boundedPageIndex,
    pageCount: pageStarts.length,
  };
}

function buildPageStarts(totalItemCount: number): number[] {
  const starts: number[] = [];
  let page = 0;
  let cursor = 0;

  while (cursor < totalItemCount) {
    starts.push(cursor);
    const remaining = totalItemCount - cursor;
    const contentSlots = resolveContentSlotsForPage(page, remaining);
    cursor += contentSlots;
    page += 1;
  }

  return starts.length > 0 ? starts : [0];
}

function resolveContentSlotsForPage(page: number, remainingItems: number): number {
  const reserveBack = page > 0 ? 1 : 0;
  const slotsWithoutNext = MAX_ROWS_PER_PAGE - reserveBack;
  const needsNext = remainingItems > slotsWithoutNext;
  const slotsWithControls = needsNext ? slotsWithoutNext - 1 : slotsWithoutNext;
  return Math.max(1, slotsWithControls);
}

function withStatusState(list: ListData, isLoading: boolean, loadError: string | null): ListData {
  if (list.items.length > 0) {
    if (isLoading) {
      return { ...list, title: `${list.title} (loading...)` };
    }

    if (loadError) {
      return { ...list, title: `${list.title} (last update)` };
    }

    return list;
  }

  const message = isLoading
    ? "Loading RSS feeds..."
    : loadError
      ? `Error: ${loadError}`
      : "No RSS items found.";

  const stateItem: ListItem = {
    id: STATUS_ITEM_ID,
    label: message,
  };

  return {
    ...list,
    items: [stateItem],
  };
}
