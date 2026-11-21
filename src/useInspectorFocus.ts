import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const compactQuery = "(max-width: 900px)";

function focusableElements(root: HTMLElement) {
  return [
    ...root.querySelectorAll<HTMLElement>(
      "a[href],button,input,select,textarea,summary,[tabindex]",
    ),
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !element.closest("[hidden],[inert]") &&
      element.getClientRects().length > 0,
  );
}

/** A display-only overlay on the existing inspector; neither editor nor Canvas is moved. */
export function useInspectorFocus(projectId: string) {
  const inspectorRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(compactQuery).matches,
  );
  const [view, setView] = useState({ focused: false, returnable: false });
  const focused = compact && view.focused;
  const active = useRef(focused);
  active.current = focused;
  const origin = useRef<{ element: HTMLElement | null; x: number; y: number }>({
    element: null,
    x: 0,
    y: 0,
  });
  const inspectorScrollTop = useRef(0);
  const restoreFocus = useRef(true);
  const restorationFrame = useRef<number | null>(null);

  const expand = useCallback(() => {
    if (!window.matchMedia(compactQuery).matches || active.current) return;
    if (restorationFrame.current !== null)
      cancelAnimationFrame(restorationFrame.current);
    inspectorScrollTop.current = scrollRef.current?.scrollTop ?? 0;
    restoreFocus.current = true;
    origin.current = {
      element:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      x: window.scrollX,
      y: window.scrollY,
    };
    setView({ focused: true, returnable: false });
  }, []);
  const close = useCallback(() => {
    restoreFocus.current = true;
    setView({ focused: false, returnable: false });
  }, []);
  const suspend = useCallback(() => {
    if (active.current) {
      restoreFocus.current = false;
      setView({ focused: false, returnable: true });
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia(compactQuery);
    const change = () => {
      setCompact(media.matches);
      if (!media.matches) setView({ focused: false, returnable: false });
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    setView({ focused: false, returnable: false });
  }, [projectId]);

  useLayoutEffect(() => {
    const inspector = inspectorRef.current;
    if (!focused || !inspector) return;
    const root = inspector.parentElement;
    const background = root
      ? [...root.children].filter(
          (element): element is HTMLElement =>
            element instanceof HTMLElement && element !== inspector,
        )
      : [];
    const previous = background.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));
    inspector
      .querySelector<HTMLButtonElement>("[data-inspector-close]")
      ?.focus({ preventScroll: true });
    for (const item of previous) {
      item.element.inert = true;
      // Status notifications remain announced, but their controls are inert.
      if (item.element.getAttribute("role") !== "status")
        item.element.setAttribute("aria-hidden", "true");
    }
    const { x, y } = origin.current;
    if (scrollRef.current)
      scrollRef.current.scrollTop = inspectorScrollTop.current;

    const keepWindowPosition = () => {
      if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
    };
    const focusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !inspector.contains(event.target))
        (focusableElements(inspector)[0] ?? inspector).focus({
          preventScroll: true,
        });
    };
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      } else if (event.key === "Tab") {
        const items = focusableElements(inspector);
        const first = items[0] ?? inspector,
          last = items.at(-1) ?? inspector;
        if (
          !items.length ||
          !inspector.contains(document.activeElement) ||
          (event.shiftKey
            ? document.activeElement === first
            : document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus({ preventScroll: true });
        }
      }
    };
    const preventBackgroundScroll = (event: Event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".inspector-scroll")
      )
        event.preventDefault();
    };
    // Lock position without changing overflow/scrollbar width or the Canvas allocation.
    window.addEventListener("scroll", keepWindowPosition);
    document.addEventListener("keydown", key);
    document.addEventListener("focusin", focusInside);
    document.addEventListener("wheel", preventBackgroundScroll, {
      passive: false,
    });
    document.addEventListener("touchmove", preventBackgroundScroll, {
      passive: false,
    });
    return () => {
      window.removeEventListener("scroll", keepWindowPosition);
      document.removeEventListener("keydown", key);
      document.removeEventListener("focusin", focusInside);
      document.removeEventListener("wheel", preventBackgroundScroll);
      document.removeEventListener("touchmove", preventBackgroundScroll);
      for (const item of previous) {
        item.element.inert = item.inert;
        if (item.ariaHidden === null)
          item.element.removeAttribute("aria-hidden");
        else item.element.setAttribute("aria-hidden", item.ariaHidden);
      }
      window.scrollTo(x, y);
      // The compact scroller can be clamped while expanded; restore after its old height returns.
      restorationFrame.current = requestAnimationFrame(() => {
        if (active.current) return;
        if (scrollRef.current)
          scrollRef.current.scrollTop = inspectorScrollTop.current;
        if (restoreFocus.current && origin.current.element?.isConnected)
          origin.current.element.focus({ preventScroll: true });
      });
    };
  }, [focused, close]);
  useEffect(
    () => () => {
      if (restorationFrame.current !== null)
        cancelAnimationFrame(restorationFrame.current);
    },
    [],
  );

  return {
    inspectorRef,
    scrollRef,
    compact,
    focused,
    active,
    returnable: compact && view.returnable,
    expand,
    close,
    suspend,
  };
}
