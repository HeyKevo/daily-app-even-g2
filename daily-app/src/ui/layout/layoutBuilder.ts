import type {
  ImageContainerPayload,
  ImageUpdatePayload,
  TextContainerPayload,
  ListContainerPayload,
} from "../../bridge/evenHubTypes";
import type { ViewModel, TextViewModel, ListViewModel, ImageViewModel } from "../render/renderPipeline";
import { clamp } from "../../utils/clamp";
import { CONTAINER_IDS } from "./containerIds";

const MAX_LIST_ITEM_COUNT = 20;
const MAX_LIST_ITEM_NAME_BYTES = 63;
const MAX_TEXT_CONTAINER_COUNT = 8;
const MAX_IMAGE_CONTAINER_COUNT = 4;
const MAX_TOTAL_CONTAINER_COUNT = 12;
const VISIBLE_BORDER_COLOR = 15;
const EMPTY_LIST_PLACEHOLDER = "No items available.";
const textEncoder = new TextEncoder();

export interface LayoutPayload {
  textObject?: TextContainerPayload[];
  listObject?: ListContainerPayload[];
  imageObject?: ImageContainerPayload[];
  imageUpdates?: ImageUpdatePayload[];
  containerTotalNum: number;
}

export function buildLayout(viewModel: ViewModel): LayoutPayload {
  const textContainers: TextContainerPayload[] = [];
  const listContainers: ListContainerPayload[] = [];
  const imageContainers: ImageContainerPayload[] = [];
  const imageUpdates: ImageUpdatePayload[] = [];

  const hasText = viewModel.containers.some((container) => container.type === "text");
  const hasList = viewModel.containers.some((container) => container.type === "list");
  const textPagerTextCount = viewModel.containers.filter((container) => container.type === "text").length;
  const isTextPager = viewModel.layoutMode === "text-pager" && hasText && !hasList;
  const isDashboardMenu = viewModel.layoutMode === "dashboard-menu" && hasText && !hasList;
  const hasTextPagerTitle = isTextPager && viewModel.containers.some(
    (container) => container.type === "text" && container.id === "title"
  );
  const isListFooter = viewModel.layoutMode === "list-footer" && hasText && hasList;
  const isTwoColumn = viewModel.layoutMode === "two-column" && hasText && hasList;
  const isStackedSplit = !isTwoColumn && !isListFooter && !isTextPager && !isDashboardMenu && hasText && hasList;

  const textX = isTwoColumn ? 288 : isListFooter ? 488 : 0;
  const textY = isListFooter ? 264 : 0;
  const textWidth = isTwoColumn ? 288 : isListFooter ? 88 : 576;
  const textHeight = isStackedSplit ? 96 : isListFooter ? 24 : 288;

  const listX = 0;
  const listY = isStackedSplit ? 96 : 0;
  const listWidth = isTwoColumn ? 280 : 576;
  const listHeight = isStackedSplit ? 192 : 288;

  let eventCaptureAssigned = false;

  for (const container of viewModel.containers) {
    if (container.type === "text") {
      const text = container as TextViewModel;
      const textIndex = textContainers.length;
      const isTitleBorder = isTextPagerTitle(textIndex, isTextPager, hasTextPagerTitle);
      const isDashboardMenuItem = isDashboardMenu && text.id.startsWith("dashboard-menu-item-");
      const isDashboardSelectedItem = isDashboardMenuItem && text.id.endsWith("-selected");
      const isDashboardInfo = isDashboardMenu && textIndex === viewModel.containers.length - 1;
      const borderedText = isTwoColumn || isTitleBorder || isDashboardSelectedItem || isDashboardInfo;
      const textGeometry = resolveTextGeometry(textIndex, {
        isTextPager,
        isDashboardMenu,
        textPagerTextCount,
        hasTextPagerTitle,
        textX,
        textY,
        textWidth,
        textHeight,
      });
      textContainers.push({
        xPosition: textGeometry.xPosition,
        yPosition: textGeometry.yPosition,
        width: textGeometry.width,
        height: textGeometry.height,
        borderWidth: borderedText ? 1 : 0,
        borderColor: borderedText ? VISIBLE_BORDER_COLOR : undefined,
        borderRadius: isTitleBorder || isDashboardSelectedItem ? 6 : borderedText ? 4 : 0,
        paddingLength: borderedText || isDashboardMenuItem ? 6 : 0,
        containerID: resolveTextContainerId(textIndex),
        containerName: resolveTextContainerName(textIndex),
        content: text.content,
        isEventCapture: text.eventCapture && !eventCaptureAssigned ? 1 : 0,
      });
      if (text.eventCapture && !eventCaptureAssigned) {
        eventCaptureAssigned = true;
      }
    }

    if (container.type === "list") {
      const list = container as ListViewModel;
      const normalizedItems = normalizeListItems(list.items);
      listContainers.push({
        xPosition: listX,
        yPosition: listY,
        width: listWidth,
        height: listHeight,
        containerID: CONTAINER_IDS.list.id,
        containerName: CONTAINER_IDS.list.name,
        isEventCapture: list.eventCapture && !eventCaptureAssigned ? 1 : 0,
        itemContainer: {
          itemCount: normalizedItems.length,
          itemWidth: Math.max(20, listWidth - 11),
          isItemSelectBorderEn: 1,
          itemName: normalizedItems,
        },
      });
      if (list.eventCapture && !eventCaptureAssigned) {
        eventCaptureAssigned = true;
      }
    }

    if (container.type === "image" && imageContainers.length < MAX_IMAGE_CONTAINER_COUNT) {
      const image = container as ImageViewModel;
      const imageIndex = imageContainers.length;
      const containerID = CONTAINER_IDS.imageBase.id + imageIndex;
      const containerName = `${CONTAINER_IDS.imageBase.name}-${imageIndex + 1}`;
      imageContainers.push({
        xPosition: clamp(image.xPosition ?? 0, 0, 576),
        yPosition: clamp(image.yPosition ?? 0, 0, 288),
        width: clamp(image.width ?? 200, 20, 288),
        height: clamp(image.height ?? 100, 20, 144),
        containerID,
        containerName,
      });
      imageUpdates.push({
        containerID,
        containerName,
        imageData: image.imageData,
      });
    }
  }

  const limitedTextContainers = textContainers.slice(0, MAX_TEXT_CONTAINER_COUNT);
  const limitedListContainers = listContainers.slice(0, Math.max(0, MAX_TOTAL_CONTAINER_COUNT - limitedTextContainers.length));
  const remainingContainerSlots = Math.max(
    0,
    MAX_TOTAL_CONTAINER_COUNT - limitedTextContainers.length - limitedListContainers.length
  );
  const limitedImageContainers = imageContainers.slice(0, Math.min(MAX_IMAGE_CONTAINER_COUNT, remainingContainerSlots));
  const limitedImageUpdates = imageUpdates.slice(0, limitedImageContainers.length);
  const total = limitedTextContainers.length + limitedListContainers.length + limitedImageContainers.length;

  return {
    containerTotalNum: total,
    textObject: limitedTextContainers.length ? limitedTextContainers : undefined,
    listObject: limitedListContainers.length ? limitedListContainers : undefined,
    imageObject: limitedImageContainers.length ? limitedImageContainers : undefined,
    imageUpdates: limitedImageUpdates.length ? limitedImageUpdates : undefined,
  };
}

