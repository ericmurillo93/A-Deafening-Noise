import { useEffect, useLayoutEffect, useRef } from "react";

export function usePageScrollLock(locked) {
  useLayoutEffect(() => {
    if (!locked) return undefined;

    const body = document.body;
    const root = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscroll = root.style.overscrollBehavior;
    const scrollbarWidth = window.innerWidth - root.clientWidth;

    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    if (scrollbarWidth > 0) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbarWidth}px`;

    return () => {
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscroll;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      body.style.paddingRight = previousBodyPaddingRight;
    };
  }, [locked]);
}

export function useDialogFocus(open) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    focusable?.focus();
    function keepFocusInside(event) {
      if (event.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")];
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keepFocusInside);
    return () => {
      document.removeEventListener("keydown", keepFocusInside);
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  return dialogRef;
}

export function restorePageScroll(scrollY) {
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, scrollY);
  root.style.scrollBehavior = previousScrollBehavior;
}
