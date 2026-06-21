/** True when the event target is a Sonner toast (click should not dismiss Radix dialogs). */
export function isSonnerToastInteraction(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    '[data-sonner-toast], [data-sonner-toaster], [data-sonner-portal]'
  );
}

/** Call from Dialog onPointerDownOutside / onInteractOutside — returns true if handled. */
export function guardDialogFromSonnerOutsideEvent(event: {
  preventDefault: () => void;
  target: EventTarget | null;
}): boolean {
  if (isSonnerToastInteraction(event.target)) {
    event.preventDefault();
    return true;
  }
  return false;
}
