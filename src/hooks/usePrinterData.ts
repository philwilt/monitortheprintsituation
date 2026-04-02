import { useState, useEffect, useRef, useCallback, useMemo } from "react";

export interface PrinterInfo {
  id: string;
  name: string;
  ip: string;
  serial: string;
  model: string;
  status: string;
  error?: string;
  data: PrinterData | null;
  lastUpdate?: number;
  alertStartedAt?: number | null;
}

export interface PrinterData {
  gcode_state?: string;
  mc_percent?: number;
  mc_remaining_time?: number;
  nozzle_temper?: number;
  nozzle_target_temper?: number;
  bed_temper?: number;
  bed_target_temper?: number;
  chamber_temper?: number;
  cooling_fan_speed?: string;
  big_fan1_speed?: string;
  big_fan2_speed?: string;
  heatbreak_fan_speed?: string;
  layer_num?: number;
  total_layer_num?: number;
  subtask_name?: string;
  gcode_file?: string;
  spd_lvl?: number;
  spd_mag?: number;
  wifi_signal?: string;
  lights_report?: Array<{ mode: string; node: string }>;
  ams?: {
    ams?: Array<{
      id: string;
      humidity: string;
      temp: string;
      tray?: Array<{
        id: string;
        tray_color: string;
        tray_type: string;
        tray_sub_brands: string;
      }>;
    }>;
    tray_now?: string;
  };
  vir_slot?: Array<{
    id: string;
    tray_color: string;
    tray_type: string;
    tray_sub_brands: string;
    tray_uuid?: string;
    cols?: string[];
  }>;
  xcam?: {
    first_layer_inspector?: boolean;
    spaghetti_detector?: boolean;
  };
  hms?: Array<{ attr: number; code: number }>;
}

export interface FtpFileInfo {
  name: string;
  type: number; // 1=file, 2=dir, 3=symlink
  size: number;
  modifiedAt: string | null;
}

export interface FtpListing {
  path: string;
  files: FtpFileInfo[];
  error?: string;
  loading: boolean;
}

interface WSMessage {
  type: string;
  printer: string;
  state?: PrinterInfo;
  data?: PrinterData;
  frame?: string;
  timestamp?: number;
  path?: string;
  files?: FtpFileInfo[];
  error?: string;
}

