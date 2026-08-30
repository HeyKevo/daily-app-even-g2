import type { DetailData } from "../../services/data/DataService";
import type { ImageViewModel, TextViewModel, ViewModel } from "../render/renderPipeline";

const MAX_DETAIL_CONTENT_LENGTH = 980;
const MAX_DETAIL_TITLE_LENGTH = 180;
const MAX_DETAIL_BODY_LENGTH = 900;
const FOOTER_IMAGE_WIDTH = 576;
const FOOTER_IMAGE_HALF_WIDTH = 288;
const FOOTER_IMAGE_HEIGHT = 30;
const FOOTER_IMAGE_Y = 250;
const FOOTER_SOURCE_ALPHA = 0.5;
const TRANSPARENT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8zwAAAgEBALB7kV8AAAAASUVORK5CYII=";

export function buildTextModel(text: string, eventCapture: 0 | 1, id = "text-1"): TextViewModel {
  return {
    type: "text",
    id,
    content: text,
    eventCapture,
  };
}

export function buildDetailViewModel(
  detail: DetailData,
  options: { pageIndex: number; autoScrollEnabled: boolean },
  eventCapture: 0 | 1 = 1
): ViewModel {
  const pageCount = Math.max(1, detail.pages.length);
  const pageIndex = clampIndex(options.pageIndex, pageCount);
  const activePage = detail.pages[pageIndex] ?? detail.description;

  const sourceLine = detail.pubDateText
    ? `Source: ${detail.source} | ${detail.pubDateText}`
    : `Source: ${detail.source}`;

  const titleContent = truncateText(detail.title, MAX_DETAIL_TITLE_LENGTH);
  const bodyContent = truncateText(activePage, MAX_DETAIL_BODY_LENGTH);
  const pagerContent = [
    `${pageIndex + 1}/${pageCount}`,
    options.autoScrollEnabled ? "Auto ON" : "Auto OFF",
  ].join(" | ");

  return {
    title: "RSS Article",
    layoutMode: "text-pager",
    containers: [
      buildTextModel(titleContent, 0, "title"),
      buildTextModel(bodyContent, eventCapture, "body"),
      ...buildFooterImageModels(pagerContent, sourceLine),
    ],
  };
}

function buildFooterImageModels(pagerContent: string, sourceLine: string): ImageViewModel[] {
  const imageData = renderFooterImageData(pagerContent, sourceLine);

  return [
    {
      type: "image",
      id: "footer-left",
      imageData: imageData.left,
      xPosition: 0,
      yPosition: FOOTER_IMAGE_Y,
      width: FOOTER_IMAGE_HALF_WIDTH,
      height: FOOTER_IMAGE_HEIGHT,
    },
    {
      type: "image",
      id: "footer-right",
      imageData: imageData.right,
      xPosition: FOOTER_IMAGE_HALF_WIDTH,
      yPosition: FOOTER_IMAGE_Y,
      width: FOOTER_IMAGE_HALF_WIDTH,
      height: FOOTER_IMAGE_HEIGHT,
    },
  ];
}

function renderFooterImageData(pagerContent: string, sourceLine: string): { left: string; right: string } {
  const fallback = createTransparentFooterHalves();
  if (typeof document === "undefined") {
    return fallback;
  }

  const canvas = document.createElement("canvas");
  canvas.width = FOOTER_IMAGE_WIDTH;
  canvas.height = FOOTER_IMAGE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    return fallback;
  }

  context.clearRect(0, 0, FOOTER_IMAGE_WIDTH, FOOTER_IMAGE_HEIGHT);
  context.font = "16px monospace";
  context.textBaseline = "top";
  context.fillStyle = "rgba(0, 255, 0, 1)";
  context.fillText(pagerContent, 0, 2);

  const sourceX = Math.ceil(context.measureText(pagerContent).width) + 14;
  context.fillStyle = `rgba(0, 255, 0, ${FOOTER_SOURCE_ALPHA})`;
  context.fillText(sourceLine, sourceX, 2);

  return splitFooterImageCanvas(canvas);
}

function createTransparentFooterHalves(): { left: string; right: string } {
  return {
    left: TRANSPARENT_PNG_BASE64,
    right: TRANSPARENT_PNG_BASE64,
  };
}

function splitFooterImageCanvas(canvas: HTMLCanvasElement): { left: string; right: string } {
  const left = cropFooterImageCanvas(canvas, 0);
  const right = cropFooterImageCanvas(canvas, FOOTER_IMAGE_HALF_WIDTH);

  return { left, right };
}

function cropFooterImageCanvas(canvas: HTMLCanvasElement, sourceX: number): string {
  const halfCanvas = document.createElement("canvas");
  halfCanvas.width = FOOTER_IMAGE_HALF_WIDTH;
  halfCanvas.height = FOOTER_IMAGE_HEIGHT;
  const context = halfCanvas.getContext("2d");
  if (!context) {
    return TRANSPARENT_PNG_BASE64;
  }

  context.drawImage(
    canvas,
    sourceX,
    0,
    FOOTER_IMAGE_HALF_WIDTH,
    FOOTER_IMAGE_HEIGHT,
    0,
    0,
    FOOTER_IMAGE_HALF_WIDTH,
    FOOTER_IMAGE_HEIGHT
  );

  return halfCanvas.toDataURL("image/png").split(",", 2)[1] ?? TRANSPARENT_PNG_BASE64;
}

function clampIndex(index: number, count: number): number {
  if (index < 0) {
    return 0;
  }
  if (index >= count) {
    return count - 1;
  }
  return index;
}

function truncateText(text: string, maxLength = MAX_DETAIL_CONTENT_LENGTH): string {
  if (text.length <= maxLength) {
    return text;
  }

  const suffix = "\n\n[truncated]";
  return `${text.slice(0, maxLength - suffix.length)}${suffix}`;
}
