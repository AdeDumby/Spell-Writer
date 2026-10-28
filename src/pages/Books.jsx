import { useMemo, useState } from "react";
import Glyph from "../components/Glyph.jsx";
import {
  BOOK_COVERS,
  COVER_PAGES,
  DEFAULT_PAGES,
  MAX_PAGES,
  MIN_PAGES,
  resolveColors,
  spellCapacity,
} from "../lib/spell.js";
import { exportBook } from "../lib/export.js";
import { useStore } from "../store.jsx";

/** Cover colour choices. */
function CoverPicker({ value, onChange }) {
  return (
    <div className="cover-picker" role="radiogroup" aria-label="Cover colour">
      {Object.entries(BOOK_COVERS).map(([key, c]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          className={value === key ? "swatch on" : "swatch"}
          style={{ background: c.color }}
          title={c.label}
          onClick={() => onChange(key)}
        />
      ))}
    </div>
  );
}

/** One cell per page of the book: cover, summary, spells, then the empty pages that are left. */
function PageStrip({ book, spells }) {
  const cells = [];
  for (let i = 0; i < book.pages; i++) {
    if (i === 0) cells.push({ cls: "cover", tip: "Page 1 · Cover" });
    else if (i === 1) cells.push({ cls: "summary", tip: "Page 2 · Summary" });
    else {
      const sp = spells[i - COVER_PAGES];
      cells.push(sp ? { cls: "spell", tip: `Page ${i + 1} · ${sp.name}` } : { cls: "empty", tip: `Page ${i + 1} · empty` });
    }
  }
  return (
    <div className="page-strip" aria-hidden="true">
      {cells.map((c, i) => (
        <span key={i} className={`pg ${c.cls}`} title={c.tip} />
      ))}
    </div>
  );
}

