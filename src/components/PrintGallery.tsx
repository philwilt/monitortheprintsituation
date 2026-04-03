import { useState, useRef } from "react";
import type { PrinterInfo } from "../hooks/usePrinterData";
import { useGallery, type GalleryItem } from "../hooks/useGallery";

// ---- Helpers ----

function imgUrl(p: string | null) { return p ? `/uploads/${p}` : null; }

function cost(item: GalleryItem): number | null {
  if (item.estimated_weight_g == null || item.cost_per_kg == null) return null;
  return (item.estimated_weight_g * item.cost_per_kg) / 1000;
}

function fmtCost(c: number) { return `$${c.toFixed(2)}`; }

// ---- Gallery Item Form ----

interface FormData {
  name: string;
  description: string;
  layer_height: string;
  infill_density: string;
  infill_pattern: string;
  wall_count: string;
  support_enabled: boolean;
  filament_type: string;
  filament_brand: string;
  estimated_weight_g: string;
  cost_per_kg: string;
  notes: string;
  // stored as JSON strings for transport
  filament_colours: string[];
  compatible_printers: string[];
  source_filename: string;
  image_path: string;        // existing image filename (no upload)
}

const empty: FormData = {
  name: "", description: "", layer_height: "", infill_density: "", infill_pattern: "",
  wall_count: "", support_enabled: false, filament_type: "", filament_brand: "",
  estimated_weight_g: "", cost_per_kg: "", notes: "",
  filament_colours: [], compatible_printers: [], source_filename: "", image_path: "",
};

function fromItem(item: GalleryItem): FormData {
  return {
    name: item.name,
    description: item.description ?? "",
    layer_height: item.layer_height != null ? String(item.layer_height) : "",
    infill_density: item.infill_density ?? "",
    infill_pattern: item.infill_pattern ?? "",
    wall_count: item.wall_count != null ? String(item.wall_count) : "",
    support_enabled: item.support_enabled,
    filament_type: item.filament_type ?? "",
    filament_brand: item.filament_brand ?? "",
    estimated_weight_g: item.estimated_weight_g != null ? String(item.estimated_weight_g) : "",
    cost_per_kg: item.cost_per_kg != null ? String(item.cost_per_kg) : "",
    notes: item.notes ?? "",
    filament_colours: item.filament_colours ?? [],
    compatible_printers: item.compatible_printers ?? [],
    source_filename: item.source_filename ?? "",
    image_path: item.image_path ?? "",
  };
}

