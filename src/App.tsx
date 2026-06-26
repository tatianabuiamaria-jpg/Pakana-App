import React, { useState, useEffect } from "react";
import { Search, Plus, MapPin, Phone, MessageCircle, ChevronLeft, Camera, X, Loader2, Heart, ArrowUpDown, Bookmark } from "lucide-react";

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
  async updateById(table, id, fields) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...SUPABASE_HEADERS, Prefer: "return=representation" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Update failed (${res.status}): ${body}`);
    }
    return res.json();
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
  "All areas",
  "Windhoek Central", "Klein Windhoek", "Khomasdal", "Katutura",
  "Olympia", "Eros", "Pioneerspark", "Wanaheda", "Hochland Park",
  "Windhoek West", "Kleine Kuppe", "Suiderhof", "Cimbebasia",
  "Ludwigsdorf", "Avis", "Hakahana", "Havana", "Okuryangava",
  "Otjomuise", "Goreangab", "Khomasdal North",
];

// Converts whatever format someone types — "081 407 9382", "+264 81 407 9382",
// "264814079382", "0814079382" — into a clean "264..." number with no leading
// zero and no plus sign, which is the correct base for both tel: and wa.me
// links. Namibian local numbers start with a 0 that must be dropped before
// adding the 264 country code; this is the bug that caused "+0814..." links.
function normalizeNamibianPhone(raw) {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("264")) {
    // Already has the country code — leave as is
    return digits;
  }
  if (digits.startsWith("0")) {
    // Local format (e.g. 0814079382) — drop the leading 0, add 264
    return "264" + digits.slice(1);
  }
  // No recognizable prefix — assume it's missing the country code entirely
  return "264" + digits;
}

// Note: with a real backend, you seed listings by inserting rows directly in
// Supabase's Table Editor (or by posting them through the app itself) —
// see the "seeding your first listings" section in the setup guide below.

function timeAgoSort(a, b) {
  return 0;
}


export default function App() {
  const [screen, setScreen] = useState("browse"); // browse | detail | post | mine | saved
  const [activeListing, setActiveListing] = useState(null);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("All areas");
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [sortMode, setSortMode] = useState("newest"); // newest | area
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myPhone, setMyPhone] = useState(() => {
    try {
      return localStorage.getItem("pakana_phone") || "";
    } catch (e) {
      return "";
    }
  });
  const [savedIds, setSavedIds] = useState(() => {
    try {
      const raw = localStorage.getItem("pakana_saved");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });
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
      showToast("Couldn't load listings — check your connection");
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

  function toggleSaved(id) {
    setSavedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem("pakana_saved", JSON.stringify(next));
      } catch (e) {
        // localStorage may be blocked (private mode) — saving just won't persist
      }
      return next;
    });
  }

  async function markSold(id, sold) {
    try {
      await supabaseRest.updateById("listings", id, { status: sold ? "sold" : "active" });
    } catch (err) {
      console.error("Error updating status:", err);
      showToast("Couldn't update — try again");
      return;
    }
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, status: sold ? "sold" : "active" } : l)));
    showToast(sold ? "Marked as sold" : "Marked as available");
  }

  async function confirmStillAvailable(id) {
    const now = new Date().toISOString();
    try {
      await supabaseRest.updateById("listings", id, { updated_at: now });
    } catch (err) {
      console.error("Error confirming listing:", err);
      showToast("Couldn't refresh — try again");
      return;
    }
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, updated_at: now } : l)));
    showToast("Listing refreshed");
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  }

  const filtered = listings
    .filter((l) => {
      const matchesSearch =
        !search ||
        l.title.toLowerCase().includes(search.toLowerCase()) ||
        (l.description || "").toLowerCase().includes(search.toLowerCase());
      const matchesArea = areaFilter === "All areas" || l.area === areaFilter;
      const matchesCat = !categoryFilter || l.category === categoryFilter;
      return matchesSearch && matchesArea && matchesCat;
    })
    .sort((a, b) => {
      if (sortMode === "area") {
        // Group by area alphabetically, newest first within each area
        return a.area.localeCompare(b.area) || new Date(b.created_at) - new Date(a.created_at);
      }
      // "newest" — already newest-first from the query, but re-sort defensively
      // in case of any client-side updates (e.g. after confirming availability)
      return new Date(b.created_at) - new Date(a.created_at);
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
          phone: newListing.phone,
          photo_url: newListing.photo_url || null,
          photo_urls: newListing.photo_urls || [],
        },
      ]);
    } catch (err) {
      console.error("Error posting listing:", err);
      showToast("Couldn't post — try again");
      return;
    }

    // Remember this number on this device so "My listings" can find it again,
    // and so the field is pre-filled next time they post.
    setMyPhone(newListing.phone);
    try {
      localStorage.setItem("pakana_phone", newListing.phone);
    } catch (e) {
      // Some browsers block localStorage (e.g. private mode) — not critical,
      // posting still succeeds either way.
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
              sortMode={sortMode}
              setSortMode={setSortMode}
              savedIds={savedIds}
              onToggleSaved={toggleSaved}
              onOpen={openListing}
            />
          )}
          {screen === "detail" && (
            <Detail
              listing={activeListing}
              onBack={() => setScreen("browse")}
              saved={activeListing ? savedIds.includes(activeListing.id) : false}
              onToggleSaved={toggleSaved}
            />
          )}
          {screen === "post" && (
            <PostForm onCancel={() => setScreen("browse")} onSubmit={addListing} defaultPhone={myPhone} />
          )}
          {screen === "mine" && (
            <MyListings
              listings={listings.filter((l) => l.phone === myPhone)}
              onOpen={openListing}
              onRemove={removeListing}
              onMarkSold={markSold}
              onConfirmAvailable={confirmStillAvailable}
            />
          )}
          {screen === "saved" && (
            <SavedListings
              listings={listings.filter((l) => savedIds.includes(l.id))}
              onOpen={openListing}
              onToggleSaved={toggleSaved}
            />
          )}
        </div>
        {screen !== "detail" && screen !== "post" && <BottomNav screen={screen} setScreen={setScreen} />}
        {toast && <div style={styles.toast}>{toast}</div>}
      </div>
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

function Browse({ listings, loading, search, setSearch, areaFilter, setAreaFilter, categoryFilter, setCategoryFilter, sortMode, setSortMode, savedIds, onToggleSaved, onOpen }) {
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
        {CATEGORIES.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(categoryFilter === c.id ? null : c.id)}
            style={{
              ...styles.categoryTile,
              borderBottomColor: categoryFilter === c.id ? COLORS.rust : BAND_COLORS[i % BAND_COLORS.length],
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
        <button
          style={styles.sortToggle}
          onClick={() => setSortMode(sortMode === "newest" ? "area" : "newest")}
        >
          <ArrowUpDown size={12} strokeWidth={2.5} />
          {sortMode === "newest" ? "Newest first" : "By area"}
        </button>
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
        {!loading && listings.map((l) => {
          const isSold = l.status === "sold";
          const isSaved = savedIds.includes(l.id);
          return (
            <div key={l.id} style={{ ...styles.listingCard, ...(isSold ? styles.listingCardSold : {}) }}>
              <button style={styles.listingCardMain} onClick={() => onOpen(l)}>
                <div style={styles.listingThumb}>
                  {l.photo_url ? (
                    <img src={l.photo_url} alt={l.title} style={{ ...styles.listingThumbImg, ...(isSold ? styles.soldImg : {}) }} />
                  ) : (
                    CATEGORIES.find((c) => c.id === l.category)?.glyph
                  )}
                  {isSold && <span style={styles.soldBadge}>Sold</span>}
                </div>
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
              <button
                style={styles.saveBtn}
                onClick={(e) => { e.stopPropagation(); onToggleSaved(l.id); }}
                aria-label={isSaved ? "Unsave" : "Save"}
              >
                <Heart size={17} color={isSaved ? COLORS.sage : "#B8B6AE"} fill={isSaved ? COLORS.sage : "none"} strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Detail({ listing, onBack, saved, onToggleSaved }) {
  if (!listing) return null;
  const normalizedPhone = normalizeNamibianPhone(listing.phone);
  const waMessage = encodeURIComponent(`Hi, I saw your listing "${listing.title}" on Pakana — is it still available?`);
  const waLink = `https://wa.me/${normalizedPhone}?text=${waMessage}`;

  const photos = (listing.photo_urls && listing.photo_urls.length > 0)
    ? listing.photo_urls
    : (listing.photo_url ? [listing.photo_url] : []);
  const [activePhoto, setActivePhoto] = useState(0);

  return (
    <div style={styles.screen}>
      <div style={styles.detailTopRow}>
        <button style={styles.backButton} onClick={onBack}>
          <ChevronLeft size={20} /> Back
        </button>
        <button style={styles.detailSaveBtn} onClick={() => onToggleSaved(listing.id)} aria-label={saved ? "Unsave" : "Save"}>
          <Heart size={18} color={saved ? COLORS.sage : COLORS.inkSoft} fill={saved ? COLORS.sage : "none"} strokeWidth={2} />
        </button>
      </div>

      <div style={styles.detailHero}>
        {photos.length > 0 ? (
          <img src={photos[activePhoto]} alt={listing.title} style={styles.detailHeroImg} />
        ) : (
          <span style={{ fontSize: 64 }}>{CATEGORIES.find((c) => c.id === listing.category)?.glyph}</span>
        )}
      </div>

      {photos.length > 1 && (
        <div style={styles.thumbStripRow}>
          {photos.map((url, i) => (
            <button
              key={i}
              style={{
                ...styles.thumbStripItem,
                ...(i === activePhoto ? styles.thumbStripItemActive : {}),
              }}
              onClick={() => setActivePhoto(i)}
            >
              <img src={url} alt={`Photo ${i + 1}`} style={styles.thumbStripImg} />
            </button>
          ))}
        </div>
      )}

      <div style={styles.detailBody}>
        {listing.status === "sold" && (
          <div style={styles.soldBanner}>This listing has been marked sold by the seller.</div>
        )}
        <div style={styles.detailCategory}>{CATEGORIES.find((c) => c.id === listing.category)?.label}</div>
        <h2 style={styles.detailTitle}>{listing.title}</h2>
        <div style={styles.detailPrice}>{listing.price}</div>

        <div style={styles.detailMetaRow}>
          <span style={styles.detailMetaItem}><MapPin size={14} style={{ marginRight: 4 }} />{listing.area}</span>
          <span style={styles.detailMetaItem}>{listing.posted}</span>
        </div>

        <div style={styles.divider} />

        <p style={{ ...styles.detailDesc, marginBottom: 90 }}>{listing.description || listing.desc}</p>
      </div>

      <div style={styles.detailActions}>
        <a href={waLink} target="_blank" rel="noreferrer" style={styles.waButton}>
          <MessageCircle size={18} /> WhatsApp
        </a>
        <a href={`tel:+${normalizedPhone}`} style={styles.callButton}>
          <Phone size={18} /> Call
        </a>
      </div>
    </div>
  );
}

