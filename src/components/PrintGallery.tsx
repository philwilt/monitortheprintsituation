import type { PrinterInfo } from "../hooks/usePrinterData";

interface GalleryItem {
  id: string;
  name: string;
  description: string;
  material: string;
  color: string;
  lastPrinted: Date;
  totalPrints: number;
  costPerPrint: number;
  printTimeMinutes: number;
  filePath?: string;
  thumbnailColor: string;
}

const GALLERY: GalleryItem[] = [
  {
    id: "flexi-manta-ray",
    name: "Flexi Manta Ray",
    description: "Articulated flexible ray with full range of motion",
    material: "PLA",
    color: "Multi",
    lastPrinted: new Date("2026-03-31"),
    totalPrints: 3,
    costPerPrint: 1.40,
    printTimeMinutes: 637,
    filePath: "flexi_manta_ray.3mf",
    thumbnailColor: "#2a4a6a",
  },
  {
    id: "gridfinity-base-3x4",
    name: "Gridfinity Base 3×4",
    description: "Standard Gridfinity baseplate, 3 by 4 units",
    material: "PETG",
    color: "Black",
    lastPrinted: new Date("2026-03-29"),
    totalPrints: 12,
    costPerPrint: 0.18,
    printTimeMinutes: 44,
    filePath: "gridfinity_base_3x4.3mf",
    thumbnailColor: "#1a1a2a",
  },
  {
    id: "cable-clip-riser",
    name: "Cable Clip Riser",
    description: "Desk cable management clip with 8mm riser",
    material: "PETG",
    color: "Black",
    lastPrinted: new Date("2026-03-24"),
    totalPrints: 8,
    costPerPrint: 0.04,
    printTimeMinutes: 12,
    filePath: "cable_clip_riser.3mf",
    thumbnailColor: "#1e1e1e",
  },
  {
    id: "tool-holder-25mm",
    name: "Tool Holder — 25mm",
    description: "Wall-mount tool holder for 25mm diameter handles",
    material: "PETG",
    color: "Gray",
    lastPrinted: new Date("2026-03-28"),
    totalPrints: 5,
    costPerPrint: 0.12,
    printTimeMinutes: 28,
    filePath: "tool_holder_25mm.3mf",
    thumbnailColor: "#2a2a2a",
  },
  {
    id: "rpi4-case",
    name: "Raspberry Pi 4 Case",
    description: "Slim low-profile case with GPIO access cutout",
    material: "PLA",
    color: "White",
    lastPrinted: new Date("2026-03-17"),
    totalPrints: 2,
    costPerPrint: 0.85,
    printTimeMinutes: 192,
    filePath: "rpi4_case.3mf",
    thumbnailColor: "#1a2a1a",
  },
  {
    id: "phone-stand",
    name: "Phone Stand Pro",
    description: "Adjustable angle phone stand, 55–75° range",
    material: "PLA",
    color: "Orange",
    lastPrinted: new Date("2026-03-01"),
    totalPrints: 7,
    costPerPrint: 0.32,
    printTimeMinutes: 74,
    filePath: "phone_stand_pro.3mf",
    thumbnailColor: "#3a2a10",
  },
];

function formatDate(d: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface Props {
  printers: Map<string, PrinterInfo>;
}

export function PrintGallery({ printers }: Props) {
  const printerList = Array.from(printers.values()).filter(
    (p) => p.status === "connected"
  );

  function handlePrint(item: GalleryItem, printerId: string) {
    // TODO: POST to server → FTPS upload to printer + MQTT print command
    console.log(`Send ${item.filePath} to printer ${printerId}`);
    alert(`Print queued: ${item.name} → ${printers.get(printerId)?.name}\n(Not yet wired up)`);
  }

  return (
    <div className="gallery-grid">
      {GALLERY.map((item) => (
        <div key={item.id} className="gallery-card">
          <div className="gallery-thumb" style={{ background: item.thumbnailColor }}>
            <span className="gallery-thumb-label">{item.name}</span>
          </div>

          <div className="gallery-body">
            <div className="gallery-name">{item.name}</div>
            <div className="gallery-desc">{item.description}</div>

            <div className="gallery-meta">
              <span className="gallery-meta-item">
                <span className="gallery-meta-label">material</span>
                <span className="gallery-meta-value">{item.material}</span>
              </span>
              <span className="gallery-meta-item">
                <span className="gallery-meta-label">time</span>
                <span className="gallery-meta-value">{formatTime(item.printTimeMinutes)}</span>
              </span>
              <span className="gallery-meta-item">
                <span className="gallery-meta-label">cost</span>
                <span className="gallery-meta-value">${item.costPerPrint.toFixed(2)}</span>
              </span>
              <span className="gallery-meta-item">
                <span className="gallery-meta-label">prints</span>
                <span className="gallery-meta-value">{item.totalPrints}×</span>
              </span>
              <span className="gallery-meta-item">
                <span className="gallery-meta-label">last</span>
                <span className="gallery-meta-value">{formatDate(item.lastPrinted)}</span>
              </span>
            </div>

            <div className="gallery-actions">
              {printerList.length === 0 ? (
                <span className="gallery-no-printers">no printers online</span>
              ) : (
                printerList.map((printer) => (
                  <button
                    key={printer.id}
                    className="gallery-print-btn"
                    onClick={() => handlePrint(item, printer.id)}
                    disabled={!item.filePath}
                    title={item.filePath ? `Send to ${printer.name}` : "No .3mf file attached"}
                  >
                    &#x25B6; {printer.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
