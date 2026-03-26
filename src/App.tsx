import { usePrinterData } from "./hooks/usePrinterData";
import { StatusBar, getSystemMood } from "./components/StatusBar";
import { HeroBanner } from "./components/HeroBanner";
import { PrinterCard } from "./components/PrinterCard";
import "./App.css";

function App() {
  const { printers, cameraFrames, connected } = usePrinterData();
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

        <main className="main-content">
          <div className="printer-grid">
            {printers.size === 0 && (
              <div className="empty-state">
                <div className="empty-state-title">
                  {connected
                    ? "Waiting for printer data"
                    : "Establishing connection"}
                </div>
                <div className="empty-state-subtitle">
                  {connected ? "This seems fine" : "Stand by"}
                </div>
              </div>
            )}
            {Array.from(printers.values()).map((printer) => (
              <PrinterCard
                key={printer.id}
                printer={printer}
                cameraFrame={cameraFrames.get(printer.id)}
              />
            ))}
          </div>
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
