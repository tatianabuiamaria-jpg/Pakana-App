import React, { useState, useEffect } from "react";
import { Search, Plus, MapPin, Phone, MessageCircle, ChevronLeft, Camera, X, Check, Loader2 } from "lucide-react";

// ====================================================================
// SUPABASE SETUP — using plain REST calls (no npm install needed).
// Find these in Supabase: Project Settings > API
// ====================================================================
const SUPABASE_URL = "https://ellncnfpgcfigjklxmnx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsbG5jbmZwZ2NmaWdqa2x4bW54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDIyMzUsImV4cCI6MjA5Nzg3ODIzNX0.kFLuPVnaqPMKwYOqLrdVxc1IJ4L9TGl3bA9TgV4V1aM";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

// Minimal REST wrapper standing in for the supabase-js client.
// Same Supabase project, same table, same RLS rules — just plain fetch calls
// instead of the npm package, so this runs anywhere without an install step.
const supabaseRest = {
  async select(table, { order } = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
    if (order) url += `&order=${order}`;
    const res = await fetch(url, { headers: SUPABASE_HEADERS });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Fetch failed (${res.status}): ${body}`);
    }
    return res.json();
  },
  async insert(table, rows) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...SUPABASE_HEADERS, Prefer: "return=representation" },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Insert failed (${res.status}): ${body}`);
    }
    return res.json();
  },
  async deleteById(table, id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: SUPABASE_HEADERS,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Delete failed (${res.status}): ${body}`);
    }
    return true;
  },
};

const CATEGORIES = [
  { id: "home", label: "Home Services", glyph: "🔧" },
  { id: "vehicles", label: "Vehicles", glyph: "🚗" },
  { id: "electronics", label: "Electronics", glyph: "📱" },
  { id: "beauty", label: "Beauty & Hair", glyph: "💇" },
  { id: "tutoring", label: "Tutoring", glyph: "📘" },
  { id: "goods", label: "Secondhand Goods", glyph: "🛋️" },
];

const AREAS = [
  "All areas", "Klein Windhoek", "Khomasdal", "Katutura", "Olympia",
  "Eros", "Pioneerspark", "Wanaheda", "Hochland Park",
];

// Note: with a real backend, you seed listings by inserting rows directly in
// Supabase's Table Editor (or by posting them through the app itself) —
// see the "seeding your first listings" section in the setup guide below.

function timeAgoSort(a, b) {
  return 0;
}


export default function App() {
  const [screen, setScreen] = useState("browse"); // browse | detail | post | mine
  const [activeListing, setActiveListing] = useState(null);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("All areas");
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myPhone, setMyPhone] = useState("264811234567"); // pretend "logged in" number — Step 3 (OTP) will replace this
  const [toast, setToast] = useState(null);

  // Load listings from Supabase on first render
  useEffect(() => {
    fetchListings();
  }, []);

  async function fetchListings() {
    setLoading(true);
    try {
      const data = await supabaseRest.select("listings", { order: "created_at.desc" });
      setListings(
        (data || []).map((l) => ({
          ...l,
          posted: timeAgo(l.created_at),
        }))
      );
    } catch (err) {
      console.error("Error fetching listings:", err);
      showToast(err.message.slice(0, 180));
    }
    setLoading(false);
  }

  function timeAgo(isoDate) {
    const seconds = Math.floor((Date.now() - new Date(isoDate)) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min${minutes !== 1 ? "s" : ""} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
    return `${Math.floor(days / 7)} week${Math.floor(days / 7) !== 1 ? "s" : ""} ago`;
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  }

  const filtered = listings.filter((l) => {
    const matchesSearch =
      !search ||
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      (l.description || "").toLowerCase().includes(search.toLowerCase());
    const matchesArea = areaFilter === "All areas" || l.area === areaFilter;
    const matchesCat = !categoryFilter || l.category === categoryFilter;
    return matchesSearch && matchesArea && matchesCat;
  });

  function openListing(listing) {
    setActiveListing(listing);
    setScreen("detail");
  }

  async function addListing(newListing) {
    try {
      await supabaseRest.insert("listings", [
        {
          title: newListing.title,
          category: newListing.category,
          area: newListing.area,
          price: newListing.price,
          description: newListing.desc,
          phone: myPhone,
        },
      ]);
    } catch (err) {
      console.error("Error posting listing:", err);
      showToast(err.message.slice(0, 180));
      return;
    }

    setScreen("browse");
    showToast("Listing posted");
    fetchListings(); // refresh from the database so everyone's view stays in sync
  }

  async function removeListing(id) {
    try {
      await supabaseRest.deleteById("listings", id);
    } catch (err) {
      console.error("Error removing listing:", err);
      showToast("Couldn't remove — try again");
      return;
    }
    setListings((prev) => prev.filter((l) => l.id !== id));
    showToast("Listing removed");
  }

  return (
    <div style={styles.appShell}>
      <div style={styles.phoneFrame}>
        <StatusBar />
        <div style={styles.content}>
          {screen === "browse" && (
            <Browse
              listings={filtered}
              loading={loading}
              search={search}
              setSearch={setSearch}
              areaFilter={areaFilter}
              setAreaFilter={setAreaFilter}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              onOpen={openListing}
            />
          )}
          {screen === "detail" && (
            <Detail listing={activeListing} onBack={() => setScreen("browse")} />
          )}
          {screen === "post" && (
            <PostForm onCancel={() => setScreen("browse")} onSubmit={addListing} />
          )}
          {screen === "mine" && (
            <MyListings
              listings={listings.filter((l) => l.phone === myPhone)}
              onOpen={openListing}
              onRemove={removeListing}
            />
          )}
        </div>
        {screen !== "detail" && screen !== "post" && <BottomNav screen={screen} setScreen={setScreen} />}
        {toast && <div style={styles.toast}>{toast}</div>}
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div style={styles.statusBar}>
      <span>9:41</span>
      <span style={{ display: "flex", gap: 6 }}>
        <span>●●●</span><span>📶</span><span>🔋</span>
      </span>
    </div>
  );
}

function Header({ title, subtitle }) {
  return (
    <div style={styles.header}>
      <div style={styles.headerEyebrow}>WINDHOEK</div>
      <h1 style={styles.headerTitle}>{title}</h1>
      {subtitle && <p style={styles.headerSubtitle}>{subtitle}</p>}
    </div>
  );
}

function Browse({ listings, loading, search, setSearch, areaFilter, setAreaFilter, categoryFilter, setCategoryFilter, onOpen }) {
  return (
    <div style={styles.screen}>
      <Header title="Pakana" subtitle="Find it, fix it, sell it — right here in Windhoek." />

      <div style={styles.searchRow}>
        <Search size={18} color="#9A8C7A" strokeWidth={2.5} />
        <input
          style={styles.searchInput}
          placeholder="Search plumber, fridge, braids..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div style={styles.areaScroll}>
        {AREAS.map((a) => (
          <button
            key={a}
            onClick={() => setAreaFilter(a)}
            style={{
              ...styles.areaChip,
              ...(areaFilter === a ? styles.areaChipActive : {}),
            }}
          >
            {a}
          </button>
        ))}
      </div>

      <div style={styles.categoryGrid}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(categoryFilter === c.id ? null : c.id)}
            style={{
              ...styles.categoryTile,
              ...(categoryFilter === c.id ? styles.categoryTileActive : {}),
            }}
          >
            <span style={styles.categoryGlyph}>{c.glyph}</span>
            <span style={styles.categoryLabel}>{c.label}</span>
          </button>
        ))}
      </div>

      <div style={styles.listingsHeader}>
        <span style={styles.listingsCount}>{listings.length} listing{listings.length !== 1 ? "s" : ""}</span>
      </div>

      <div style={styles.listingList}>
        {loading && (
          <div style={styles.emptyState}>
            <Loader2 size={22} color="#9A8C7A" />
            <p style={{ ...styles.emptyBody, marginTop: 10 }}>Loading listings...</p>
          </div>
        )}
        {!loading && listings.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Nothing here yet.</p>
            <p style={styles.emptyBody}>Try a different area or category — or be the first to post one.</p>
          </div>
        )}
        {!loading && listings.map((l) => (
          <button key={l.id} style={styles.listingCard} onClick={() => onOpen(l)}>
            <div style={styles.listingThumb}>{CATEGORIES.find((c) => c.id === l.category)?.glyph}</div>
            <div style={styles.listingInfo}>
              <div style={styles.listingTitle}>{l.title}</div>
              <div style={styles.listingMeta}>
                <span style={styles.listingPrice}>{l.price}</span>
              </div>
              <div style={styles.listingFooter}>
                <span style={styles.listingArea}><MapPin size={11} style={{ marginRight: 3 }} />{l.area}</span>
                <span style={styles.listingTime}>{l.posted}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Detail({ listing, onBack }) {
  if (!listing) return null;
  const waMessage = encodeURIComponent(`Hi, I saw your listing "${listing.title}" on Pakana — is it still available?`);
  const waLink = `https://wa.me/${listing.phone}?text=${waMessage}`;

  return (
    <div style={styles.screen}>
      <button style={styles.backButton} onClick={onBack}>
        <ChevronLeft size={20} /> Back
      </button>

      <div style={styles.detailHero}>
        <span style={{ fontSize: 64 }}>{CATEGORIES.find((c) => c.id === listing.category)?.glyph}</span>
      </div>

      <div style={styles.detailBody}>
        <div style={styles.detailCategory}>{CATEGORIES.find((c) => c.id === listing.category)?.label}</div>
        <h2 style={styles.detailTitle}>{listing.title}</h2>
        <div style={styles.detailPrice}>{listing.price}</div>

        <div style={styles.detailMetaRow}>
          <span style={styles.detailMetaItem}><MapPin size={14} style={{ marginRight: 4 }} />{listing.area}</span>
          <span style={styles.detailMetaItem}>{listing.posted}</span>
        </div>

        <div style={styles.divider} />

        <p style={styles.detailDesc}>{listing.description || listing.desc}</p>

        <div style={styles.verifiedRow}>
          <Check size={14} color="#6B7A52" strokeWidth={3} />
          <span style={styles.verifiedText}>Phone number verified</span>
        </div>
      </div>

      <div style={styles.detailActions}>
        <a href={waLink} target="_blank" rel="noreferrer" style={styles.waButton}>
          <MessageCircle size={18} /> WhatsApp
        </a>
        <a href={`tel:+${listing.phone}`} style={styles.callButton}>
          <Phone size={18} /> Call
        </a>
      </div>
    </div>
  );
}

