import type { Modifier } from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";

/** Anchor the dragged card to the pointer (where you grabbed it). */
export const snapDragToCursor: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  transform,
}) => {
  if (!draggingNodeRect || !activatorEvent) return transform;

  const coords = getEventCoordinates(activatorEvent);
  if (!coords) return transform;

  return {
    ...transform,
    x: transform.x + coords.x - draggingNodeRect.left,
    y: transform.y + coords.y - draggingNodeRect.top,
  };
};