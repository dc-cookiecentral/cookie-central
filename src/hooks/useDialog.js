import { useEffect } from 'react';

// Focus management for a modal dialog: initial focus, a Tab trap, Escape, and
// focus restored to whatever opened it.
//
// Sample Central has two overlapping dialogs — the Build Shipment drawer and the
// confirm sheet that opens ON TOP of it — so the important detail here is that
// the keydown listener is bound to the dialog NODE, not to `document`.
//
// A document-level Escape handler in both would close both at once: the sheet
// AND the drawer behind it, discarding a cart the user was only asking to keep
// editing. Node-scoped listeners make that impossible, because a keypress inside
// the confirm sheet never reaches the drawer's node — they are siblings in the
// tree, not nested. Whichever dialog holds focus is the one that responds, which
// is exactly the behaviour a stacked dialog needs and costs no bookkeeping.
//
// Deliberately NOT included: body scroll lock. It needs scrollbar-gutter
// compensation to avoid a layout jump on every open, and the page behind these
// dialogs is already covered by an opaque-enough overlay.

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * @param ref     ref on the dialog element
 * @param onClose called on Escape; omit to make the dialog non-dismissable
 */
export function useDialog(ref, onClose) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Restore to this on unmount. Without it, closing the drawer drops focus to
    // <body> and a keyboard user restarts from the top of the page.
    const opener = document.activeElement;

    const focusables = () => [...node.querySelectorAll(FOCUSABLE)];
    // `data-autofocus` lets a dialog choose a safer landing spot than "first
    // control" — the confirm sheet points it at Cancel, so a stray Enter on an
    // already-open sheet does the harmless thing.
    const target = node.querySelector('[data-autofocus]') || focusables()[0] || node;
    target.focus?.();

    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      // Wrap at both ends — otherwise Tab walks out of the dialog and into the
      // page underneath, which is still covered and unreadable.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      // Guard: the opener may have unmounted (the drawer closes on submit, and
      // the tab switches underneath it).
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [ref, onClose]);
}
