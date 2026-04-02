import { useState, useEffect } from "react";
import type { PrinterInfo, FtpFileInfo, FtpListing } from "../hooks/usePrinterData";

const FTP_TYPE_DIR = 2;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Breadcrumb({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const parts = path.split("/").filter(Boolean);
  return (
    <div className="ftp-breadcrumb">
      <button className="ftp-crumb" onClick={() => onNavigate("/")}>
        /
      </button>
      {parts.map((part, i) => {
        const target = "/" + parts.slice(0, i + 1).join("/");
        return (
          <span key={i}>
            <span className="ftp-crumb-sep">/</span>
            <button className="ftp-crumb" onClick={() => onNavigate(target)}>
              {part}
            </button>
          </span>
        );
      })}
    </div>
  );
}

interface Props {
  printers: Map<string, PrinterInfo>;
  ftpListings: Map<string, FtpListing>;
  sendMessage: (msg: object) => void;
}

export function FileBrowser({ printers, ftpListings, sendMessage }: Props) {
  const printerList = Array.from(printers.values());
  const [selectedPrinter, setSelectedPrinter] = useState<string>(() => printerList[0]?.id ?? "");
  const [currentPath, setCurrentPath] = useState("/");

  const listing = selectedPrinter ? ftpListings.get(selectedPrinter) : undefined;

  useEffect(() => {
    if (selectedPrinter) {
      sendMessage({ type: "ftp_list", printer: selectedPrinter, path: currentPath });
    }
  }, [selectedPrinter, currentPath, sendMessage]);

  function navigate(path: string) {
    setCurrentPath(path);
  }

  function handleFile(file: FtpFileInfo) {
    if (file.type === FTP_TYPE_DIR) {
      const newPath = currentPath.endsWith("/")
        ? currentPath + file.name
        : currentPath + "/" + file.name;
      navigate(newPath);
    }
  }

  function downloadUrl(file: FtpFileInfo): string {
    const filePath = currentPath.endsWith("/")
      ? currentPath + file.name
      : currentPath + "/" + file.name;
    return `/ftp/download?printer=${encodeURIComponent(selectedPrinter)}&path=${encodeURIComponent(filePath)}`;
  }

  const sorted = listing
    ? [...listing.files].sort((a, b) => {
        if (a.type === FTP_TYPE_DIR && b.type !== FTP_TYPE_DIR) return -1;
        if (a.type !== FTP_TYPE_DIR && b.type === FTP_TYPE_DIR) return 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  if (printerList.length === 0) {
    return <div className="ftp-empty">No printers connected</div>;
  }

  return (
    <div className="ftp-browser">
      <div className="ftp-toolbar">
        <div className="ftp-printer-tabs">
          {printerList.map((p) => (
            <button
              key={p.id}
              className={`ftp-printer-tab${p.id === selectedPrinter ? " active" : ""}`}
              onClick={() => { setSelectedPrinter(p.id); setCurrentPath("/"); }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="ftp-path-row">
          <Breadcrumb path={currentPath} onNavigate={navigate} />
          <button
            className="ftp-refresh-btn"
            onClick={() => sendMessage({ type: "ftp_list", printer: selectedPrinter, path: currentPath })}
            disabled={listing?.loading}
          >
            {listing?.loading ? "..." : "↺"}
          </button>
        </div>
      </div>

      {listing?.error && (
        <div className="ftp-error">{listing.error}</div>
      )}

      <div className="ftp-table-wrap">
        <table className="ftp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="ftp-col-size">Size</th>
              <th className="ftp-col-date">Modified</th>
              <th className="ftp-col-action"></th>
            </tr>
          </thead>
          <tbody>
            {currentPath !== "/" && (
              <tr className="ftp-row ftp-row-dir" onClick={() => {
                const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
                navigate(parent);
              }}>
                <td className="ftp-name"><span className="ftp-icon">📁</span> ..</td>
                <td />
                <td />
                <td />
              </tr>
            )}
            {listing?.loading && sorted.length === 0 && (
              <tr><td colSpan={4} className="ftp-status">Loading...</td></tr>
            )}
            {!listing?.loading && !listing?.error && sorted.length === 0 && (
              <tr><td colSpan={4} className="ftp-status">Empty directory</td></tr>
            )}
            {sorted.map((file) => (
              <tr
                key={file.name}
                className={`ftp-row${file.type === FTP_TYPE_DIR ? " ftp-row-dir" : ""}`}
                onClick={() => handleFile(file)}
              >
                <td className="ftp-name">
                  <span className="ftp-icon">{file.type === FTP_TYPE_DIR ? "📁" : "📄"}</span>
                  {file.name}
                </td>
                <td className="ftp-col-size ftp-muted">
                  {file.type === FTP_TYPE_DIR ? "—" : formatSize(file.size)}
                </td>
                <td className="ftp-col-date ftp-muted">{formatDate(file.modifiedAt)}</td>
                <td className="ftp-col-action">
                  {file.type !== FTP_TYPE_DIR && (
                    <a
                      className="ftp-download-btn"
                      href={downloadUrl(file)}
                      download={file.name}
                      onClick={(e) => e.stopPropagation()}
                    >
                      ↓
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
