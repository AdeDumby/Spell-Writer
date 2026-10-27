import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { defaultCategories, normalizeData } from "./lib/spell.js";
import { storage } from "./lib/platform.js";

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

export const emptyDraft = () => ({
  editingId: null, // id of the spell being edited, or null for a new one
  name: "",
  notes: "",
  selection: {}, // { categoryId: fieldIndex }
  layout: null, // null = use the default representation from Settings
  colors: null, // null = use the default colour scheme from Settings
});

export function StoreProvider({ children }) {
  const [data, setData] = useState(null); // { categories, defaultLayout, spells }
  const [draft, setDraft] = useState(emptyDraft); // the spell currently open in the Quill
  const [page, setPage] = useState("spellbook");

  // Load once on startup.
  useEffect(() => {
    let alive = true;
    storage.load().then((raw) => alive && setData(normalizeData(raw)));
    return () => {
      alive = false;
    };
  }, []);

  // Save shortly after every change.
  useEffect(() => {
    if (!data) return undefined;
    const t = setTimeout(() => storage.save(data), 250);
    return () => clearTimeout(t);
  }, [data]);

  const actions = useMemo(
    () => ({
      setCategories: (fn) => setData((d) => ({ ...d, categories: fn(d.categories) })),
      resetCategories: () => setData((d) => ({ ...d, categories: defaultCategories() })),
      setDefaultLayout: (defaultLayout) => setData((d) => ({ ...d, defaultLayout })),
      setDefaultColors: (defaultColors) => setData((d) => ({ ...d, defaultColors })),

      saveSpell: (spell) =>
        setData((d) => {
          const exists = d.spells.some((s) => s.id === spell.id);
          const spells = exists
            ? d.spells.map((s) => (s.id === spell.id ? spell : s))
            : [spell, ...d.spells];
          return { ...d, spells };
        }),
      patchSpell: (id, patch) =>
        setData((d) => ({ ...d, spells: d.spells.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
      deleteSpell: (id) => setData((d) => ({ ...d, spells: d.spells.filter((s) => s.id !== id) })),

      replaceAll: (raw) => setData(normalizeData(raw)),
      resetDraft: () => setDraft(emptyDraft()),
    }),
    []
  );

  const value = { data, draft, setDraft, page, setPage, ...actions };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