function BookEditor({ book, onBack }) {
  const { data, patchBook, setBookSpells, deleteBook } = useStore();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const byId = useMemo(() => new Map(data.spells.map((s) => [s.id, s])), [data.spells]);
  const inBook = book.spellIds.map((id) => byId.get(id)).filter(Boolean);
  const capacity = spellCapacity(book.pages);
  const full = inBook.length >= capacity;
  const used = COVER_PAGES + inBook.length;
  const minPages = Math.max(MIN_PAGES, COVER_PAGES + inBook.length);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    const taken = new Set(book.spellIds);
    return data.spells
      .filter((s) => !taken.has(s.id))
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [data.spells, book.spellIds, query]);

  const move = (i, d) =>
    setBookSpells(book.id, (ids) => {
      const next = [...ids];
      const j = i + d;
      if (j < 0 || j >= next.length) return ids;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const doExport = async () => {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const where = await exportBook(book, inBook);
      if (where) setSaved(`Saved ${where}`);
    } catch (e) {
      setError(e?.message || "Could not create the PDF");
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (window.confirm(`Delete the book “${book.title}”? Its spells stay in your Spellbook.`)) {
      deleteBook(book.id);
      onBack();
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h2>{book.title || "Untitled book"}</h2>
          <p className="hint">
            {used} of {book.pages} pages used · {inBook.length} {inBook.length === 1 ? "spell" : "spells"}
          </p>
        </div>
        <div className="toolbar">
          <button onClick={onBack}>← All books</button>
          <button className="primary" onClick={doExport} disabled={busy}>
            {busy ? "Writing the PDF…" : "Export PDF"}
          </button>
          <button className="danger" onClick={remove}>
            Delete
          </button>
        </div>
      </header>
      {error && <p className="err">{error}</p>}
      {saved && <p className="hint">{saved}</p>}

      <div className="two-col">
        <section className="card">
          <label className="stack">
            <span className="label">Title</span>
            <input value={book.title} onChange={(e) => patchBook(book.id, { title: e.target.value })} />
          </label>
          <label className="stack">
            <span className="label">Subtitle</span>
            <input
              value={book.subtitle}
              onChange={(e) => patchBook(book.id, { subtitle: e.target.value })}
              placeholder="Optional, under the title on the cover"
            />
          </label>
          <label className="stack">
            <span className="label">Author</span>
            <input
              value={book.author}
              onChange={(e) => patchBook(book.id, { author: e.target.value })}
              placeholder="Optional, “by …” at the foot of the cover"
            />
          </label>
          <div className="stack">
            <span className="label">Cover</span>
            <CoverPicker value={book.cover} onChange={(cover) => patchBook(book.id, { cover })} />
          </div>
          <label className="stack">
            <span className="label">Pages</span>
            <input
              type="number"
              min={minPages}
              max={MAX_PAGES}
              value={book.pages}
              onChange={(e) => patchBook(book.id, { pages: e.target.value === "" ? book.pages : Number(e.target.value) })}
            />
            <span className="hint small">
              Page 1 is the cover and page 2 the summary, so this book holds {capacity}{" "}
              {capacity === 1 ? "spell" : "spells"}, one per page. It can't go below {minPages} while it holds{" "}
              {inBook.length}.
            </span>
          </label>

          <div className={full ? "meter full" : "meter"}>
            <div style={{ width: `${(used / book.pages) * 100}%` }} />
          </div>
          <PageStrip book={book} spells={inBook} />
        </section>

        <section className="card">
          <h3>In this book</h3>
          {inBook.length === 0 ? (
            <p className="hint">No spells yet. Add some from the list below.</p>
          ) : (
            <ol className="book-spells">
              {inBook.map((s, i) => (
                <li key={s.id}>
                  <span className="pgno">p. {i + 1 + COVER_PAGES}</span>
                  <Glyph
                    parts={s.parts}
                    layout={s.layout}
                    colors={resolveColors(s.parts, s.colors)}
                    className="glyph mini"
                  />
                  <span className="grow">{s.name}</span>
                  <button aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button
                    aria-label={`Move ${s.name} down`}
                    disabled={i === inBook.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    aria-label={`Remove ${s.name}`}
                    onClick={() => setBookSpells(book.id, (ids) => ids.filter((x) => x !== s.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          )}

          <h3>Add spells</h3>
          {full && (
            <p className="hint">
              The book is full ({book.pages} pages). Add pages or remove a spell to make room.
            </p>
          )}
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your spellbook…"
          />
          {data.spells.length === 0 ? (
            <p className="hint">Your spellbook is empty: write a spell in the Quill first.</p>
          ) : available.length === 0 ? (
            <p className="hint">{query ? `No spell matches “${query}”.` : "Every spell is already in this book."}</p>
          ) : (
            <ul className="book-spells available">
              {available.map((s) => (
                <li key={s.id}>
                  <Glyph
                    parts={s.parts}
                    layout={s.layout}
                    colors={resolveColors(s.parts, s.colors)}
                    className="glyph mini"
                  />
                  <span className="grow">{s.name}</span>
                  <button disabled={full} onClick={() => setBookSpells(book.id, (ids) => [...ids, s.id])}>
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function Books() {
  const { data, addBook } = useStore();
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", pages: DEFAULT_PAGES, cover: "oxblood" });

  const open = data.books.find((b) => b.id === openId);
  if (open) return <BookEditor book={open} onBack={() => setOpenId(null)} />;

  const create = () => {
    const id = addBook({
      title: form.title.trim() || "Untitled book",
      pages: Number(form.pages) || DEFAULT_PAGES,
      cover: form.cover,
    });
    setCreating(false);
    setForm({ title: "", pages: DEFAULT_PAGES, cover: "oxblood" });
    setOpenId(id);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h2>Books</h2>
          <p className="hint">
            {data.books.length} {data.books.length === 1 ? "book" : "books"}. A book gathers spells, with a cover and a
            summary, up to its page count.
          </p>
        </div>
        <div className="toolbar">
          <button className="primary" onClick={() => setCreating(true)}>
            New book
          </button>
        </div>
      </header>

      {creating && (
        <section className="card new-book">
          <label className="stack">
            <span className="label">Title</span>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Untitled book"
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
          </label>
          <label className="stack">
            <span className="label">Pages (cover and summary included)</span>
            <input
              type="number"
              min={MIN_PAGES}
              max={MAX_PAGES}
              value={form.pages}
              onChange={(e) => setForm({ ...form, pages: e.target.value })}
            />
          </label>
          <div className="stack">
            <span className="label">Cover</span>
            <CoverPicker value={form.cover} onChange={(cover) => setForm({ ...form, cover })} />
          </div>
          <div className="toolbar">
            <button onClick={() => setCreating(false)}>Cancel</button>
            <button className="primary" onClick={create}>
              Create book
            </button>
          </div>
        </section>
      )}

      {data.books.length === 0 && !creating ? (
        <div className="empty card">
          <p>No books yet.</p>
          <button className="primary" onClick={() => setCreating(true)}>
            Create your first book
          </button>
        </div>
      ) : (
        <div className="grid">
          {data.books.map((b) => (
            <article key={b.id} className="card book-card">
              <div className="book-cover" style={{ background: (BOOK_COVERS[b.cover] ?? BOOK_COVERS.oxblood).color }}>
                <strong>{b.title}</strong>
                {b.author && <em>by {b.author}</em>}
              </div>
              <p className="hint">
                {COVER_PAGES + b.spellIds.length} of {b.pages} pages · {b.spellIds.length}{" "}
                {b.spellIds.length === 1 ? "spell" : "spells"}
              </p>
              <div className="toolbar">
                <button className="primary" onClick={() => setOpenId(b.id)}>
                  Open
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
