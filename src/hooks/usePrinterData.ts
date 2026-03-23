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
  const [cameraFrames, setCameraFrames] = useState<Map<string, string>>(
    new Map()
  );
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket("ws://localhost:3001");
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
        setPrinters((prev) => {
          const next = new Map(prev);
          const existing = next.get(msg.printer);
          if (existing) {
            next.set(msg.printer, {
              ...existing,
              data: { ...(existing.data || {}), ...msg.data! },
              lastUpdate: msg.timestamp,
            });
          }
          return next;
        });
      }

      if (msg.type === "camera_frame" && msg.frame) {
        setCameraFrames((prev) => {
          const next = new Map(prev);
          next.set(msg.printer, `data:image/jpeg;base64,${msg.frame}`);
          return next;
        });
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
      wsRef.current?.close();
    };
  }, [connect]);

  return { printers, cameraFrames, connected };
}
