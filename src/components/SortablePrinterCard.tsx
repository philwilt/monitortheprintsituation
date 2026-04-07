import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PrinterCard } from "./PrinterCard";
import type { PrinterInfo } from "../hooks/usePrinterData";
import type { GalleryItem } from "../hooks/useGallery";

interface Props {
  printer: PrinterInfo;
  cameraFrame?: string;
  isLive?: boolean;
  onToggleLive?: () => void;
  galleryItem?: GalleryItem | null;
}

export function SortablePrinterCard({ printer, cameraFrame, isLive, onToggleLive, galleryItem }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: printer.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    position: "relative",
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="drag-handle" title="Drag to reorder" {...attributes} {...listeners}>
        ⠿
      </div>
      <PrinterCard
        printer={printer}
        cameraFrame={cameraFrame}
        isLive={isLive}
        onToggleLive={onToggleLive}
        galleryItem={galleryItem}
      />
    </div>
  );
}
