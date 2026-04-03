import { useState, useEffect, useRef } from "react";

// ---- Types ----

export interface Filament {
  id: number;
  brand: string;
  type: string;
  color_name: string | null;
  color_hex: string | null;
  diameter: number;
  quantity: number;
  image_path: string | null;
  notes: string | null;
}

export interface CalibrationProfile {
  id: number;
  name: string;
  brand: string;
  type: string;
  nozzle_size: number;
  nozzle_material: string;
  printer_model: string | null;
  nozzle_temp: number | null;
  bed_temp: number | null;
  fan_max_speed: number | null;
  fan_min_speed: number | null;
  flow_ratio: number;
  pressure_advance: number | null;
  max_volumetric_speed: number | null;
  bed_type: string | null;
  layer_height: number | null;
  filament_density: number | null;
  print_settings_id: string | null;
  image_path: string | null;
  notes: string | null;
}

// ---- Constants ----

const FILAMENT_TYPES = ["PLA", "PLA+", "SILK", "PETG", "ABS", "ASA", "TPU", "PA", "PC", "PVA", "HIPS"];
const NOZZLE_SIZES = [0.2, 0.4, 0.6, 0.8, 1.0];
const NOZZLE_MATERIALS = ["brass", "hardened_steel", "stainless_steel", "ruby"];
const PRINTER_MODELS = ["P2S", "H2C", "H2D"];

function autoProfileName(brand: string, type: string, nozzleSize: string | number): string {
  return [brand, type, nozzleSize].filter(Boolean).join("_").toUpperCase().replace(/\s+/g, "_");
}

function imgUrl(imagePath: string | null): string | null {
  return imagePath ? `/uploads/${imagePath}` : null;
}

// ---- Filament Form ----

interface FilamentFormData {
  brand: string;
  type: string;
  color_name: string;
  color_hex: string;
  diameter: string;
  quantity: string;
  notes: string;
  image?: File | null;
}

const emptyFilament: FilamentFormData = {
  brand: "", type: "PLA", color_name: "", color_hex: "#ffffff",
  diameter: "1.75", quantity: "1", notes: "",
};