export function usePrinterData(livePrinters: Set<string> = new Set()) {
  const [printers, setPrinters] = useState<Map<string, PrinterInfo>>(new Map());
  const [cameraFrames, setCameraFrames] = useState<Map<string, string>>(new Map());
  const [ftpListings, setFtpListings] = useState<Map<string, FtpListing>>(new Map());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const frameIntervalRef = useRef(livePrinters);
  frameIntervalRef.current = livePrinters;

  // Pending camera frames — flushed once per animation frame
  // Blob URLs so the browser can GC each frame after we revoke it
  const pendingFramesRef = useRef<Map<string, string>>(new Map());
  const frameRafRef = useRef<number | undefined>(undefined);
  const blobUrlsRef = useRef<Map<string, string>>(new Map());
  const lastFrameTimeRef = useRef<Map<string, number>>(new Map());

  // Pending printer data patches — batches rapid MQTT bursts into one render
  const pendingDataRef = useRef<Map<string, { data: PrinterData; timestamp?: number }>>(new Map());
  const dataRafRef = useRef<number | undefined>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`ws://${window.location.hostname}:3001`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Connected to server");
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const msg: WSMessage = JSON.parse(event.data);

      if (msg.type === "printer_status" && msg.state) {
        setPrinters((prev) => {
          const next = new Map(prev);
          const existing = prev.get(msg.printer);
          const merged = existing ? { ...existing, ...msg.state! } : msg.state!;
          // Preserve existing data if incoming is null (MQTT reconnect — pushall
          // response hasn't arrived yet and we don't want to blank the card)
          if (existing?.data && msg.state!.data === null) {
            merged.data = existing.data;
          }
          next.set(msg.printer, merged);
          return next;
        });
      }

      if (msg.type === "printer_data" && msg.data) {
        const pending = pendingDataRef.current.get(msg.printer);
        const pendingData = pending?.data || {};
        const mergedPatch = { ...pendingData, ...msg.data };
        if (msg.data.ams && pendingData.ams) {
          mergedPatch.ams = { ...pendingData.ams, ...msg.data.ams };
        }
        pendingDataRef.current.set(msg.printer, {
          data: mergedPatch,
          timestamp: msg.timestamp,
        });
        if (dataRafRef.current === undefined) {
          dataRafRef.current = requestAnimationFrame(() => {
            dataRafRef.current = undefined;
            const batch = new Map(pendingDataRef.current);
            pendingDataRef.current.clear();
            setPrinters((prev) => {
              const next = new Map(prev);
              for (const [printerId, { data, timestamp }] of batch) {
                const existing = next.get(printerId);
                if (existing) {
                  const existingData = existing.data || {};
                  const mergedData = { ...existingData, ...data };
                  if (data.ams && existingData.ams) {
                    mergedData.ams = { ...existingData.ams, ...data.ams };
                  }
                  next.set(printerId, {
                    ...existing,
                    data: mergedData,
                    lastUpdate: timestamp,
                  });
                }
              }
              return next;
            });
          });
        }
      }

      if (msg.type === "ftp_loading") {
        setFtpListings((prev) => {
          const next = new Map(prev);
          next.set(msg.printer, { path: msg.path!, files: [], loading: true });
          return next;
        });
      }

      if (msg.type === "ftp_listing") {
        setFtpListings((prev) => {
          const next = new Map(prev);
          next.set(msg.printer, { path: msg.path!, files: msg.files ?? [], error: msg.error, loading: false });
          return next;
        });
      }

      if (msg.type === "camera_frame" && msg.frame) {
        // Skip frame if in snapshot mode and not enough time has passed
        const isLive = frameIntervalRef.current.has(msg.printer);
        if (!isLive) {
          const last = lastFrameTimeRef.current.get(msg.printer) ?? 0;
          if (Date.now() - last < 30000) return;
          lastFrameTimeRef.current.set(msg.printer, Date.now());
        }

        // Revoke the previous pending blob for this printer (if not yet flushed)
        const prevPending = pendingFramesRef.current.get(msg.printer);
        if (prevPending) URL.revokeObjectURL(prevPending);

        const arr = Uint8Array.from(atob(msg.frame), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([arr], { type: "image/jpeg" }));
        pendingFramesRef.current.set(msg.printer, url);

        if (frameRafRef.current === undefined) {
          frameRafRef.current = requestAnimationFrame(() => {
            frameRafRef.current = undefined;
            const next = new Map(pendingFramesRef.current);
            // Collect old URLs to revoke, but defer until after React paints the new srcs
            const toRevoke: string[] = [];
            for (const [id, oldUrl] of blobUrlsRef.current) {
              if (next.has(id)) toRevoke.push(oldUrl);
            }
            for (const [id, url] of next) blobUrlsRef.current.set(id, url);
            setCameraFrames(next);
            requestAnimationFrame(() => {
              for (const url of toRevoke) URL.revokeObjectURL(url);
            });
          });
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      if (frameRafRef.current !== undefined) cancelAnimationFrame(frameRafRef.current);
      if (dataRafRef.current !== undefined) cancelAnimationFrame(dataRafRef.current);
      wsRef.current?.close();
      for (const url of blobUrlsRef.current.values()) URL.revokeObjectURL(url);
      for (const url of pendingFramesRef.current.values()) URL.revokeObjectURL(url);
    };
  }, [connect]);

  const sendMessage = useMemo(() => (msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { printers, cameraFrames, connected, ftpListings, sendMessage };
}
