// Thin wrapper over the Electron preload API (window.api).
// When the app runs in a plain browser (e.g. `npx vite` without Electron),
// everything falls back to localStorage and normal downloads, so you can still iterate on the UI.

const KEY = "spell-writer-data-v2";
const api = typeof window !== "undefined" ? window.api : undefined;

export const isElectron = !!api;

export const storage = {
  async load() {
    try {
      const text = api ? await api.load() : localStorage.getItem(KEY);
      return text ? JSON.parse(text) : null;
    } catch (err) {
      console.error("Could not load saved data", err);
      return null;
    }
  },
  async save(data) {
    const json = JSON.stringify(data);
    try {
      if (api) await api.save(json);
      else localStorage.setItem(KEY, json);
    } catch (err) {
      console.error("Could not save data", err);
    }
  },
};

/** Ask the user where to save a text file (native dialog in Electron, download in a browser). */
export async function exportText(defaultName, content, mime = "text/plain") {
  if (api) return api.exportFile({ defaultName, content });
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return defaultName;
}

/** Let the user pick a JSON file and return its text, or null if they cancel. */
export async function importText() {
  if (api) return api.importFile();
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => resolve(input.files?.[0] ? await input.files[0].text() : null);
    input.click();
  });
}

export const serializeSvg = (el) => new XMLSerializer().serializeToString(el);
