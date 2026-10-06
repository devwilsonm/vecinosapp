// @ts-nocheck
import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import {
  addCategoryAxis,
  addChartCursor,
  addColumnSeries,
  addValueAxis,
  createChartRoot,
  createChartTooltip,
  createXYChart,
  defaultChartPalette,
  disposeChartRoots,
  getChartTheme
} from "./charts/amcharts";
import { servicePalettes } from "./reports/service-palettes";

const dataElement = document.querySelector("#consumptionReportData");
if (dataElement?.textContent) {
  const reports = JSON.parse(dataElement.textContent);
  let chartRoots = [];

  function renderChart(report, theme) {
    const root = createChartRoot(`consumption-chart-${report.service}`);
    const chart = createXYChart(root);
    addChartCursor(chart, root);
    const xAxis = addCategoryAxis(chart, root, theme);
    const yAxis = addValueAxis(chart, root, theme);
    const tooltip = createChartTooltip(root, `{categoryX}: {valueY} ${report.unit}`, theme);
    const series = addColumnSeries(chart, root, {
      name: report.label,
      xAxis,
      yAxis,
      tooltip,
      palette: servicePalettes[report.service] || servicePalettes.otro
    });

    xAxis.data.setAll(report.data);
    series.data.setAll(report.data);
    series.appear(700);
    chart.appear(700, 100);
    return root;
  }

  function renderCharts() {
    disposeChartRoots(chartRoots);
    const theme = getChartTheme();
    chartRoots = reports.map((report) => renderChart(report, theme));
  }

  renderCharts();
  document.addEventListener("vecinosapp:theme-changed", renderCharts);
}

