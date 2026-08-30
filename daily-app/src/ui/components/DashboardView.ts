import type { DashboardData } from "../../services/data/DataService";
import type { TextViewModel, ViewModel } from "../render/renderPipeline";

const MAX_INFO_CONTENT_LENGTH = 240;

function buildDashboardEventLayerModel(): TextViewModel {
  return {
    type: "text",
    id: "dashboard-event-layer",
    content: "",
    eventCapture: 1,
  };
}

function buildDashboardMenuItemModel(label: string, index: number, selectedIndex: number): TextViewModel {
  const isSelected = index === selectedIndex;
  return {
    type: "text",
    id: isSelected ? `dashboard-menu-item-${index}-selected` : `dashboard-menu-item-${index}`,
    content: label,
    eventCapture: 0,
  };
}

function buildDashboardInfoModel(content: string): TextViewModel {
  return {
    type: "text",
    id: "dashboard-info",
    content,
    eventCapture: 0,
  };
}

function readDescription(dashboard: DashboardData, selectedIndex: number): string {
  if (dashboard.items.length === 0) {
    return "No menu items available.";
  }

  const safeIndex = clampIndex(selectedIndex, dashboard.items.length);
  const selectedItem = dashboard.items[safeIndex];
  if (!selectedItem) {
    return "No menu items available.";
  }

  const description = selectedItem.description?.trim() || "No description available.";
  const status = dashboard.statusLine?.trim();
  const content = status
    ? [selectedItem.label, "", description, "", status].join("\n")
    : [selectedItem.label, "", description].join("\n");
  return content.length <= MAX_INFO_CONTENT_LENGTH
    ? content
    : `${content.slice(0, MAX_INFO_CONTENT_LENGTH - 12)}\n\n[truncated]`;
}

function clampIndex(selectedIndex: number, count: number): number {
  if (count <= 0) {
    return 0;
  }
  if (selectedIndex < 0) {
    return 0;
  }
  if (selectedIndex >= count) {
    return count - 1;
  }
  return selectedIndex;
}

export function buildDashboardViewModel(
  dashboard: DashboardData,
  selectedIndex: number
): ViewModel {
  const safeSelectedIndex = clampIndex(selectedIndex, dashboard.items.length);
  const menuItems = dashboard.items.length > 0
    ? dashboard.items
        .slice(0, 2)
        .map((item, index) => buildDashboardMenuItemModel(item.label, index, safeSelectedIndex))
    : [buildDashboardMenuItemModel("No menu items", 0, 0)];

  return {
    title: dashboard.title,
    layoutMode: "dashboard-menu",
    containers: [
      buildDashboardEventLayerModel(),
      ...menuItems,
      buildDashboardInfoModel(readDescription(dashboard, selectedIndex)),
    ],
  };
}
