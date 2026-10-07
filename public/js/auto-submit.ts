// @ts-nocheck
export {};

document.querySelectorAll(".auto-submit").forEach((field) => {
  field.addEventListener("change", () => field.form?.submit());
});