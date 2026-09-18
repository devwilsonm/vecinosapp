// @ts-nocheck
import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";

export const defaultChartPalette = [
  0x5eb6d1,
  0x658bdc,
  0x6a70d9,
  0x8064d6,
  0x9a61d7,
  0xb660d1,
  0xcf63bc,
  0xd65e8c,
  0xd96579,
  0xe06e65,
  0xd98a61,
  0xc9a36a
];

export function getChartTheme() {
  const palette = getComputedStyle(document.documentElement);
  return {
    textColor: am5.color(palette.getPropertyValue("--text").trim()),
    gridColor: am5.color(palette.getPropertyValue("--input-border").trim()),
    tooltipBackground: am5.color(palette.getPropertyValue("--panel").trim())
  };
}

export function createChartRoot(elementId) {
  const root = am5.Root.new(elementId);
  root.setThemes([am5themes_Animated.new(root)]);
  return root;
}

export function createXYChart(root, options = {}) {
  return root.container.children.push(am5xy.XYChart.new(root, {
    panX: true,
    panY: false,
    wheelX: "panX",
    wheelY: "zoomX",
    pinchZoomX: true,
    paddingLeft: 0,
    paddingRight: 1,
    ...options
  }));
}

export function addChartCursor(chart, root) {
  const cursor = chart.set("cursor", am5xy.XYCursor.new(root, {}));
  cursor.lineY.set("visible", false);
  return cursor;
}

export function addCategoryAxis(chart, root, theme, options = {}) {
  const xRenderer = am5xy.AxisRendererX.new(root, {
    minGridDistance: options.minGridDistance || 30,
    minorGridEnabled: true
  });
  xRenderer.labels.template.setAll({
    rotation: options.rotation ?? -65,
    centerY: am5.p50,
    centerX: am5.p100,
    paddingRight: options.paddingRight ?? 10,
    fill: theme.textColor
  });
  xRenderer.grid.template.setAll({ stroke: theme.gridColor, strokeOpacity: 0.35, location: 1 });

  return chart.xAxes.push(am5xy.CategoryAxis.new(root, {
    categoryField: options.categoryField || "category",
    renderer: xRenderer,
    tooltip: createChartTooltip(root, "{category}", theme)
  }));
}

export function addValueAxis(chart, root, theme, options = {}) {
  const yRenderer = am5xy.AxisRendererY.new(root, { strokeOpacity: 0.1 });
  yRenderer.labels.template.setAll({ fill: theme.textColor });
  yRenderer.grid.template.setAll({ stroke: theme.gridColor, strokeOpacity: 0.35 });

  return chart.yAxes.push(am5xy.ValueAxis.new(root, {
    min: options.min ?? 0,
    renderer: yRenderer
  }));
}

export function createChartTooltip(root, labelText, theme) {
  const tooltip = am5.Tooltip.new(root, { labelText });
  tooltip.get("background").setAll({
    fill: theme.tooltipBackground,
    fillOpacity: 0.96,
    stroke: theme.gridColor
  });
  tooltip.label.setAll({ fill: theme.textColor });
  return tooltip;
}

export function addColumnSeries(chart, root, options) {
  const series = chart.series.push(am5xy.ColumnSeries.new(root, {
    name: options.name,
    xAxis: options.xAxis,
    yAxis: options.yAxis,
    valueYField: options.valueYField || "value",
    categoryXField: options.categoryXField || "category",
    sequencedInterpolation: true,
    tooltip: options.tooltip,
    colorByDataItem: true
  }));
  series.set("colors", am5.ColorSet.new(root, {
    colors: (options.palette || defaultChartPalette).map((value) => am5.color(value)),
    step: 1
  }));
  series.columns.template.setAll({
    cornerRadiusTL: 5,
    cornerRadiusTR: 5,
    strokeOpacity: 0
  });
  return series;
}

export function disposeChartRoots(roots) {
  roots.forEach((root) => root.dispose());
}