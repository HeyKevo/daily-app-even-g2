import type { Screen } from "../../navigation/screen";
import type { InputEvent } from "../../input/keyBindings";
import type { DataService } from "../../services/data/DataService";
import type { Logger } from "../../utils/logger";
import type { Router } from "../../navigation/router";
import { buildDetailViewModel } from "../../ui/components/RssDetailView";
import { clamp } from "../../utils/clamp";
import type { ViewModel } from "../../ui/render/renderPipeline";

const AUTOSCROLL_INTERVAL_MS = 2500;

export function createRssFeedDetailScreen(
  itemId: string,
  dataService: DataService,
  logger: Logger,
  router: Router,
  requestRender: () => void
): Screen {
  // A screen instance exists per opened article, so reading always starts on page 1.
  let pageIndex = 0;
  let autoScrollEnabled = false;
  let timerId: number | null = null;

  const readPageCount = () => Math.max(1, dataService.getDetail(itemId).pages.length);

  const stopAutoScroll = () => {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
    autoScrollEnabled = false;
  };

  const startAutoScroll = () => {
    stopAutoScroll();

    if (readPageCount() <= 1) {
      // Single page articles have nothing to advance to.
      return;
    }

    autoScrollEnabled = true;
    timerId = window.setInterval(() => {
      const lastPageIndex = readPageCount() - 1;
      if (pageIndex >= lastPageIndex) {
        // Stop on the final page instead of wrapping or opening the next article.
        stopAutoScroll();
        pageIndex = lastPageIndex;
        requestRender();
        return;
      }

      pageIndex += 1;
      requestRender();
    }, AUTOSCROLL_INTERVAL_MS);
  };

  const toggleAutoScroll = () => {
    if (autoScrollEnabled) {
      stopAutoScroll();
    } else {
      startAutoScroll();
    }
    requestRender();
  };

  const goToPage = (direction: "previous" | "next") => {
    const lastPageIndex = readPageCount() - 1;
    const nextPageIndex = clamp(pageIndex + (direction === "next" ? 1 : -1), 0, lastPageIndex);
    if (nextPageIndex === pageIndex) {
      // Stay inside the article at the first and last page.
      return;
    }

    pageIndex = nextPageIndex;
    logger.debug(`Detail page -> ${pageIndex + 1}/${lastPageIndex + 1}`);
    requestRender();
  };

  return {
    id: `detail:${itemId}`,
    onEnter() {
      pageIndex = 0;
      logger.info(`Enter Detail ${itemId}`);
    },
    onExit() {
      stopAutoScroll();
      logger.info(`Exit Detail ${itemId}`);
    },
    onInput(event: InputEvent) {
      if (event.type === "Click") {
        toggleAutoScroll();
      }

      if (event.type === "Up") {
        goToPage("previous");
      }

      if (event.type === "Down") {
        goToPage("next");
      }

      if (event.type === "DoubleClick") {
        router.back();
      }
    },
    getViewModel(): ViewModel {
      const detail = dataService.getDetail(itemId);
      const lastPageIndex = Math.max(1, detail.pages.length) - 1;
      pageIndex = clamp(pageIndex, 0, lastPageIndex);

      return buildDetailViewModel(detail, { pageIndex, autoScrollEnabled });
    },
  };
}
