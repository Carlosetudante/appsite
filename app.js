const defaultConfig = {
  appName: "Universo Real",
  subtitle: "Baixe a versao mais recente do aplicativo.",
  version: "1.0.0",
  releaseDate: "2026-03-17",
  apkUrl: "./downloads/universo-real-latest.apk",
  apkFilename: "universo-real-latest.apk",
  whatsNew: [
    "Atualizacao de estabilidade",
    "Melhorias de desempenho",
    "Correcoes gerais"
  ]
};

function formatDate(isoDate) {
  const parsed = new Date(String(isoDate || "").trim());
  if (!Number.isFinite(parsed.getTime())) return "--";
  return parsed.toLocaleDateString("pt-BR");
}

function toAbsoluteUrl(url) {
  try {
    return new URL(url, window.location.href).toString();
  } catch (e) {
    return String(url || "").trim();
  }
}

function render(config) {
  const safe = { ...defaultConfig, ...(config || {}) };
  const appNameEl = document.getElementById("appName");
  const subtitleEl = document.getElementById("subtitle");
  const versionLineEl = document.getElementById("versionLine");
  const dateLineEl = document.getElementById("dateLine");
  const statusLineEl = document.getElementById("statusLine");
  const changelogListEl = document.getElementById("changelogList");
  const platformHintEl = document.getElementById("platformHint");
  const downloadBtn = document.getElementById("downloadBtn");
  const copyBtn = document.getElementById("copyBtn");

  const apkUrl = String(safe.apkUrl || "").trim();
  const absApkUrl = toAbsoluteUrl(apkUrl);

  appNameEl.textContent = String(safe.appName || defaultConfig.appName);
  subtitleEl.textContent = String(safe.subtitle || defaultConfig.subtitle);
  versionLineEl.textContent = `Versao: ${String(safe.version || "--")}`;
  dateLineEl.textContent = `Atualizado em: ${formatDate(safe.releaseDate)}`;

  downloadBtn.href = absApkUrl || "#";
  downloadBtn.download = String(safe.apkFilename || defaultConfig.apkFilename);
  downloadBtn.setAttribute("aria-disabled", absApkUrl ? "false" : "true");

  if (!absApkUrl) {
    statusLineEl.textContent = "Defina apkUrl em config.json para habilitar o download.";
  } else {
    statusLineEl.textContent = "Link pronto. Pode compartilhar esta pagina com os usuarios.";
  }

  const news = Array.isArray(safe.whatsNew) ? safe.whatsNew : [];
  changelogListEl.innerHTML = news.map((item) => `<li>${String(item || "").trim()}</li>`).join("");

  const isAndroid = /android/i.test(navigator.userAgent || "");
  platformHintEl.textContent = isAndroid
    ? "Android detectado. Toque em Baixar APK para instalar."
    : "Dica: no PC, copie o link e abra no celular Android para instalar.";

  copyBtn.addEventListener("click", async () => {
    if (!absApkUrl) return;
    try {
      await navigator.clipboard.writeText(absApkUrl);
      statusLineEl.textContent = "Link copiado com sucesso.";
    } catch (e) {
      window.prompt("Copie o link abaixo:", absApkUrl);
    }
  });
}

async function loadConfig() {
  try {
    const res = await fetch(`./config.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const config = await res.json();
    render(config);
  } catch (e) {
    render(defaultConfig);
    const statusLineEl = document.getElementById("statusLine");
    statusLineEl.textContent = "config.json nao encontrado. Usando configuracao padrao.";
  }
}

window.addEventListener("load", loadConfig);
