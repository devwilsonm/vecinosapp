// @ts-nocheck
export {};

const localDateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

document.querySelectorAll("[data-local-datetime]").forEach((element) => {
  const value = element.dataset.localDatetime;
  if (!value) return;
  const utcDate = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(utcDate.getTime())) return;
  element.textContent = localDateTimeFormatter.format(utcDate);
  element.title = `${value} UTC`;
});