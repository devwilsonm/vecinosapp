// @ts-nocheck
import {
  addCategoryAxis,
  addChartCursor,
  addColumnSeries,
  addValueAxis,
  createChartRoot,
  createChartTooltip,
  createXYChart,
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