function PostForm({ onCancel, onSubmit }) {
  const [form, setForm] = useState({
    title: "", category: "home", area: AREAS[1], price: "", desc: "",
  });

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit() {
    if (!form.title.trim() || !form.price.trim()) {
      return;
    }
    onSubmit(form);
  }

  const valid = form.title.trim() && form.price.trim();

  return (
    <div style={styles.screen}>
      <div style={styles.postHeaderRow}>
        <button style={styles.iconButton} onClick={onCancel}><X size={20} /></button>
        <h2 style={styles.postHeaderTitle}>New listing</h2>
        <div style={{ width: 36 }} />
      </div>

      <div style={styles.photoUpload}>
        <Camera size={28} color="#9A8C7A" />
        <span style={styles.photoUploadText}>Add a photo</span>
      </div>

      <Field label="What are you offering?">
        <input
          style={styles.input}
          placeholder="e.g. Reliable plumber, burst pipes & geysers"
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
        />
      </Field>

      <Field label="Category">
        <div style={styles.chipRow}>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              style={{ ...styles.formChip, ...(form.category === c.id ? styles.formChipActive : {}) }}
              onClick={() => update("category", c.id)}
            >
              {c.glyph} {c.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Area">
        <select style={styles.input} value={form.area} onChange={(e) => update("area", e.target.value)}>
          {AREAS.slice(1).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </Field>

      <Field label="Price">
        <input
          style={styles.input}
          placeholder="e.g. N$250 or Negotiable"
          value={form.price}
          onChange={(e) => update("price", e.target.value)}
        />
      </Field>

      <Field label="Description">
        <textarea
          style={{ ...styles.input, height: 90, resize: "none" }}
          placeholder="A few details that help people trust the listing..."
          value={form.desc}
          onChange={(e) => update("desc", e.target.value)}
        />
      </Field>

      <button
        style={{ ...styles.submitButton, opacity: valid ? 1 : 0.5 }}
        disabled={!valid}
        onClick={handleSubmit}
      >
        Post listing
      </button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={styles.field}>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function MyListings({ listings, onOpen, onRemove }) {
  return (
    <div style={styles.screen}>
      <Header title="My listings" subtitle="Things you've posted on Pakana." />
      <div style={styles.listingList}>
        {listings.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>You haven't posted anything yet.</p>
            <p style={styles.emptyBody}>Tap Post below to list your first item or service.</p>
          </div>
        )}
        {listings.map((l) => (
          <div key={l.id} style={styles.myListingCard}>
            <button style={styles.myListingMain} onClick={() => onOpen(l)}>
              <div style={styles.listingThumb}>{CATEGORIES.find((c) => c.id === l.category)?.glyph}</div>
              <div style={styles.listingInfo}>
                <div style={styles.listingTitle}>{l.title}</div>
                <div style={styles.listingPrice}>{l.price}</div>
              </div>
            </button>
            <button style={styles.removeButton} onClick={() => onRemove(l.id)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BottomNav({ screen, setScreen }) {
  const items = [
    { id: "browse", label: "Browse", icon: Search },
    { id: "post", label: "Post", icon: Plus },
    { id: "mine", label: "My listings", icon: MapPin },
  ];
  return (
    <div style={styles.bottomNav}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = screen === item.id;
        return (
          <button
            key={item.id}
            style={styles.navItem}
            onClick={() => setScreen(item.id)}
          >
            <div style={{ ...styles.navIconWrap, ...(active ? styles.navIconWrapActive : {}) }}>
              <Icon size={18} color={active ? "#FAF4EA" : "#9A8C7A"} strokeWidth={2.2} />
            </div>
            <span style={{ ...styles.navLabel, color: active ? "#C2542D" : "#9A8C7A" }}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------- Styles (token system from design plan) ----------------
const COLORS = {
  bg: "#FAF4EA",
  ink: "#2B2420",
  inkSoft: "#6B5D4F",
  rust: "#C2542D",
  rustDark: "#A8431F",
  ochre: "#E8A33D",
  sage: "#6B7A52",
  cardBg: "#FFFFFF",
  border: "#EBE0D1",
  placeholder: "#9A8C7A",
};

const styles = {
  appShell: {
    minHeight: "100vh",
    background: "#E8DFD0",
    display: "flex",
    justifyContent: "center",
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  phoneFrame: {
    width: "100%",
    maxWidth: 420,
    minHeight: "100vh",
    background: COLORS.bg,
    display: "flex",
    flexDirection: "column",
    position: "relative",
    boxShadow: "0 0 40px rgba(0,0,0,0.08)",
  },
  statusBar: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 20px 4px",
    fontSize: 12,
    fontWeight: 600,
    color: COLORS.ink,
  },
  content: { flex: 1, overflowY: "auto", paddingBottom: 8 },
  screen: { padding: "8px 20px 24px" },

  header: { marginBottom: 18, marginTop: 4 },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    color: COLORS.ochre,
    marginBottom: 2,
  },
  headerTitle: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: 32,
    fontWeight: 400,
    color: COLORS.ink,
    margin: "0 0 4px",
    letterSpacing: "-0.01em",
  },
  headerSubtitle: { fontSize: 14, color: COLORS.inkSoft, margin: 0, lineHeight: 1.4 },

  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: COLORS.cardBg,
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: 14,
    padding: "12px 14px",
    marginBottom: 14,
  },
  searchInput: {
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 15,
    color: COLORS.ink,
    flex: 1,
    fontFamily: "inherit",
  },

  areaScroll: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 4,
    marginBottom: 16,
    scrollbarWidth: "none",
  },
  areaChip: {
    flexShrink: 0,
    border: `1.5px solid ${COLORS.border}`,
    background: COLORS.cardBg,
    borderRadius: 20,
    padding: "7px 14px",
    fontSize: 12.5,
    fontWeight: 600,
    color: COLORS.inkSoft,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  areaChipActive: {
    background: COLORS.ink,
    borderColor: COLORS.ink,
    color: COLORS.bg,
  },

  categoryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
    marginBottom: 20,
  },
  categoryTile: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "14px 4px",
    borderRadius: 16,
    border: `1.5px solid ${COLORS.border}`,
    background: COLORS.cardBg,
    cursor: "pointer",
  },
  categoryTileActive: {
    background: "#FBEEE0",
    borderColor: COLORS.ochre,
  },
  categoryGlyph: { fontSize: 22 },
  categoryLabel: { fontSize: 10.5, fontWeight: 600, color: COLORS.inkSoft, textAlign: "center", lineHeight: 1.2 },

  listingsHeader: { marginBottom: 10 },
  listingsCount: { fontSize: 12.5, fontWeight: 700, color: COLORS.placeholder, letterSpacing: "0.04em", textTransform: "uppercase" },

  listingList: { display: "flex", flexDirection: "column", gap: 10 },
  listingCard: {
    display: "flex",
    gap: 12,
    background: COLORS.cardBg,
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: 12,
    textAlign: "left",
    cursor: "pointer",
    width: "100%",
  },
  listingThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    background: "#FBEEE0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    flexShrink: 0,
  },
  listingInfo: { flex: 1, minWidth: 0 },
  listingTitle: { fontSize: 14.5, fontWeight: 700, color: COLORS.ink, marginBottom: 4, lineHeight: 1.3 },
  listingMeta: { marginBottom: 6 },
  listingPrice: { fontSize: 13.5, fontWeight: 700, color: COLORS.rust },
  listingFooter: { display: "flex", justifyContent: "space-between", fontSize: 11.5, color: COLORS.placeholder },
  listingArea: { display: "flex", alignItems: "center" },
  listingTime: {},

  emptyState: { textAlign: "center", padding: "40px 20px" },
  emptyTitle: { fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 6 },
  emptyBody: { fontSize: 13, color: COLORS.inkSoft, lineHeight: 1.5 },

  backButton: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    background: "none",
    border: "none",
    color: COLORS.inkSoft,
    fontSize: 14,
    fontWeight: 600,
    padding: "8px 0",
    cursor: "pointer",
  },
  detailHero: {
    height: 180,
    background: "linear-gradient(135deg, #FBEEE0, #F3DCC0)",
    borderRadius: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  detailBody: {},
  detailCategory: { fontSize: 11.5, fontWeight: 700, color: COLORS.ochre, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 },
  detailTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 24, fontWeight: 400, color: COLORS.ink, margin: "0 0 8px", lineHeight: 1.25 },
  detailPrice: { fontSize: 19, fontWeight: 800, color: COLORS.rust, marginBottom: 12 },
  detailMetaRow: { display: "flex", gap: 16, fontSize: 13, color: COLORS.inkSoft, marginBottom: 14 },
  detailMetaItem: { display: "flex", alignItems: "center" },
  divider: { height: 1, background: COLORS.border, margin: "14px 0" },
  detailDesc: { fontSize: 14.5, color: COLORS.ink, lineHeight: 1.6, marginBottom: 16 },
  verifiedRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 90 },
  verifiedText: { fontSize: 12.5, fontWeight: 600, color: COLORS.sage },

  detailActions: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    maxWidth: 420,
    margin: "0 auto",
    display: "flex",
    gap: 10,
    padding: "14px 20px 22px",
    background: `linear-gradient(to top, ${COLORS.bg} 70%, transparent)`,
  },
  waButton: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "#3DA853",
    color: "#fff",
    fontWeight: 700,
    fontSize: 15,
    borderRadius: 14,
    padding: "14px 0",
    textDecoration: "none",
  },
  callButton: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: COLORS.ink,
    color: COLORS.bg,
    fontWeight: 700,
    fontSize: 15,
    borderRadius: 14,
    padding: "14px 0",
    textDecoration: "none",
  },

  postHeaderRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, marginTop: 4 },
  postHeaderTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 21, fontWeight: 400, color: COLORS.ink, margin: 0 },
  iconButton: { background: COLORS.cardBg, border: `1.5px solid ${COLORS.border}`, borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.ink },

  photoUpload: {
    height: 110,
    border: `2px dashed ${COLORS.border}`,
    borderRadius: 16,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 18,
    cursor: "pointer",
  },
  photoUploadText: { fontSize: 12.5, fontWeight: 600, color: COLORS.placeholder },

  field: { marginBottom: 16 },
  fieldLabel: { display: "block", fontSize: 12.5, fontWeight: 700, color: COLORS.inkSoft, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.04em" },
  input: {
    width: "100%",
    border: `1.5px solid ${COLORS.border}`,
    background: COLORS.cardBg,
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14.5,
    color: COLORS.ink,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  formChip: {
    border: `1.5px solid ${COLORS.border}`,
    background: COLORS.cardBg,
    borderRadius: 20,
    padding: "8px 13px",
    fontSize: 12.5,
    fontWeight: 600,
    color: COLORS.inkSoft,
    cursor: "pointer",
  },
  formChipActive: { background: "#FBEEE0", borderColor: COLORS.ochre, color: COLORS.ink },

  submitButton: {
    width: "100%",
    background: COLORS.rust,
    color: "#fff",
    fontWeight: 700,
    fontSize: 15.5,
    border: "none",
    borderRadius: 14,
    padding: "15px 0",
    marginTop: 6,
    cursor: "pointer",
  },

  myListingCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: COLORS.cardBg,
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: 12,
  },
  myListingMain: { display: "flex", gap: 12, flex: 1, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 },
  removeButton: { fontSize: 12, fontWeight: 700, color: COLORS.rustDark, background: "none", border: "none", cursor: "pointer", flexShrink: 0 },

  bottomNav: {
    display: "flex",
    borderTop: `1.5px solid ${COLORS.border}`,
    background: COLORS.bg,
    padding: "8px 12px 14px",
  },
  navItem: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "4px 0" },
  navIconWrap: { width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" },
  navIconWrapActive: { background: COLORS.rust },
  navLabel: { fontSize: 11, fontWeight: 700 },

  toast: {
    position: "absolute",
    bottom: 90,
    left: "50%",
    transform: "translateX(-50%)",
    background: COLORS.ink,
    color: COLORS.bg,
    padding: "12px 18px",
    borderRadius: 12,
    fontSize: 12.5,
    fontWeight: 600,
    whiteSpace: "normal",
    width: "85%",
    maxWidth: 340,
    textAlign: "center",
    lineHeight: 1.4,
    zIndex: 50,
  },
};
