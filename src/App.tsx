import { useState } from "react";
import { usePrinterData } from "./hooks/usePrinterData";
import { useAlerts } from "./hooks/useAlerts";
import { StatusBar, getSystemMood } from "./components/StatusBar";
import { HeroBanner } from "./components/HeroBanner";
import { PrinterCard } from "./components/PrinterCard";
import { PrintGallery } from "./components/PrintGallery";
import "./App.css";

type Tab = "status" | "gallery";

function App() {
  const [tab, setTab] = useState<Tab>("status");
  const [liveCameras, setLiveCameras] = useState<Set<string>>(new Set());
  const { printers, cameraFrames, connected } = usePrinterData(liveCameras);
  useAlerts(printers);
  const mood = getSystemMood(printers);

  const timestamp = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <div className="scanline-overlay" />
      <div className="grid-background" />

      <div className="app" data-mood={mood}>
        <StatusBar printers={printers} connected={connected} />

        <HeroBanner />

        <nav className="tab-bar">
          <button
            className={`tab-btn${tab === "status" ? " active" : ""}`}
            onClick={() => setTab("status")}
          >
            Status
          </button>
          <button
            className={`tab-btn${tab === "gallery" ? " active" : ""}`}
            onClick={() => setTab("gallery")}
          >
            Print Gallery
          </button>
        </nav>

        <main className="main-content">
          {tab === "status" && (
            printers.size === 0 ? (
              <div className="empty-state">
                <div className="empty-state-title">
                  {connected ? "Waiting for printer data" : "Establishing connection"}
                </div>
                <div className="empty-state-subtitle">
                  {connected ? "This seems fine" : "Stand by"}
                </div>
              </div>
            ) : (
              <>
                <div className="camera-strip">
                  {Array.from(printers.values()).map((printer) => {
                    const frame = cameraFrames.get(printer.id);
                    const isLive = liveCameras.has(printer.id);
                    return (
                      <div
                        key={printer.id}
                        className="camera-cell"
                        onClick={() => setLiveCameras((prev) => {
                          const next = new Set(prev);
                          if (next.has(printer.id)) next.delete(printer.id);
                          else next.add(printer.id);
                          return next;
                        })}
                      >
                        {frame ? (
                          <img src={frame} alt={`${printer.name} feed`} />
                        ) : (
                          <div className="camera-placeholder">{printer.name}</div>
                        )}
                        <div className="camera-cell-footer">
                          <span className="camera-cell-name">{printer.name}</span>
                          <span className={`camera-live-badge${isLive ? " live" : ""}`}>
                            <span className="live-toggle-dot" />
                            {isLive ? "live" : "click for live"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="printer-grid">
                  {Array.from(printers.values()).map((printer) => (
                    <PrinterCard
                      key={printer.id}
                      printer={printer}
                      hideCamera
                    />
                  ))}
                </div>
              </>
            )
          )}

          {tab === "gallery" && <PrintGallery printers={printers} />}
        </main>

        <footer className="footer">
          <span className="footer-left">{timestamp}</span>
          <span className="footer-right">the situation v0.1</span>
        </footer>
      </div>
    </>
  );
}

export default App;