function PostForm({ onCancel, onSubmit, defaultPhone }) {
  const [form, setForm] = useState({
    title: "", category: "home", area: AREAS[1], areaIsOther: false, price: "", desc: "",
    phone: defaultPhone || "",
  });
  const [photoFiles, setPhotoFiles] = useState([]); // array of { file, preview }
  const [uploading, setUploading] = useState(false);
  const MAX_PHOTOS = 5;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handlePhotoSelect(e) {
    const newFiles = Array.from(e.target.files || []);
    if (newFiles.length === 0) return;

    setPhotoFiles((prev) => {
      const combined = [...prev, ...newFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }))];
      if (combined.length > MAX_PHOTOS) {
        alert(`You can add up to ${MAX_PHOTOS} photos — only the first ${MAX_PHOTOS} were kept.`);
      }
      return combined.slice(0, MAX_PHOTOS);
    });

    // Allow re-selecting the same file again later (e.g. after removing it)
    e.target.value = "";
  }

  function removePhoto(index) {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadPhoto(file) {
    // Give every photo a unique-ish name so uploads never collide
    const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
    const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    const bucket = encodeURIComponent("Listings Photos");

    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": file.type,
      },
      body: file,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Photo upload failed (${res.status}): ${body}`);
    }

    // Public URL pattern for a public bucket
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  }

  async function handleSubmit() {
    const normalizedPhone = normalizeNamibianPhone(form.phone);
    const localDigitCount = form.phone.replace(/\D/g, "").replace(/^264/, "").replace(/^0/, "").length;
    if (!form.title.trim() || !form.price.trim() || !form.area.trim() || localDigitCount < 7) {
      return;
    }

    let photo_urls = [];
    if (photoFiles.length > 0) {
      setUploading(true);
      try {
        // Upload one at a time — simpler to reason about and easier to
        // debug than firing them all in parallel, and 5 photos is small
        // enough that the slight time cost doesn't matter.
        for (const { file } of photoFiles) {
          const url = await uploadPhoto(file);
          photo_urls.push(url);
        }
      } catch (err) {
        console.error("Photo upload error:", err);
        setUploading(false);
        alert("Couldn't upload one of the photos — try again, or post with fewer.");
        return;
      }
      setUploading(false);
    }

    onSubmit({ ...form, phone: normalizedPhone, photo_url: photo_urls[0] || null, photo_urls });
  }

  const localDigitCount = form.phone.replace(/\D/g, "").replace(/^264/, "").replace(/^0/, "").length;
  const valid = form.title.trim() && form.price.trim() && form.area.trim() && localDigitCount >= 7;

  return (
    <div style={styles.screen}>
      <div style={styles.postHeaderRow}>
        <button style={styles.iconButton} onClick={onCancel}><X size={20} /></button>
        <h2 style={styles.postHeaderTitle}>New listing</h2>
        <div style={{ width: 36 }} />
      </div>

      <p style={styles.photoStepLabel}>Start with a photo — listings with photos get noticed first</p>
      <div style={styles.photoGridRow}>
        {photoFiles.map((p, i) => (
          <div key={i} style={styles.photoGridItem}>
            <img src={p.preview} alt={`Photo ${i + 1}`} style={styles.photoGridImg} />
            <button
              type="button"
              style={styles.photoRemoveBtn}
              onClick={() => removePhoto(i)}
              aria-label="Remove photo"
            >
              <X size={13} color="#fff" strokeWidth={3} />
            </button>
            {i === 0 && <span style={styles.photoCoverBadge}>Cover</span>}
          </div>
        ))}

        {photoFiles.length < MAX_PHOTOS && (
          <label style={styles.photoAddTile}>
            <Camera size={22} color="#9A8C7A" />
            <span style={styles.photoUploadText}>
              {photoFiles.length === 0 ? "Add photos" : "Add more"}
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              style={styles.hiddenFileInput}
              onChange={handlePhotoSelect}
            />
          </label>
        )}
      </div>
      {photoFiles.length > 0 && (
        <p style={styles.photoHint}>
          {photoFiles.length}/{MAX_PHOTOS} photos · first one is the cover photo
        </p>
      )}

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
        <select
          style={styles.input}
          value={form.areaIsOther ? "__other__" : form.area}
          onChange={(e) => {
            if (e.target.value === "__other__") {
              setForm((f) => ({ ...f, areaIsOther: true, area: "" }));
            } else {
              setForm((f) => ({ ...f, areaIsOther: false, area: e.target.value }));
            }
          }}
        >
          {AREAS.slice(1).map((a) => <option key={a} value={a}>{a}</option>)}
          <option value="__other__">Other (type your own)</option>
        </select>
        {form.areaIsOther && (
          <input
            style={{ ...styles.input, marginTop: 8 }}
            placeholder="Type your area or neighborhood"
            value={form.area}
            onChange={(e) => update("area", e.target.value)}
            autoFocus
          />
        )}
      </Field>

      <Field label="Price">
        <input
          style={styles.input}
          placeholder="e.g. N$250 or Negotiable"
          value={form.price}
          onChange={(e) => update("price", e.target.value)}
        />
      </Field>

      <Field label="Your phone number">
        <input
          style={styles.input}
          type="tel"
          placeholder="e.g. 081 234 5678"
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
        />
        <p style={styles.fieldHint}>
          This is how buyers will contact you — shown as a WhatsApp and call button.
        </p>
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
        style={{ ...styles.submitButton, opacity: valid && !uploading ? 1 : 0.5 }}
        disabled={!valid || uploading}
        onClick={handleSubmit}
      >
        {uploading ? "Posting..." : "Post listing"}
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

function MyListings({ listings, onOpen, onRemove, onMarkSold, onConfirmAvailable }) {
  function daysSince(isoDate) {
    return Math.floor((Date.now() - new Date(isoDate)) / (1000 * 60 * 60 * 24));
  }

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
        {listings.map((l) => {
          const isSold = l.status === "sold";
          const lastConfirmed = l.updated_at || l.created_at;
          const stale = !isSold && lastConfirmed && daysSince(lastConfirmed) >= 7;
          return (
            <div key={l.id} style={styles.myListingCardWrap}>
              <div style={styles.myListingCard}>
                <button style={styles.myListingMain} onClick={() => onOpen(l)}>
                  <div style={styles.listingThumb}>
                    {l.photo_url ? (
                      <img src={l.photo_url} alt={l.title} style={{ ...styles.listingThumbImg, ...(isSold ? styles.soldImg : {}) }} />
                    ) : (
                      CATEGORIES.find((c) => c.id === l.category)?.glyph
                    )}
                  </div>
                  <div style={styles.listingInfo}>
                    <div style={styles.listingTitle}>{l.title}</div>
                    <div style={styles.listingPrice}>{l.price}</div>
                    {isSold && <span style={styles.soldTag}>Sold</span>}
                  </div>
                </button>
                <button style={styles.removeButton} onClick={() => onRemove(l.id)}>Remove</button>
              </div>

              <div style={styles.myListingActions}>
                <button
                  style={styles.myListingActionBtn}
                  onClick={() => onMarkSold(l.id, !isSold)}
                >
                  {isSold ? "Mark as available" : "Mark as sold"}
                </button>
                {stale && (
                  <button
                    style={{ ...styles.myListingActionBtn, ...styles.myListingActionBtnHighlight }}
                    onClick={() => onConfirmAvailable(l.id)}
                  >
                    Still available? Tap to refresh
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SavedListings({ listings, onOpen, onToggleSaved }) {
  return (
    <div style={styles.screen}>
      <Header title="Saved" subtitle="Listings you've bookmarked to come back to." />
      <div style={styles.listingList}>
        {listings.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Nothing saved yet.</p>
            <p style={styles.emptyBody}>Tap the heart on any listing to save it here.</p>
          </div>
        )}
        {listings.map((l) => {
          const isSold = l.status === "sold";
          return (
            <div key={l.id} style={styles.listingCard}>
              <button style={styles.listingCardMain} onClick={() => onOpen(l)}>
                <div style={styles.listingThumb}>
                  {l.photo_url ? (
                    <img src={l.photo_url} alt={l.title} style={{ ...styles.listingThumbImg, ...(isSold ? styles.soldImg : {}) }} />
                  ) : (
                    CATEGORIES.find((c) => c.id === l.category)?.glyph
                  )}
                  {isSold && <span style={styles.soldBadge}>Sold</span>}
                </div>
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
              <button style={styles.saveBtn} onClick={(e) => { e.stopPropagation(); onToggleSaved(l.id); }} aria-label="Unsave">
                <Heart size={17} color={COLORS.sage} fill={COLORS.sage} strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BottomNav({ screen, setScreen }) {
  const items = [
    { id: "browse", label: "Browse", icon: Search },
    { id: "saved", label: "Saved", icon: Bookmark },
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
              <Icon size={18} color={active ? COLORS.bg : COLORS.placeholder} strokeWidth={2.2} />
            </div>
            <span style={{ ...styles.navLabel, color: active ? COLORS.rust : COLORS.placeholder }}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------- Styles (token system from design plan) ----------------
const COLORS = {
  bg: "#F7F6F3",        // cooler off-white, not cream
  ink: "#1B1F2E",       // deep indigo-charcoal (was soft brown-black)
  inkSoft: "#52566B",   // cooler muted slate (was warm brown)
  rust: "#2C4A8C",       // primary action color: confident cobalt (was terracotta)
  rustDark: "#1F3766",   // pressed/active state for cobalt
  ochre: "#C99A3E",      // sparing highlight gold (was all-purpose ochre)
  sage: "#B8472E",       // brick-red, used for secondary accents
  cardBg: "#FFFFFF",
  border: "#E2E1DC",
  placeholder: "#8B8A85",
  tint: "#E8EDF6",       // soft cobalt-tinted background for thumbs/active states
};

// Rotating accent bands for category tiles — a structural nod to
// basket-weave banding, used sparingly as a signature detail.
const BAND_COLORS = ["#2C4A8C", "#B8472E", "#C99A3E", "#2C4A8C", "#B8472E", "#C99A3E"];

const styles = {
  appShell: {
    minHeight: "100vh",
    background: "#E5E4DF",
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
  content: { flex: 1, overflowY: "auto", paddingBottom: 8, paddingTop: 8 },
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
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 32,
    fontWeight: 700,
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
    padding: "14px 4px 11px",
    borderRadius: 14,
    border: `1.5px solid ${COLORS.border}`,
    borderBottom: `3px solid ${COLORS.border}`,
    background: COLORS.cardBg,
    cursor: "pointer",
  },
  categoryTileActive: {
    background: COLORS.tint,
  },
  categoryGlyph: { fontSize: 22 },
  categoryLabel: { fontSize: 10.5, fontWeight: 600, color: COLORS.inkSoft, textAlign: "center", lineHeight: 1.2 },

  listingsHeader: { marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" },
  listingsCount: { fontSize: 12.5, fontWeight: 700, color: COLORS.placeholder, letterSpacing: "0.04em", textTransform: "uppercase" },
  sortToggle: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.inkSoft,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px 2px",
  },

  listingList: { display: "flex", flexDirection: "column", gap: 10 },
  listingCard: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: COLORS.cardBg,
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: 12,
    width: "100%",
    boxSizing: "border-box",
  },
  listingCardSold: {
    opacity: 0.75,
  },
  listingCardMain: {
    display: "flex",
    gap: 12,
    flex: 1,
    minWidth: 0,
    background: "none",
    border: "none",
    padding: 0,
    textAlign: "left",
    cursor: "pointer",
  },
  saveBtn: {
    flexShrink: 0,
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    cursor: "pointer",
  },
  listingThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    background: COLORS.tint,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    flexShrink: 0,
    overflow: "hidden",
    position: "relative",
  },
  listingThumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  soldImg: {
    filter: "grayscale(60%)",
  },
  soldBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    background: "rgba(27,31,46,0.78)",
    color: COLORS.bg,
    fontSize: 9,
    fontWeight: 700,
    textAlign: "center",
    padding: "2px 0",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
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
  detailTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailSaveBtn: {
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: COLORS.cardBg,
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: 10,
    cursor: "pointer",
  },
  detailHero: {
    height: 180,
    background: "linear-gradient(135deg, #E8EDF6, #D8E0EF)",
    borderRadius: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    overflow: "hidden",
  },
  detailHeroImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  thumbStripRow: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 4,
    marginBottom: 16,
  },
  thumbStripItem: {
    flexShrink: 0,
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: "hidden",
    border: `2px solid transparent`,
    padding: 0,
    background: "none",
    cursor: "pointer",
    opacity: 0.6,
  },
  thumbStripItemActive: {
    border: `2px solid ${COLORS.rust}`,
    opacity: 1,
  },
  thumbStripImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  detailBody: {},
  soldBanner: {
    background: "#F4ECE4",
    color: COLORS.sage,
    fontSize: 12.5,
    fontWeight: 700,
    padding: "10px 12px",
    borderRadius: 10,
    marginBottom: 12,
  },
  detailCategory: { fontSize: 11.5, fontWeight: 700, color: COLORS.ochre, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 },
  detailTitle: { fontFamily: "'Fraunces', Georgia, serif", fontSize: 24, fontWeight: 700, color: COLORS.ink, margin: "0 0 8px", lineHeight: 1.25 },
  detailPrice: { fontSize: 19, fontWeight: 800, color: COLORS.rust, marginBottom: 12 },
  detailMetaRow: { display: "flex", gap: 16, fontSize: 13, color: COLORS.inkSoft, marginBottom: 14 },
  detailMetaItem: { display: "flex", alignItems: "center" },
  divider: { height: 1, background: COLORS.border, margin: "14px 0" },
  detailDesc: { fontSize: 14.5, color: COLORS.ink, lineHeight: 1.6, marginBottom: 16 },

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
  postHeaderTitle: { fontFamily: "'Fraunces', Georgia, serif", fontSize: 21, fontWeight: 700, color: COLORS.ink, margin: 0 },
  iconButton: { background: COLORS.cardBg, border: `1.5px solid ${COLORS.border}`, borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.ink },

  photoStepLabel: {
    fontSize: 12.5,
    fontWeight: 600,
    color: COLORS.inkSoft,
    marginBottom: 10,
  },
  photoGridRow: {
    display: "flex",
    gap: 10,
    overflowX: "auto",
    paddingBottom: 4,
    marginBottom: 8,
  },
  photoGridItem: {
    position: "relative",
    flexShrink: 0,
    width: 92,
    height: 92,
    borderRadius: 14,
    overflow: "hidden",
    border: `1.5px solid ${COLORS.border}`,
  },
  photoGridImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  photoRemoveBtn: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "rgba(43,36,32,0.75)",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  },
  photoCoverBadge: {
    position: "absolute",
    bottom: 5,
    left: 5,
    background: "rgba(43,36,32,0.75)",
    color: COLORS.bg,
    fontSize: 9.5,
    fontWeight: 700,
    padding: "3px 7px",
    borderRadius: 6,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  photoAddTile: {
    flexShrink: 0,
    width: 92,
    height: 92,
    borderRadius: 14,
    border: `2px dashed ${COLORS.border}`,
    background: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    cursor: "pointer",
    textAlign: "center",
    padding: "4px 6px",
  },
  photoUploadText: { fontSize: 10.5, fontWeight: 600, color: COLORS.placeholder, lineHeight: 1.2 },
  photoHint: {
    fontSize: 11.5,
    color: COLORS.placeholder,
    marginTop: -2,
    marginBottom: 16,
  },
  hiddenFileInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
    pointerEvents: "none",
  },

  field: { marginBottom: 16 },
  fieldLabel: { display: "block", fontSize: 12.5, fontWeight: 700, color: COLORS.inkSoft, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.04em" },
  fieldHint: { fontSize: 11.5, color: COLORS.placeholder, marginTop: 6, lineHeight: 1.4 },
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
  formChipActive: { background: COLORS.tint, borderColor: COLORS.rust, color: COLORS.ink },

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

  myListingCardWrap: {
    background: COLORS.cardBg,
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: 16,
    overflow: "hidden",
  },
  myListingCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 12,
  },
  myListingMain: { display: "flex", gap: 12, flex: 1, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 },
  removeButton: { fontSize: 12, fontWeight: 700, color: COLORS.rustDark, background: "none", border: "none", cursor: "pointer", flexShrink: 0 },
  soldTag: {
    display: "inline-block",
    marginTop: 4,
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.sage,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  myListingActions: {
    display: "flex",
    borderTop: `1px solid ${COLORS.border}`,
  },
  myListingActionBtn: {
    flex: 1,
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.inkSoft,
    background: "none",
    border: "none",
    padding: "10px 8px",
    cursor: "pointer",
    textAlign: "center",
  },
  myListingActionBtnHighlight: {
    color: COLORS.rust,
    borderLeft: `1px solid ${COLORS.border}`,
  },

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
