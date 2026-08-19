import { useState, useMemo, useCallback } from "react";
import { usePrinterData } from "./hooks/usePrinterData";
import { useAlerts } from "./hooks/useAlerts";
import { useGallery, matchGalleryItem } from "./hooks/useGallery";
import { StatusBar, getSystemMood } from "./components/StatusBar";
import { SortablePrinterCard } from "./components/SortablePrinterCard";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
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
  // The server can force a printer out of live mode on its own (LIVE_TIMEOUT_MS
  // safety net) — this fires once per such event, not on every liveCameras
  // change, so it can't clobber a fresh click re-requesting live.
  const onServerLiveOff = useCallback((printer: string) => {
    setLiveCameras((prev) => {
      if (!prev.has(printer)) return prev;
      const next = new Set(prev);
      next.delete(printer);
      return next;
    });
  }, []);
  const { printers, cameraFrames, connected, ftpListings, sendMessage } = usePrinterData(liveCameras, onServerLiveOff);
  useAlerts(printers);
  const { items: galleryItems } = useGallery();
  const mood = getSystemMood(printers);

  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("printer-card-order") ?? "[]"); }
    catch { return []; }
  });

  const orderedPrinters = useMemo(() => {
    const all = Array.from(printers.values());
    const ordered = cardOrder.map((id) => all.find((p) => p.id === id)).filter(Boolean) as typeof all;
    const inOrder = new Set(cardOrder);
    for (const p of all) if (!inOrder.has(p.id)) ordered.push(p);
    return ordered;
  }, [printers, cardOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = orderedPrinters.map((p) => p.id);
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    const next = arrayMove(ids, from, to);
    localStorage.setItem("printer-card-order", JSON.stringify(next));
    setCardOrder(next);
  }

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
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={orderedPrinters.map((p) => p.id)} strategy={rectSortingStrategy}>
                  <div className="printer-grid">
                    {orderedPrinters.map((printer) => (
                      <SortablePrinterCard
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
                </SortableContext>
              </DndContext>
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
