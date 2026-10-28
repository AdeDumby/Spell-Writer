import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  COVER_PAGES,
  DEFAULT_PAGES,
  MAX_PAGES,
  MIN_PAGES,
  defaultCategories,
  newBook,
  normalizeData,
  spellCapacity,
} from "./lib/spell.js";
import { storage } from "./lib/platform.js";

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

export const emptyDraft = () => ({
  editingId: null, // id of the spell being edited, or null for a new one
  name: "",
  preamble: "", // short opening words, shown right under the title on the PDF
  notes: "", // the description
  selection: {}, // { categoryId: fieldIndex }
  texts: {}, // { categoryId: "free text" } for text categories such as Pronunciation
  layout: null, // null = use the default representation from Settings
  colors: null, // null = use the default colour scheme from Settings
});

// Pages are whole numbers between the minimum and the maximum, and never fewer than cover + summary + the spells inside.
const clampPages = (pages, spellCount) =>
  Math.min(MAX_PAGES, Math.max(MIN_PAGES, COVER_PAGES + spellCount, Math.round(Number(pages)) || DEFAULT_PAGES));

export function StoreProvider({ children }) {
  const [data, setData] = useState(null); // { categories, defaultLayout, defaultColors, spells, books }
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
      deleteSpell: (id) =>
        setData((d) => ({
          ...d,
          spells: d.spells.filter((s) => s.id !== id),
          // A deleted spell also leaves every book it was in.
          books: d.books.map((b) => (b.spellIds.includes(id) ? { ...b, spellIds: b.spellIds.filter((x) => x !== id) } : b)),
        })),

      // ----- books: the page count is the one hard limit, enforced here so no screen can break it -----
      addBook: (patch = {}) => {
        const book = newBook({ ...patch, pages: clampPages(patch.pages ?? DEFAULT_PAGES, 0) });
        setData((d) => ({ ...d, books: [book, ...d.books] }));
        return book.id;
      },
      patchBook: (id, patch) =>
        setData((d) => ({
          ...d,
          books: d.books.map((b) => {
            if (b.id !== id) return b;
            const next = { ...b, ...patch, updatedAt: Date.now() };
            // A book can't be shrunk below the pages its spells already use.
            next.pages = clampPages(next.pages, b.spellIds.length);
            return next;
          }),
        })),
      setBookSpells: (id, fn) =>
        setData((d) => {
          const known = new Set(d.spells.map((s) => s.id));
          return {
            ...d,
            books: d.books.map((b) => {
              if (b.id !== id) return b;
              const ids = fn(b.spellIds)
                .filter((x, i, all) => known.has(x) && all.indexOf(x) === i)
                .slice(0, spellCapacity(b.pages)); // never more spells than pages
              return { ...b, spellIds: ids, updatedAt: Date.now() };
            }),
          };
        }),
      deleteBook: (id) => setData((d) => ({ ...d, books: d.books.filter((b) => b.id !== id) })),

      replaceAll: (raw) => setData(normalizeData(raw)),
      resetDraft: () => setDraft(emptyDraft()),
    }),
    []
  );

  const value = { data, draft, setDraft, page, setPage, ...actions };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