const evolutionData = document.querySelector("#occupantEvolutionData");
if (evolutionData?.textContent) {
  const groups = JSON.parse(evolutionData.textContent);
  const panel = document.querySelector("#occupant-evolution-panel");
  let roots = [];
  let printPrepared = false;
  let valuesWereOpen;

  function renderEvolution(print = false) {
    disposeChartRoots(roots);
    roots = [];
    if (!panel || (panel.hidden && !print)) return;
    const theme = print ? { textColor: am5.color(0x111827), gridColor: am5.color(0xb8c4d4), tooltipBackground: am5.color(0xffffff) } : getChartTheme();
    const reducedMotion = print || matchMedia("(prefers-reduced-motion: reduce)").matches;
    let serviceIndex = 0;
    groups.forEach((reports, groupIndex) => {
      const root = createChartRoot(`occupant-evolution-chart-${groupIndex}`);
      roots.push(root);
      if (reducedMotion) root.setThemes([]);
      root.numberFormatter.set("numberFormat", "#,###.00");
      const chart = createXYChart(root, { panX: !print, wheelX: print ? "none" : "panX", wheelY: print ? "none" : "zoomX", pinchZoomX: !print, layout: root.verticalLayout });
      const xAxis = addCategoryAxis(chart, root, theme, { rotation: 0, paddingRight: 0, minGridDistance: 35 });
      xAxis.get("renderer").labels.template.setAll({ centerX: am5.p50, centerY: am5.p0, paddingTop: 12, paddingBottom: 8, fontSize: 12 });
      xAxis.get("renderer").labels.template.adapters.add("text", (text) => root.dom.clientWidth < 480 ? text?.replace(/\s+\d{4}$/, "") : text);
      xAxis.get("renderer").setAll({ cellStartLocation: 0.15, cellEndLocation: 0.85 });
      const yAxis = addValueAxis(chart, root, theme);
      yAxis.get("renderer").labels.template.set("fontSize", 12);
      const data = reports[0].data.map((point, index) => {
        const row = { category: point.category };
        reports.forEach((report, seriesIndex) => { row[`value${seriesIndex}`] = report.data[index].value; });
        return row;
      });
      xAxis.data.setAll(data);
      const legend = chart.children.push(am5.Legend.new(root, { centerX: am5.p50, x: am5.p50, width: am5.percent(100), marginTop: 14, paddingBottom: 8, layout: root.gridLayout }));
      legend.labels.template.setAll({ fill: theme.textColor, fontSize: 13 });
      legend.valueLabels.template.set("forceHidden", true);
      reports.forEach((report, index) => {
        let colorValue = Object.hasOwn(servicePalettes, report.service) ? servicePalettes[report.service][0] : defaultChartPalette[serviceIndex % defaultChartPalette.length];
        if (print || document.documentElement.dataset.theme !== "dark") {
          const lightColors = { agua: 0x0284c7, luz: 0xb45309, internet: 0x15803d, otro: 0x64748b };
          colorValue = Object.hasOwn(lightColors, report.service) ? lightColors[report.service] : [0x0e7490, 0x1d4ed8, 0x6d28d9, 0xa21caf, 0xbe185d, 0xc2410c][serviceIndex % 6];
        }
        serviceIndex += 1;
        const fill = am5.color(colorValue);
        const series = chart.series.push(am5xy.ColumnSeries.new(root, {
          name: report.label,
          xAxis, yAxis, stacked: index > 0,
          valueYField: `value${index}`, categoryXField: "category",
          fill, stroke: fill,
          tooltip: createChartTooltip(root, "{name}\n{categoryX}: S/ {valueY}", theme)
        }));
        series.columns.template.setAll({ width: am5.percent(85), stroke: theme.tooltipBackground, strokeWidth: 1, tooltipY: am5.percent(10) });
        series.columns.template.adapters.add("forceHidden", (_, column) => column.dataItem?.get("valueY") === 0);
        const channels = [colorValue >> 16 & 255, colorValue >> 8 & 255, colorValue & 255].map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
        const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        series.bullets.push(() => am5.Bullet.new(root, {
          locationY: 0.5,
          sprite: am5.Label.new(root, { text: "{valueY}", populateText: true, centerY: am5.p50, centerX: am5.p50, fill: am5.color(luminance > 0.179 ? 0x000000 : 0xffffff), fontSize: 12, oversizedBehavior: "hide" })
        }));
        series.data.setAll(data);
        legend.data.push(series);
        if (!reducedMotion) series.appear(500);
      });
      if (!reducedMotion) chart.appear(500, 0);
    });
  }

  document.addEventListener("vecinosapp:report-tab-changed", () => renderEvolution());
  document.addEventListener("vecinosapp:theme-changed", () => renderEvolution());
  document.addEventListener("vecinosapp:prepare-report-print", (event) => {
    document.body.classList.add("report-print-preparing");
    printPrepared = true;
    panel.querySelectorAll(".consumption-chart").forEach((chart) => chart.classList.add("occupant-evolution-print-capture"));
    renderEvolution(true);
    event.detail.pending.push(Promise.all(roots.map((root) => new Promise((resolve) => {
      let settledTimer;
      const listener = root.events.on("frameended", () => {
        clearTimeout(settledTimer);
        settledTimer = setTimeout(() => {
          listener.dispose();
          const layers = [...root.dom.querySelectorAll("canvas")];
          const canvas = document.createElement("canvas");
          canvas.width = layers[0].width;
          canvas.height = layers[0].height;
          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          for (const layer of layers) context.drawImage(layer, 0, 0, canvas.width, canvas.height);
          const image = root.dom.parentElement.querySelector(".occupant-evolution-print-image") || document.createElement("img");
          image.className = "occupant-evolution-print-image";
          image.alt = root.dom.getAttribute("aria-label");
          image.src = canvas.toDataURL("image/png");
          root.dom.after(image);
          image.decode().then(() => {
            root.dom.classList.remove("occupant-evolution-print-capture");
            resolve();
          });
        }, 150);
      });
    }))));
  });
  window.addEventListener("beforeprint", () => {
    const values = panel?.querySelector(".occupant-consumption-values");
    if (values) {
      valuesWereOpen ??= values.open;
      values.open = true;
    }
    if (!printPrepared) renderEvolution(true);
  });
  window.addEventListener("afterprint", () => {
    const values = panel?.querySelector(".occupant-consumption-values");
    if (values && valuesWereOpen !== undefined) values.open = valuesWereOpen;
    valuesWereOpen = undefined;
    printPrepared = false;
    document.body.classList.remove("report-print-preparing");
    renderEvolution();
  });
  window.addEventListener("pagehide", () => disposeChartRoots(roots));
}