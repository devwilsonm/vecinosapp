// @ts-nocheck
function shareUrlFrom(element) {
  const path = element.closest("[data-share-path]")?.dataset.sharePath;
  return path ? new URL(path, window.location.origin).href : window.location.href;
}

function setShareStatus(element, message) {
  const status = element.closest("[data-share-path]")?.querySelector("[data-share-status]");
  if (status) status.textContent = message;
}

async function copyShareUrl(element) {
  const url = shareUrlFrom(element);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setShareStatus(element, "Enlace copiado.");
  } catch {
    setShareStatus(element, "No se pudo copiar el enlace.");
  }
}

document.querySelectorAll("[data-copy-share]").forEach((button) => {
  button.addEventListener("click", () => copyShareUrl(button));
});

document.querySelectorAll("[data-share-native]").forEach((button) => {
  button.addEventListener("click", async () => {
    const url = shareUrlFrom(button);
    const title = button.closest("[data-share-title]")?.dataset.shareTitle || "Cuotas";
    if (navigator.share) {
      try {
        await navigator.share({ title, text: title, url });
        setShareStatus(button, "Compartido.");
      } catch (error) {
        if (error?.name !== "AbortError") setShareStatus(button, "No se pudo compartir.");
      }
      return;
    }
    await copyShareUrl(button);
  });
});

document.querySelectorAll("[data-share-whatsapp]").forEach((button) => {
  button.addEventListener("click", () => {
    const url = shareUrlFrom(button);
    const title = button.closest("[data-share-title]")?.dataset.shareTitle || "Cuotas";
    window.open(`https://wa.me/?text=${encodeURIComponent(`${title}: ${url}`)}`, "_blank", "noopener");
  });
});

function stylesheetText() {
  return Array.from(document.styleSheets).map((sheet) => {
    try {
      return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
    } catch {
      return "";
    }
  }).join("\n");
}

function elementToPng(element) {
  const width = Math.max(element.scrollWidth, element.clientWidth);
  const height = element.scrollHeight;
  const clone = element.cloneNode(true);
  clone.style.width = `${width}px`;
  const styles = stylesheetText().replace(/<\/style/gi, "<\\/style");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${styles}</style>${clone.outerHTML}</div></foreignObject></svg>`;
  const image = new Image();
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return new Promise((resolve, reject) => {
    image.onload = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const context = canvas.getContext("2d");
      context.scale(scale, scale);
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo crear la imagen.")), "image/png");
    };
    image.onerror = () => reject(new Error("No se pudo capturar la vista."));
    image.src = svgUrl;
  });
}

document.querySelectorAll("[data-capture-target]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.captureTarget);
    if (!target) return;
    const title = button.closest("[data-share-title]")?.dataset.shareTitle || "Cuotas";
    const fileName = `${title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "cuotas"}.png`;
    button.disabled = true;
    setShareStatus(button, "Generando captura...");
    try {
      const blob = await elementToPng(target);
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title, files: [file] });
        setShareStatus(button, "Captura compartida.");
      } else {
        const download = document.createElement("a");
        download.href = URL.createObjectURL(blob);
        download.download = fileName;
        download.click();
        URL.revokeObjectURL(download.href);
        setShareStatus(button, "Captura descargada.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setShareStatus(button, "No se pudo generar la captura.");
    } finally {
      button.disabled = false;
    }
  });
});