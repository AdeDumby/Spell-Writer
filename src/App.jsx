import Spellbook from "./pages/Spellbook.jsx";
import Quill from "./pages/Quill.jsx";
import Settings from "./pages/Settings.jsx";
import { useStore } from "./store.jsx";

const PAGES = [
  { key: "spellbook", label: "Spellbook", Component: Spellbook },
  { key: "quill", label: "Quill", Component: Quill },
  { key: "settings", label: "Settings", Component: Settings },
];

export default function App() {
  const { data, page, setPage, draft } = useStore();

  if (!data) return <div className="loading">Opening the spellbook…</div>;

  const Current = (PAGES.find((p) => p.key === page) ?? PAGES[0]).Component;

  return (
    <div className="shell">
      <nav className="sidebar">
        <h1>Spell Writer</h1>
        {PAGES.map((p) => (
          <button
            key={p.key}
            className={p.key === page ? "nav on" : "nav"}
            onClick={() => setPage(p.key)}
          >
            {p.label}
            {p.key === "spellbook" && <span className="badge">{data.spells.length}</span>}
            {p.key === "quill" && draft.editingId && <span className="badge">editing</span>}
          </button>
        ))}
      </nav>
      <main className="content">
        <Current />
      </main>
    </div>
  );
}
