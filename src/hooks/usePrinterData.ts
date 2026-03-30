import { useState, useEffect, useRef, useCallback } from "react";

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
    cols?: string[];
  }>;
  xcam?: {
    first_layer_inspector?: boolean;
    spaghetti_detector?: boolean;
  };
}

interface WSMessage {
  type: string;
  printer: string;
  state?: PrinterInfo;
  data?: PrinterData;
  frame?: string;
  timestamp?: number;
}

export function usePrinterData() {
  const [printers, setPrinters] = useState<Map<string, PrinterInfo>>(new Map());
  const [cameraFrames, setCameraFrames] = useState<Map<string, string>>(new Map());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Pending camera frames — flushed once per animation frame
  // Blob URLs so the browser can GC each frame after we revoke it
  const pendingFramesRef = useRef<Map<string, string>>(new Map());
  const frameRafRef = useRef<number | undefined>(undefined);
  const blobUrlsRef = useRef<Map<string, string>>(new Map());

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
          next.set(msg.printer, msg.state!);
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

      if (msg.type === "camera_frame" && msg.frame) {
        // Revoke the previous pending blob for this printer (if not yet flushed)
        const prevPending = pendingFramesRef.current.get(msg.printer);
        if (prevPending) URL.revokeObjectURL(prevPending);

        const arr = Uint8Array.from(atob(msg.frame), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([arr], { type: "image/jpeg" }));
        pendingFramesRef.current.set(msg.printer, url);

        if (frameRafRef.current === undefined) {
          frameRafRef.current = requestAnimationFrame(() => {
            frameRafRef.current = undefined;
            // Revoke previous live blob URLs before replacing them
            for (const [id, oldUrl] of blobUrlsRef.current) {
              if (pendingFramesRef.current.has(id)) URL.revokeObjectURL(oldUrl);
            }
            const next = new Map(pendingFramesRef.current);
            for (const [id, url] of next) blobUrlsRef.current.set(id, url);
            setCameraFrames(next);
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

  return { printers, cameraFrames, connected };
}
