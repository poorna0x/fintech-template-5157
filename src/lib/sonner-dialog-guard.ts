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

function elementInAlertDialog(node: EventTarget | null): boolean {
  if (!(node instanceof Element)) return false;
  return Boolean(
    node.closest('[role="alertdialog"]') || node.closest('[data-alert-dialog-layer]')
  );
}

/** Confirm dialogs portal outside the gallery dialog. Treat them as inside so the gallery stays open. */
export function isAlertDialogInteraction(event: {
  target: EventTarget | null;
  detail?: { originalEvent?: Event };
}): boolean {
  const related = (event.detail?.originalEvent as FocusEvent | undefined)?.relatedTarget ?? null;
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  return (
    elementInAlertDialog(event.target) ||
    elementInAlertDialog(related) ||
    elementInAlertDialog(active)
  );
}

/** Call from Dialog onPointerDownOutside / onInteractOutside / onFocusOutside — returns true if handled. */
export function guardDialogFromSonnerOutsideEvent(event: {
  preventDefault: () => void;
  target: EventTarget | null;
  detail?: { originalEvent?: Event };
}): boolean {
  if (
    isSonnerToastInteraction(event.target) ||
    isPortaledOverlayInteraction(event.target) ||
    isAlertDialogInteraction(event)
  ) {
    event.preventDefault();
    return true;
  }
  return false;
}