function GalleryForm({ initial, onSave, onCancel }: {
  initial?: GalleryItem | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormData>(initial ? fromItem(initial) : empty);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tmfRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-3mf", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setForm((f) => ({
        ...f,
        name: f.name || file.name.replace(/\.3mf$/i, ""),
        source_filename: file.name,
        layer_height: d.layer_height != null ? String(d.layer_height) : f.layer_height,
        infill_density: d.infill_density ?? f.infill_density,
        infill_pattern: d.infill_pattern ?? f.infill_pattern,
        wall_count: d.wall_count != null ? String(d.wall_count) : f.wall_count,
        support_enabled: d.support_enabled ?? f.support_enabled,
        filament_type: d.type ?? f.filament_type,
        filament_brand: d.brand ?? f.filament_brand,
        filament_colours: d.filament_colours?.length ? d.filament_colours : f.filament_colours,
        estimated_weight_g: d.estimated_weight_g != null ? String(Math.round(d.estimated_weight_g * 10) / 10) : f.estimated_weight_g,
        cost_per_kg: d.cost_per_kg != null ? String(d.cost_per_kg) : f.cost_per_kg,
        compatible_printers: d.compatible_printers?.length ? d.compatible_printers : f.compatible_printers,
        image_path: d.thumbnail_filename ?? f.image_path,
      }));
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setImporting(false);
      if (tmfRef.current) tmfRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.append("name", form.name);
    if (form.description) fd.append("description", form.description);
    if (form.layer_height) fd.append("layer_height", form.layer_height);
    if (form.infill_density) fd.append("infill_density", form.infill_density);
    if (form.infill_pattern) fd.append("infill_pattern", form.infill_pattern);
    if (form.wall_count) fd.append("wall_count", form.wall_count);
    fd.append("support_enabled", String(form.support_enabled));
    if (form.filament_type) fd.append("filament_type", form.filament_type);
    if (form.filament_brand) fd.append("filament_brand", form.filament_brand);
    if (form.estimated_weight_g) fd.append("estimated_weight_g", form.estimated_weight_g);
    if (form.cost_per_kg) fd.append("cost_per_kg", form.cost_per_kg);
    if (form.notes) fd.append("notes", form.notes);
    if (form.source_filename) fd.append("source_filename", form.source_filename);
    if (form.image_path && !imgRef.current?.files?.[0]) fd.append("image_path", form.image_path);
    fd.append("filament_colours", JSON.stringify(form.filament_colours));
    fd.append("compatible_printers", JSON.stringify(form.compatible_printers));
    if (imgRef.current?.files?.[0]) fd.append("image", imgRef.current.files[0]);
    const url = initial ? `/api/gallery/${initial.id}` : "/api/gallery";
    await fetch(url, { method: initial ? "PUT" : "POST", body: fd });
    setSaving(false);
    onSave();
  }

  const previewImg = imgUrl(form.image_path);

  return (
    <form className="inv-form" onSubmit={handleSubmit}>
      <div className="inv-3mf-import">
        <input ref={tmfRef} type="file" accept=".3mf" style={{ display: "none" }} onChange={handleImport} />
        <button type="button" className="inv-btn inv-btn-ghost inv-btn-import" onClick={() => tmfRef.current?.click()} disabled={importing}>
          {importing ? "Importing…" : "↑ Import from .3mf"}
        </button>
        <span className="inv-import-hint">Pre-fills settings and saves plate thumbnail</span>
      </div>

      <div className="inv-form-grid">
        <label className="inv-label" style={{ gridColumn: "1 / -1" }}>
          Name
          <input className="inv-input" value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </label>
        <label className="inv-label" style={{ gridColumn: "1 / -1" }}>
          Description
          <input className="inv-input" value={form.description} onChange={(e) => set("description", e.target.value)} />
        </label>

        <label className="inv-label">
          Layer Height (mm)
          <input className="inv-input" type="number" step="0.01" value={form.layer_height} onChange={(e) => set("layer_height", e.target.value)} placeholder="0.16" />
        </label>
        <label className="inv-label">
          Walls
          <input className="inv-input" type="number" min="1" value={form.wall_count} onChange={(e) => set("wall_count", e.target.value)} placeholder="2" />
        </label>
        <label className="inv-label">
          Infill Density
          <input className="inv-input" value={form.infill_density} onChange={(e) => set("infill_density", e.target.value)} placeholder="15%" />
        </label>
        <label className="inv-label">
          Infill Pattern
          <input className="inv-input" value={form.infill_pattern} onChange={(e) => set("infill_pattern", e.target.value)} placeholder="gyroid" />
        </label>

        <label className="inv-label">
          Filament Brand
          <input className="inv-input" value={form.filament_brand} onChange={(e) => set("filament_brand", e.target.value)} placeholder="Inland" />
        </label>
        <label className="inv-label">
          Filament Type
          <input className="inv-input" value={form.filament_type} onChange={(e) => set("filament_type", e.target.value)} placeholder="PLA" />
        </label>
        <label className="inv-label">
          Est. Weight (g)
          <input className="inv-input" type="number" step="0.1" value={form.estimated_weight_g} onChange={(e) => set("estimated_weight_g", e.target.value)} placeholder="12.5" />
        </label>
        <label className="inv-label">
          Cost / kg ($)
          <input className="inv-input" type="number" step="0.01" value={form.cost_per_kg} onChange={(e) => set("cost_per_kg", e.target.value)} placeholder="24.99" />
        </label>

        <label className="inv-label" style={{ gridColumn: "1 / -1", flexDirection: "row", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
          <input type="checkbox" checked={form.support_enabled} onChange={(e) => set("support_enabled", e.target.checked)} />
          Supports enabled
        </label>

        {/* Filament colours */}
        {form.filament_colours.length > 0 && (
          <div className="gallery-colours-row" style={{ gridColumn: "1 / -1" }}>
            <span className="inv-label" style={{ marginBottom: "0.25rem" }}>AMS Colours</span>
            <div className="gallery-swatch-row">
              {form.filament_colours.map((c, i) => (
                <span key={i} className="gallery-swatch" style={{ background: c }} title={c} />
              ))}
            </div>
          </div>
        )}

        {/* Compatible printers */}
        {form.compatible_printers.length > 0 && (
          <div style={{ gridColumn: "1 / -1" }}>
            <div className="inv-label" style={{ marginBottom: "0.25rem" }}>Compatible Printers</div>
            <div className="gallery-compat-row">
              {form.compatible_printers.map((p, i) => (
                <span key={i} className="gallery-compat-badge">{p}</span>
              ))}
            </div>
          </div>
        )}

        <label className="inv-label" style={{ gridColumn: "1 / -1" }}>
          Image
          <input ref={imgRef} type="file" className="inv-input" accept="image/*" />
          {previewImg && <img src={previewImg} alt="preview" className="gallery-form-preview" />}
        </label>
        <label className="inv-label" style={{ gridColumn: "1 / -1" }}>
          Notes
          <textarea className="inv-input inv-textarea" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
      </div>

      <div className="inv-form-actions">
        <button type="button" className="inv-btn inv-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="inv-btn inv-btn-primary" disabled={saving}>
          {saving ? "Saving…" : initial ? "Update" : "Add to Gallery"}
        </button>
      </div>
    </form>
  );
}

// ---- Detail Modal ----

function GalleryDetail({ item, printers, onClose, onEdit, onDelete }: {
  item: GalleryItem;
  printers: PrinterInfo[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const printCost = cost(item);
  const img = imgUrl(item.image_path);
  const connected = printers.filter((p) => p.status === "connected");

  async function handlePrint(printerId: string) {
    alert(`Send ${item.source_filename || item.name} to ${printers.find(p => p.id === printerId)?.name}\n(Not yet wired up)`);
  }

  return (
    <div className="gd-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gd-panel">
        <div className="gd-header">
          <div className="gd-title">{item.name}</div>
          <div className="gd-header-actions">
            <button className="inv-icon-btn" onClick={onEdit} title="Edit">✎</button>
            <button className="inv-icon-btn inv-icon-btn-danger" onClick={onDelete} title="Delete">✕</button>
            <button className="gd-close" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        <div className="gd-body">
          {/* Thumbnail */}
          <div className="gd-thumb">
            {img ? (
              <img src={img} alt={item.name} className="gd-thumb-img" />
            ) : (
              <div className="gd-thumb-placeholder">
                {item.filament_colours?.length ? (
                  item.filament_colours.map((c, i) => (
                    <div key={i} className="gallery-thumb-stripe" style={{ background: c }} />
                  ))
                ) : (
                  <span className="gallery-thumb-label">{item.name}</span>
                )}
              </div>
            )}
          </div>

          <div className="gd-content">
            {item.description && <div className="gd-desc">{item.description}</div>}

            {/* Slice params */}
            {(item.layer_height || item.infill_density || item.wall_count || item.support_enabled) && (
              <div className="gd-section">
                <div className="gd-section-label">Slice Settings</div>
                <div className="gd-row">
                  {item.layer_height && (
                    <div className="gd-stat">
                      <div className="gd-stat-label">Layer Height</div>
                      <div className="gd-stat-value">{item.layer_height}mm</div>
                    </div>
                  )}
                  {item.infill_density && (
                    <div className="gd-stat">
                      <div className="gd-stat-label">Infill</div>
                      <div className="gd-stat-value">{item.infill_density}{item.infill_pattern ? ` · ${item.infill_pattern}` : ""}</div>
                    </div>
                  )}
                  {item.wall_count && (
                    <div className="gd-stat">
                      <div className="gd-stat-label">Walls</div>
                      <div className="gd-stat-value">{item.wall_count}</div>
                    </div>
                  )}
                  {item.support_enabled && (
                    <div className="gd-stat">
                      <div className="gd-stat-label">Supports</div>
                      <div className="gd-stat-value gd-stat-warn">Yes</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Filament + cost */}
            {(item.filament_brand || item.filament_type || item.estimated_weight_g != null || printCost != null) && (
              <div className="gd-section">
                <div className="gd-section-label">Filament</div>
                <div className="gd-row">
                  {(item.filament_brand || item.filament_type) && (
                    <div className="gd-stat">
                      <div className="gd-stat-label">Material</div>
                      <div className="gd-stat-value">{[item.filament_brand, item.filament_type].filter(Boolean).join(" ")}</div>
                    </div>
                  )}
                  {item.estimated_weight_g != null && (
                    <div className="gd-stat">
                      <div className="gd-stat-label">Weight</div>
                      <div className="gd-stat-value">{item.estimated_weight_g}g</div>
                    </div>
                  )}
                  {printCost != null && (
                    <div className="gd-stat">
                      <div className="gd-stat-label">Est. Cost</div>
                      <div className="gd-stat-value gd-stat-cost">{fmtCost(printCost)}</div>
                    </div>
                  )}
                </div>
                {item.filament_colours && item.filament_colours.length > 0 && (
                  <div className="gd-swatches">
                    {item.filament_colours.map((c, i) => (
                      <span key={i} className="gallery-swatch gd-swatch" style={{ background: c }} title={c} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Compatible printers */}
            {item.compatible_printers && item.compatible_printers.length > 0 && (
              <div className="gd-section">
                <div className="gd-section-label">Compatible Printers</div>
                <div className="gallery-compat-row">
                  {item.compatible_printers.map((p, i) => (
                    <span key={i} className="gallery-compat-badge">{p}</span>
                  ))}
                </div>
              </div>
            )}

            {item.notes && (
              <div className="gd-section">
                <div className="gd-section-label">Notes</div>
                <div className="gd-notes">{item.notes}</div>
              </div>
            )}

            {/* Print buttons */}
            <div className="gd-section">
              <div className="gd-section-label">Send to Printer</div>
              <div className="gallery-actions">
                {connected.length === 0 ? (
                  <span className="gallery-no-printers">no printers online</span>
                ) : connected.map((p) => (
                  <button key={p.id} className="gallery-print-btn" onClick={() => handlePrint(p.id)}>
                    &#x25B6; {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Gallery Card ----

function GalleryCard({ item, printers, onOpen, onEdit, onDelete }: {
  item: GalleryItem;
  printers: PrinterInfo[];
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const printCost = cost(item);
  const img = imgUrl(item.image_path);

  return (
    <div className="gallery-card" onClick={onOpen} style={{ cursor: "pointer" }}>
      <div className="gallery-thumb">
        {img ? (
          <img src={img} alt={item.name} className="gallery-thumb-img" />
        ) : (
          <div className="gallery-thumb-placeholder">
            {item.filament_colours?.length ? (
              item.filament_colours.map((c, i) => (
                <div key={i} className="gallery-thumb-stripe" style={{ background: c }} />
              ))
            ) : (
              <span className="gallery-thumb-label">{item.name}</span>
            )}
          </div>
        )}
        <div className="gallery-card-actions" onClick={(e) => e.stopPropagation()}>
          <button className="inv-icon-btn" onClick={onEdit} title="Edit">✎</button>
          <button className="inv-icon-btn inv-icon-btn-danger" onClick={onDelete} title="Delete">✕</button>
        </div>
      </div>

      <div className="gallery-body">
        <div className="gallery-name">{item.name}</div>
        {item.description && <div className="gallery-desc">{item.description}</div>}

        <div className="gallery-slice-row">
          {item.layer_height && <span className="gallery-slice-tag">{item.layer_height}mm</span>}
          {item.infill_density && <span className="gallery-slice-tag">{item.infill_density} {item.infill_pattern ?? "infill"}</span>}
          {item.wall_count && <span className="gallery-slice-tag">{item.wall_count}w</span>}
          {item.support_enabled && <span className="gallery-slice-tag gallery-slice-tag-support">supports</span>}
        </div>

        <div className="gallery-meta">
          {(item.filament_brand || item.filament_type) && (
            <span className="gallery-meta-item">
              <span className="gallery-meta-label">filament</span>
              <span className="gallery-meta-value">{[item.filament_brand, item.filament_type].filter(Boolean).join(" ")}</span>
            </span>
          )}
          {item.estimated_weight_g != null && (
            <span className="gallery-meta-item">
              <span className="gallery-meta-label">weight</span>
              <span className="gallery-meta-value">{item.estimated_weight_g}g</span>
            </span>
          )}
          {printCost != null && (
            <span className="gallery-meta-item gallery-meta-cost">
              <span className="gallery-meta-label">cost</span>
              <span className="gallery-meta-value">{fmtCost(printCost)}</span>
            </span>
          )}
        </div>

        {item.filament_colours && item.filament_colours.length > 0 && (
          <div className="gallery-swatch-row">
            {item.filament_colours.map((c, i) => (
              <span key={i} className="gallery-swatch" style={{ background: c }} title={c} />
            ))}
          </div>
        )}

        {item.compatible_printers && item.compatible_printers.length > 0 && (
          <div className="gallery-compat-row">
            {item.compatible_printers.map((p, i) => (
              <span key={i} className="gallery-compat-badge">{p}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Main Component ----

interface Props {
  printers: Map<string, PrinterInfo>;
}

export function PrintGallery({ printers }: Props) {
  const { items, refresh } = useGallery();
  const [editing, setEditing] = useState<GalleryItem | null | "new">(null);
  const [detail, setDetail] = useState<GalleryItem | null>(null);
  const printerList = Array.from(printers.values());

  async function handleDelete(id: number) {
    if (!confirm("Remove this item from the gallery?")) return;
    await fetch(`/api/gallery/${id}`, { method: "DELETE" });
    if (detail?.id === id) setDetail(null);
    refresh();
  }

  if (editing) {
    return (
      <div>
        <div className="inv-form-wrap">
          <div className="inv-form-title">{editing === "new" ? "Add to Gallery" : "Edit Gallery Item"}</div>
          <GalleryForm
            initial={editing === "new" ? null : editing}
            onSave={() => { setEditing(null); refresh(); }}
            onCancel={() => setEditing(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {detail && (
        <GalleryDetail
          item={detail}
          printers={printerList}
          onClose={() => setDetail(null)}
          onEdit={() => { setDetail(null); setEditing(detail); }}
          onDelete={() => handleDelete(detail.id)}
        />
      )}

      <div className="inv-toolbar" style={{ marginBottom: "1rem" }}>
        <button className="inv-btn inv-btn-primary" onClick={() => setEditing("new")}>+ Add to Gallery</button>
      </div>
      {items.length === 0 ? (
        <div className="inv-empty">No items yet. Import a .3mf to get started.</div>
      ) : (
        <div className="gallery-grid">
          {items.map((item) => (
            <GalleryCard
              key={item.id}
              item={item}
              printers={printerList}
              onOpen={() => setDetail(item)}
              onEdit={() => setEditing(item)}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
