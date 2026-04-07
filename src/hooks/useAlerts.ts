import { useEffect, useRef } from "react";
import type { PrinterInfo } from "./usePrinterData";
import { decodeHMS } from "../utils/hms";

export function useAlerts(printers: Map<string, PrinterInfo>) {
  const prevRef = useRef<Map<string, PrinterInfo>>(new Map());

  // Request permission once on mount
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const prev = prevRef.current;

    for (const [, printer] of printers) {
      const prevPrinter = prev.get(printer.id);

      // Skip first data arrival — no prev state to diff against
      if (!prevPrinter?.data || !printer.data) continue;

      // New HMS errors only (severity: "error" — things that turn the card red)
      const prevHms = prevPrinter.data.hms ?? [];
      const currHms = printer.data.hms ?? [];
      const prevKeys = new Set(prevHms.map((h) => `${h.attr}-${h.code}`));
      for (const h of currHms) {
        if (!prevKeys.has(`${h.attr}-${h.code}`)) {
          const decoded = decodeHMS(h.attr, h.code, printer.model);
          if (!decoded.unknown && decoded.severity === "error") {
            notify(printer.name, decoded.message);
          }
        }
      }

      // Print failed
      const prevState = prevPrinter.data.gcode_state;
      const currState = printer.data.gcode_state;
      if (prevState === "RUNNING" && currState === "FAILED") {
        notify(printer.name, "Print failed");
      }
    }

    prevRef.current = new Map(printers);
  }, [printers]);
}

function notify(printerName: string, message: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  new Notification(printerName, {
    body: message,
    tag: `${printerName}-${message}`,
  });
}