function FilamentForm({ initial, onSave, onCancel }: {
  initial?: Filament | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FilamentFormData>(() =>
    initial
      ? { brand: initial.brand, type: initial.type, color_name: initial.color_name ?? "",
          color_hex: initial.color_hex ?? "#ffffff", diameter: String(initial.diameter),
          quantity: String(initial.quantity), notes: initial.notes ?? "" }
      : emptyFilament
  );
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function set(key: keyof FilamentFormData, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.append("brand", form.brand.trim());
    fd.append("type", form.type);
    fd.append("color_name", form.color_name.trim());
    fd.append("color_hex", form.color_hex);
    fd.append("diameter", form.diameter);
    fd.append("quantity", form.quantity);
    fd.append("notes", form.notes.trim());
    if (fileRef.current?.files?.[0]) fd.append("image", fileRef.current.files[0]);
    const url = initial ? `/api/filaments/${initial.id}` : "/api/filaments";
    const method = initial ? "PUT" : "POST";
    await fetch(url, { method, body: fd });
    setSaving(false);
    onSave();
  }

  return (
    <form className="inv-form" onSubmit={handleSubmit}>
      <div className="inv-form-grid">
        <label className="inv-label">
          Brand
          <input className="inv-input" value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="BAMBU, CREALITY…" required />
        </label>
        <label className="inv-label">
          Type
          <select className="inv-input" value={form.type} onChange={(e) => set("type", e.target.value)}>
            {FILAMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="inv-label">
          Color Name
          <input className="inv-input" value={form.color_name} onChange={(e) => set("color_name", e.target.value)} placeholder="Bambu Green" />
        </label>
        <label className="inv-label">
          Color
          <div className="inv-color-row">
            <input type="color" className="inv-color-pick" value={form.color_hex} onChange={(e) => set("color_hex", e.target.value)} />
            <input className="inv-input" value={form.color_hex} onChange={(e) => set("color_hex", e.target.value)} placeholder="#ffffff" style={{ flex: 1 }} />
          </div>
        </label>
        <label className="inv-label">
          Diameter (mm)
          <input className="inv-input" type="number" step="0.01" value={form.diameter} onChange={(e) => set("diameter", e.target.value)} />
        </label>
        <label className="inv-label">
          Qty (spools)
          <input className="inv-input" type="number" min="0" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
        </label>
        <label className="inv-label" style={{ gridColumn: "1 / -1" }}>
          Photo
          <input ref={fileRef} type="file" className="inv-input" accept="image/*" />
          {initial?.image_path && !fileRef.current?.files?.[0] && (
            <span className="inv-current-img">current: <a href={imgUrl(initial.image_path)!} target="_blank" rel="noreferrer">view</a></span>
          )}
        </label>
        <label className="inv-label" style={{ gridColumn: "1 / -1" }}>
          Notes
          <textarea className="inv-input inv-textarea" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
      </div>
      <div className="inv-form-actions">
        <button type="button" className="inv-btn inv-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="inv-btn inv-btn-primary" disabled={saving}>
          {saving ? "Saving…" : initial ? "Update" : "Add Filament"}
        </button>
      </div>
    </form>
  );
}

// ---- Profile Form ----

interface ProfileFormData {
  name: string;
  brand: string;
  type: string;
  nozzle_size: string;
  nozzle_material: string;
  printer_model: string;
  nozzle_temp: string;
  bed_temp: string;
  fan_max_speed: string;
  fan_min_speed: string;
  flow_ratio: string;
  pressure_advance: string;
  max_volumetric_speed: string;
  bed_type: string;
  layer_height: string;
  filament_density: string;
  print_settings_id: string;
  notes: string;
}

const emptyProfile: ProfileFormData = {
  name: "", brand: "", type: "PLA", nozzle_size: "0.4", nozzle_material: "brass",
  printer_model: "", nozzle_temp: "", bed_temp: "", fan_max_speed: "", fan_min_speed: "",
  flow_ratio: "1.0", pressure_advance: "", max_volumetric_speed: "",
  bed_type: "", layer_height: "", filament_density: "", print_settings_id: "", notes: "",
};

function ProfileForm({ initial, onSave, onCancel }: {
  initial?: CalibrationProfile | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ProfileFormData>(() =>
    initial
      ? { name: initial.name, brand: initial.brand, type: initial.type,
          nozzle_size: String(initial.nozzle_size), nozzle_material: initial.nozzle_material,
          printer_model: initial.printer_model ?? "", nozzle_temp: String(initial.nozzle_temp ?? ""),
          bed_temp: String(initial.bed_temp ?? ""),
          fan_max_speed: String(initial.fan_max_speed ?? ""),
          fan_min_speed: String(initial.fan_min_speed ?? ""),
          flow_ratio: String(initial.flow_ratio), pressure_advance: String(initial.pressure_advance ?? ""),
          max_volumetric_speed: String(initial.max_volumetric_speed ?? ""),
          bed_type: initial.bed_type ?? "", layer_height: String(initial.layer_height ?? ""),
          filament_density: String(initial.filament_density ?? ""),
          print_settings_id: initial.print_settings_id ?? "",
          notes: initial.notes ?? "" }
      : emptyProfile
  );
  const [autoName, setAutoName] = useState(!initial);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tmfRef = useRef<HTMLInputElement>(null);

  async function handleImport3mf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-3mf", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setForm((f) => {
        const next = { ...f };
        if (data.brand) next.brand = data.brand;
        if (data.type && FILAMENT_TYPES.includes(data.type)) next.type = data.type;
        if (data.nozzle_size) next.nozzle_size = String(data.nozzle_size);
        if (data.nozzle_material && NOZZLE_MATERIALS.includes(data.nozzle_material)) next.nozzle_material = data.nozzle_material;
        if (data.profile_name) { next.name = data.profile_name; setAutoName(false); }
        if (data.nozzle_temp) next.nozzle_temp = String(Math.round(data.nozzle_temp));
        if (data.bed_temp) next.bed_temp = String(Math.round(data.bed_temp));
        if (data.fan_max_speed != null) next.fan_max_speed = String(data.fan_max_speed);
        if (data.fan_min_speed != null) next.fan_min_speed = String(data.fan_min_speed);
        if (data.flow_ratio != null) next.flow_ratio = String(data.flow_ratio);
        if (data.pressure_advance != null) next.pressure_advance = String(data.pressure_advance);
        if (data.max_volumetric_speed != null) next.max_volumetric_speed = String(data.max_volumetric_speed);
        if (data.bed_type) next.bed_type = data.bed_type;
        if (data.layer_height != null) next.layer_height = String(data.layer_height);
        if (data.filament_density != null) next.filament_density = String(data.filament_density);
        if (data.print_settings_id) next.print_settings_id = data.print_settings_id;
        if (autoName) next.name = autoProfileName(next.brand, next.type, next.nozzle_size);
        return next;
      });
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setImporting(false);
      if (tmfRef.current) tmfRef.current.value = "";
    }
  }

  function set(key: keyof ProfileFormData, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (autoName && (key === "brand" || key === "type" || key === "nozzle_size")) {
        next.name = autoProfileName(next.brand, next.type, next.nozzle_size);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) if (v !== "") fd.append(k, v);
    if (fileRef.current?.files?.[0]) fd.append("image", fileRef.current.files[0]);
    const url = initial ? `/api/profiles/${initial.id}` : "/api/profiles";
    const method = initial ? "PUT" : "POST";
    await fetch(url, { method, body: fd });
    setSaving(false);
    onSave();
  }

  return (
    <form className="inv-form" onSubmit={handleSubmit}>
      <div className="inv-3mf-import">
        <input ref={tmfRef} type="file" accept=".3mf" style={{ display: "none" }} onChange={handleImport3mf} />
        <button type="button" className="inv-btn inv-btn-ghost inv-btn-import" onClick={() => tmfRef.current?.click()} disabled={importing}>
          {importing ? "Importing…" : "↑ Import from .3mf"}
        </button>
        <span className="inv-import-hint">Pre-fills settings from a sliced file</span>
      </div>
      <div className="inv-form-grid">
        <label className="inv-label">
          Brand
          <input className="inv-input" value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="BAMBU, CREALITY…" required />
        </label>
        <label className="inv-label">
          Type
          <select className="inv-input" value={form.type} onChange={(e) => set("type", e.target.value)}>
            {FILAMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="inv-label">
          Nozzle Size
          <select className="inv-input" value={form.nozzle_size} onChange={(e) => set("nozzle_size", e.target.value)}>
            {NOZZLE_SIZES.map((s) => <option key={s} value={s}>{s}mm</option>)}
          </select>
        </label>
        <label className="inv-label">
          Nozzle Material
          <select className="inv-input" value={form.nozzle_material} onChange={(e) => set("nozzle_material", e.target.value)}>
            {NOZZLE_MATERIALS.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
          </select>
        </label>
        <label className="inv-label">
          Printer Model
          <select className="inv-input" value={form.printer_model} onChange={(e) => set("printer_model", e.target.value)}>
            <option value="">All</option>
            {PRINTER_MODELS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label className="inv-label">
          Profile Name
          <input
            className="inv-input"
            value={form.name}
            onChange={(e) => { setAutoName(false); set("name", e.target.value); }}
            placeholder="auto-generated"
            required
          />
        </label>
        <label className="inv-label">
          Nozzle Temp (°C)
          <input className="inv-input" type="number" value={form.nozzle_temp} onChange={(e) => set("nozzle_temp", e.target.value)} placeholder="220" />
        </label>
        <label className="inv-label">
          Bed Temp (°C)
          <input className="inv-input" type="number" value={form.bed_temp} onChange={(e) => set("bed_temp", e.target.value)} placeholder="65" />
        </label>
        <label className="inv-label">
          Bed Type
          <input className="inv-input" value={form.bed_type} onChange={(e) => set("bed_type", e.target.value)} placeholder="Cool Plate, Textured PEI…" />
        </label>
        <label className="inv-label">
          Layer Height (mm)
          <input className="inv-input" type="number" step="0.01" value={form.layer_height} onChange={(e) => set("layer_height", e.target.value)} placeholder="0.20" />
        </label>
        <label className="inv-label">
          Fan Max Speed (%)
          <input className="inv-input" type="number" min="0" max="100" value={form.fan_max_speed} onChange={(e) => set("fan_max_speed", e.target.value)} placeholder="100" />
        </label>
        <label className="inv-label">
          Fan Min Speed (%)
          <input className="inv-input" type="number" min="0" max="100" value={form.fan_min_speed} onChange={(e) => set("fan_min_speed", e.target.value)} placeholder="20" />
        </label>
        <label className="inv-label">
          Flow Ratio
          <input className="inv-input" type="number" step="0.001" value={form.flow_ratio} onChange={(e) => set("flow_ratio", e.target.value)} />
        </label>
        <label className="inv-label">
          Pressure Advance
          <input className="inv-input" type="number" step="0.001" value={form.pressure_advance} onChange={(e) => set("pressure_advance", e.target.value)} placeholder="0.020" />
        </label>
        <label className="inv-label">
          Max Vol. Speed (mm³/s)
          <input className="inv-input" type="number" step="0.1" value={form.max_volumetric_speed} onChange={(e) => set("max_volumetric_speed", e.target.value)} placeholder="21.0" />
        </label>
        <label className="inv-label">
          Filament Density (g/cm³)
          <input className="inv-input" type="number" step="0.001" value={form.filament_density} onChange={(e) => set("filament_density", e.target.value)} placeholder="1.24" />
        </label>
        <label className="inv-label" style={{ gridColumn: "1 / -1" }}>
          Print Settings ID
          <input className="inv-input" value={form.print_settings_id} onChange={(e) => set("print_settings_id", e.target.value)} placeholder="0.20mm Standard @BBL X1C" />
        </label>
        <label className="inv-label" style={{ gridColumn: "1 / -1" }}>
          Reference Image
          <input ref={fileRef} type="file" className="inv-input" accept="image/*" />
          {initial?.image_path && (
            <span className="inv-current-img">current: <a href={imgUrl(initial.image_path)!} target="_blank" rel="noreferrer">view</a></span>
          )}
        </label>
        <label className="inv-label" style={{ gridColumn: "1 / -1" }}>
          Notes
          <textarea className="inv-input inv-textarea" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
      </div>
      <div className="inv-form-actions">
        <button type="button" className="inv-btn inv-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="inv-btn inv-btn-primary" disabled={saving}>
          {saving ? "Saving…" : initial ? "Update" : "Add Profile"}
        </button>
      </div>
    </form>
  );
}

// ---- Main Component ----

type InvTab = "filaments" | "profiles";

export function Inventory() {
  const [tab, setTab] = useState<InvTab>("filaments");
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [profiles, setProfiles] = useState<CalibrationProfile[]>([]);
  const [editFilament, setEditFilament] = useState<Filament | null | "new">(null);
  const [editProfile, setEditProfile] = useState<CalibrationProfile | null | "new">(null);

  async function loadFilaments() {
    const res = await fetch("/api/filaments");
    if (res.ok) setFilaments(await res.json());
  }

  async function loadProfiles() {
    const res = await fetch("/api/profiles");
    if (res.ok) setProfiles(await res.json());
  }

  useEffect(() => { loadFilaments(); loadProfiles(); }, []);

  async function handleDeleteFilament(id: number) {
    if (!confirm("Delete this filament?")) return;
    await fetch(`/api/filaments/${id}`, { method: "DELETE" });
    loadFilaments();
  }

  async function handleDeleteProfile(id: number) {
    if (!confirm("Delete this profile?")) return;
    await fetch(`/api/profiles/${id}`, { method: "DELETE" });
    loadProfiles();
  }

  return (
    <div className="inv-container">
      <div className="inv-tabs">
        <button className={`inv-tab${tab === "filaments" ? " active" : ""}`} onClick={() => setTab("filaments")}>
          Filaments
          <span className="inv-tab-count">{filaments.length}</span>
        </button>
        <button className={`inv-tab${tab === "profiles" ? " active" : ""}`} onClick={() => setTab("profiles")}>
          Cal Profiles
          <span className="inv-tab-count">{profiles.length}</span>
        </button>
      </div>

      {/* ---- Filaments ---- */}
      {tab === "filaments" && (
        <div className="inv-section">
          {editFilament ? (
            <div className="inv-form-wrap">
              <div className="inv-form-title">{editFilament === "new" ? "Add Filament" : "Edit Filament"}</div>
              <FilamentForm
                initial={editFilament === "new" ? null : editFilament}
                onSave={() => { setEditFilament(null); loadFilaments(); }}
                onCancel={() => setEditFilament(null)}
              />
            </div>
          ) : (
            <>
              <div className="inv-toolbar">
                <button className="inv-btn inv-btn-primary" onClick={() => setEditFilament("new")}>+ Add Filament</button>
              </div>
              {filaments.length === 0 ? (
                <div className="inv-empty">No filaments yet. Add your first spool.</div>
              ) : (
                <div className="inv-filament-grid">
                  {filaments.map((f) => (
                    <div key={f.id} className="inv-filament-card">
                      <div className="inv-filament-img-wrap">
                        {f.image_path ? (
                          <img src={imgUrl(f.image_path)!} alt={f.brand} className="inv-filament-img" />
                        ) : (
                          <div className="inv-filament-img-placeholder" style={{ background: f.color_hex ?? "#333" }} />
                        )}
                        {f.color_hex && (
                          <div className="inv-filament-swatch" style={{ background: f.color_hex }} title={f.color_name ?? f.color_hex} />
                        )}
                      </div>
                      <div className="inv-filament-body">
                        <div className="inv-filament-brand">{f.brand}</div>
                        <div className="inv-filament-type">{f.type}</div>
                        {f.color_name && <div className="inv-filament-color">{f.color_name}</div>}
                        <div className="inv-filament-meta">
                          <span>{f.diameter}mm</span>
                          <span className={`inv-qty${f.quantity === 0 ? " inv-qty-zero" : ""}`}>×{f.quantity}</span>
                        </div>
                        {f.notes && <div className="inv-filament-notes">{f.notes}</div>}
                      </div>
                      <div className="inv-card-actions">
                        <button className="inv-icon-btn" onClick={() => setEditFilament(f)} title="Edit">✎</button>
                        <button className="inv-icon-btn inv-icon-btn-danger" onClick={() => handleDeleteFilament(f.id)} title="Delete">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ---- Calibration Profiles ---- */}
      {tab === "profiles" && (
        <div className="inv-section">
          {editProfile ? (
            <div className="inv-form-wrap">
              <div className="inv-form-title">{editProfile === "new" ? "Add Profile" : "Edit Profile"}</div>
              <ProfileForm
                initial={editProfile === "new" ? null : editProfile}
                onSave={() => { setEditProfile(null); loadProfiles(); }}
                onCancel={() => setEditProfile(null)}
              />
            </div>
          ) : (
            <>
              <div className="inv-toolbar">
                <button className="inv-btn inv-btn-primary" onClick={() => setEditProfile("new")}>+ Add Profile</button>
              </div>
              {profiles.length === 0 ? (
                <div className="inv-empty">No calibration profiles yet.</div>
              ) : (
                <div className="inv-profile-list">
                  {profiles.map((p) => (
                    <div key={p.id} className="inv-profile-card">
                      {p.image_path && (
                        <img src={imgUrl(p.image_path)!} alt={p.name} className="inv-profile-img" />
                      )}
                      <div className="inv-profile-main">
                        <div className="inv-profile-name">{p.name}</div>
                        <div className="inv-profile-sub">
                          {p.brand} · {p.type} · {p.nozzle_size}mm {p.nozzle_material.replace("_", " ")}
                          {p.printer_model && <span className="inv-profile-model"> · {p.printer_model}</span>}
                        </div>
                      </div>
                      <div className="inv-profile-settings">
                        {p.nozzle_temp != null && (
                          <span className="inv-setting"><span className="inv-setting-label">nozzle</span>{p.nozzle_temp}°C</span>
                        )}
                        {p.bed_temp != null && (
                          <span className="inv-setting"><span className="inv-setting-label">bed</span>{p.bed_temp}°C</span>
                        )}
                        {p.bed_type && (
                          <span className="inv-setting"><span className="inv-setting-label">surface</span>{p.bed_type}</span>
                        )}
                        {p.layer_height != null && (
                          <span className="inv-setting"><span className="inv-setting-label">layer</span>{p.layer_height}mm</span>
                        )}
                        {p.fan_max_speed != null && (
                          <span className="inv-setting"><span className="inv-setting-label">fan↑</span>{p.fan_max_speed}%</span>
                        )}
                        {p.fan_min_speed != null && (
                          <span className="inv-setting"><span className="inv-setting-label">fan↓</span>{p.fan_min_speed}%</span>
                        )}
                        {p.flow_ratio != null && (
                          <span className="inv-setting"><span className="inv-setting-label">flow</span>{p.flow_ratio}</span>
                        )}
                        {p.pressure_advance != null && (
                          <span className="inv-setting"><span className="inv-setting-label">PA</span>{p.pressure_advance}</span>
                        )}
                        {p.max_volumetric_speed != null && (
                          <span className="inv-setting"><span className="inv-setting-label">vol</span>{p.max_volumetric_speed}mm³/s</span>
                        )}
                        {p.filament_density != null && (
                          <span className="inv-setting"><span className="inv-setting-label">ρ</span>{p.filament_density}g/cm³</span>
                        )}
                      </div>
                      {p.notes && <div className="inv-profile-notes">{p.notes}</div>}
                      <div className="inv-card-actions">
                        <button className="inv-icon-btn" onClick={() => setEditProfile(p)} title="Edit">✎</button>
                        <button className="inv-icon-btn inv-icon-btn-danger" onClick={() => handleDeleteProfile(p.id)} title="Delete">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
