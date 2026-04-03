import { useState } from "react";
import { usePrinterData } from "./hooks/usePrinterData";
import { useAlerts } from "./hooks/useAlerts";
import { useGallery, matchGalleryItem } from "./hooks/useGallery";
import { StatusBar, getSystemMood } from "./components/StatusBar";
import { PrinterCard } from "./components/PrinterCard";
import { PrintGallery } from "./components/PrintGallery";
import { PrintLog } from "./components/PrintLog";
import { Stats } from "./components/Stats";
import { FileBrowser } from "./components/FileBrowser";
import { Inventory } from "./components/Inventory";
import "./App.css";

type Tab = "status" | "gallery" | "log" | "stats" | "files" | "inventory";

function App() {
  const [tab, setTab] = useState<Tab>("status");
  const [liveCameras, setLiveCameras] = useState<Set<string>>(new Set());
  const { printers, cameraFrames, connected, ftpListings, sendMessage } = usePrinterData(liveCameras);
  useAlerts(printers);
  const { items: galleryItems } = useGallery();
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
          <button
            className={`tab-btn${tab === "log" ? " active" : ""}`}
            onClick={() => setTab("log")}
          >
            Log
          </button>
          <button
            className={`tab-btn${tab === "stats" ? " active" : ""}`}
            onClick={() => setTab("stats")}
          >
            Stats
          </button>
          <button
            className={`tab-btn${tab === "files" ? " active" : ""}`}
            onClick={() => setTab("files")}
          >
            Files
          </button>
          <button
            className={`tab-btn${tab === "inventory" ? " active" : ""}`}
            onClick={() => setTab("inventory")}
          >
            Inventory
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
              <div className="printer-grid">
                {Array.from(printers.values()).map((printer) => (
                  <PrinterCard
                    key={printer.id}
                    printer={printer}
                    cameraFrame={cameraFrames.get(printer.id)}
                    isLive={liveCameras.has(printer.id)}
                    onToggleLive={() => setLiveCameras((prev) => {
                      const next = new Set(prev);
                      if (next.has(printer.id)) next.delete(printer.id);
                      else next.add(printer.id);
                      return next;
                    })}
                    galleryItem={matchGalleryItem(galleryItems, printer.data?.subtask_name)}
                  />
                ))}
              </div>
            )
          )}

          {tab === "gallery" && <PrintGallery printers={printers} />}
          {tab === "log" && <PrintLog />}
          {tab === "stats" && <Stats />}
          {tab === "files" && <FileBrowser printers={printers} ftpListings={ftpListings} sendMessage={sendMessage} />}
          {tab === "inventory" && <Inventory />}
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
