import { useState, useEffect, useCallback } from "react";

export interface GalleryItem {
  id: number;
  name: string;
  description: string | null;
  layer_height: number | null;
  infill_density: string | null;
  infill_pattern: string | null;
  wall_count: number | null;
  support_enabled: boolean;
  filament_type: string | null;
  filament_brand: string | null;
  filament_colours: string[] | null;
  estimated_weight_g: number | null;
  cost_per_kg: number | null;
  compatible_printers: string[] | null;
  source_filename: string | null;
  image_path: string | null;
  notes: string | null;
  created_at: string;
}

export function useGallery() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gallery");
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { items, loading, refresh };
}

// Match a printer's subtask_name to a gallery item
export function matchGalleryItem(items: GalleryItem[], subtaskName: string | undefined): GalleryItem | null {
  if (!subtaskName) return null;
  const needle = subtaskName.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const item of items) {
    if (!item.source_filename) continue;
    const hay = item.source_filename.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (hay === needle) return item;
  }
  return null;
}
