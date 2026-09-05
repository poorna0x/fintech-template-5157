/** True when the event target is a Sonner toast (click should not dismiss Radix dialogs). */
export function isSonnerToastInteraction(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    '[data-sonner-toast], [data-sonner-toaster], [data-sonner-portal]'
  );
}

/**
 * Portaled overlays (date calendar, select, popover, MUI pickers) render outside
 * DialogContent in the DOM. Without this guard, a click on them counts as
 * "outside" → dialog closes and/or the calendar vanishes behind the dim layer.
 */
export function isPortaledOverlayInteraction(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest('[data-date-picker-content]') ||
      target.closest('[data-radix-popper-content-wrapper]') ||
      target.closest('[data-radix-select-viewport]') ||
      target.closest('[role="listbox"]') ||
      target.closest('[role="option"]') ||
      target.closest('.MuiDateCalendar-root') ||
      target.closest('.MuiPickersLayout-root') ||
      target.closest('.MuiPickersPopper-root') ||
      target.closest('.MuiModal-root')
  );
}

/** Call from Dialog onPointerDownOutside / onInteractOutside — returns true if handled. */
export function guardDialogFromSonnerOutsideEvent(event: {
  preventDefault: () => void;
  target: EventTarget | null;
}): boolean {
  if (isSonnerToastInteraction(event.target) || isPortaledOverlayInteraction(event.target)) {
    event.preventDefault();
    return true;
  }
  return false;
}