function resolveTextGeometry(
  textIndex: number,
  defaults: {
    isTextPager: boolean;
    isDashboardMenu: boolean;
    textPagerTextCount: number;
    hasTextPagerTitle: boolean;
    textX: number;
    textY: number;
    textWidth: number;
    textHeight: number;
  }
): { xPosition: number; yPosition: number; width: number; height: number } {
  if (!defaults.isTextPager) {
    if (defaults.isDashboardMenu) {
      if (textIndex === 0) {
        return { xPosition: 0, yPosition: 0, width: 576, height: 288 };
      }

      if (textIndex === 1) {
        return { xPosition: 0, yPosition: 104, width: 270, height: 40 };
      }

      if (textIndex === 2) {
        return { xPosition: 0, yPosition: 152, width: 270, height: 40 };
      }

      return { xPosition: 288, yPosition: 0, width: 288, height: 288 };
    }

    return {
      xPosition: defaults.textX,
      yPosition: defaults.textY,
      width: defaults.textWidth,
      height: defaults.textHeight,
    };
  }

  if (defaults.hasTextPagerTitle || defaults.textPagerTextCount >= 3) {
    if (textIndex === 0) {
      return { xPosition: 0, yPosition: 0, width: 576, height: 52 };
    }

    if (textIndex === 1) {
      return { xPosition: 0, yPosition: 62, width: 576, height: 178 };
    }

    if (textIndex === 2) {
      return { xPosition: 0, yPosition: 250, width: 576, height: 30 };
    }
  }

  if (textIndex === 0) {
    return { xPosition: 0, yPosition: 0, width: 576, height: 240 };
  }

  if (textIndex === 1) {
    return { xPosition: 0, yPosition: 250, width: 576, height: 30 };
  }

  return { xPosition: 0, yPosition: 0, width: 576, height: 288 };
}

function isTextPagerTitle(textIndex: number, isTextPager: boolean, hasTextPagerTitle: boolean): boolean {
  return isTextPager && hasTextPagerTitle && textIndex === 0;
}

function resolveTextContainerId(index: number): number {
  return index === 0 ? CONTAINER_IDS.text.id : CONTAINER_IDS.text.id + index + 1;
}

function resolveTextContainerName(index: number): string {
  return index === 0 ? CONTAINER_IDS.text.name : `text-${index + 1}`;
}

function normalizeListItems(items: string[]): string[] {
  if (items.length === 0) {
    return [EMPTY_LIST_PLACEHOLDER];
  }

  return items.slice(0, MAX_LIST_ITEM_COUNT).map(truncateListItemLabel);
}

function truncateListItemLabel(label: string): string {
  if (utf8ByteLength(label) <= MAX_LIST_ITEM_NAME_BYTES) {
    return label;
  }

  const suffix = "...";
  const maxContentBytes = MAX_LIST_ITEM_NAME_BYTES - utf8ByteLength(suffix);
  let truncated = "";
  let bytesUsed = 0;

  for (const char of Array.from(label)) {
    const charBytes = utf8ByteLength(char);
    if (bytesUsed + charBytes > maxContentBytes) {
      break;
    }

    truncated += char;
    bytesUsed += charBytes;
  }

  return `${truncated}${suffix}`;
}

function utf8ByteLength(text: string): number {
  return textEncoder.encode(text).length;
}
