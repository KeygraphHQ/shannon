/**
 * Accessibility Utilities
 *
 * Helpers for ARIA labels, keyboard navigation, and focus management.
 *
 * Usage:
 *   import { a11y, useFocusTrap } from '@/lib/accessibility';
 *
 *   <button {...a11y.button('Save changes')}>Save</button>
 */

/**
 * Generate ARIA attributes for common patterns
 */
export const a11y = {
  /**
   * Accessible button attributes
   */
  button: (label: string, options?: { disabled?: boolean; pressed?: boolean }) => ({
    "aria-label": label,
    "aria-disabled": options?.disabled || undefined,
    "aria-pressed": options?.pressed,
    role: "button",
    tabIndex: options?.disabled ? -1 : 0,
  }),

  /**
   * Accessible link attributes
   */
  link: (label: string, options?: { external?: boolean }) => ({
    "aria-label": label,
    ...(options?.external && {
      target: "_blank",
      rel: "noopener noreferrer",
      "aria-describedby": "new-window-notice",
    }),
  }),

  /**
   * Accessible dialog attributes
   */
  dialog: (title: string, description?: string) => ({
    role: "dialog",
    "aria-modal": true,
    "aria-labelledby": `dialog-title-${title.toLowerCase().replace(/\s+/g, "-")}`,
    "aria-describedby": description
      ? `dialog-desc-${title.toLowerCase().replace(/\s+/g, "-")}`
      : undefined,
  }),

  /**
   * Accessible menu attributes
   */
  menu: (label: string, options?: { expanded?: boolean }) => ({
    role: "menu",
    "aria-label": label,
    "aria-expanded": options?.expanded,
  }),

  /**
   * Accessible menu item attributes
   */
  menuItem: (label: string, options?: { selected?: boolean }) => ({
    role: "menuitem",
    "aria-label": label,
    "aria-selected": options?.selected,
    tabIndex: options?.selected ? 0 : -1,
  }),

  /**
   * Accessible tab list attributes
   */
  tabList: (label: string) => ({
    role: "tablist",
    "aria-label": label,
  }),

  /**
   * Accessible tab attributes
   */
  tab: (
    label: string,
    options: { selected: boolean; controls: string; index: number }
  ) => ({
    role: "tab",
    "aria-label": label,
    "aria-selected": options.selected,
    "aria-controls": options.controls,
    id: `tab-${options.index}`,
    tabIndex: options.selected ? 0 : -1,
  }),

  /**
   * Accessible tab panel attributes
   */
  tabPanel: (
    label: string,
    options: { index: number; hidden?: boolean }
  ) => ({
    role: "tabpanel",
    "aria-label": label,
    "aria-labelledby": `tab-${options.index}`,
    id: `panel-${options.index}`,
    hidden: options.hidden,
    tabIndex: 0,
  }),

  /**
   * Accessible alert attributes
   */
  alert: (live?: "polite" | "assertive") => ({
    role: "alert",
    "aria-live": live || "polite",
    "aria-atomic": true,
  }),

  /**
   * Accessible status attributes (for loading, progress, etc.)
   */
  status: (label: string) => ({
    role: "status",
    "aria-label": label,
    "aria-live": "polite" as const,
  }),

  /**
   * Accessible form field attributes
   */
  field: (
    id: string,
    label: string,
    options?: {
      required?: boolean;
      invalid?: boolean;
      errorId?: string;
      helpId?: string;
    }
  ) => ({
    id,
    "aria-label": label,
    "aria-required": options?.required,
    "aria-invalid": options?.invalid,
    "aria-errormessage": options?.invalid ? options?.errorId : undefined,
    "aria-describedby": options?.helpId,
  }),

  /**
   * Screen reader only text (visually hidden)
   */
  srOnly: () => ({
    className: "sr-only",
    style: {
      position: "absolute" as const,
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "-1px",
      overflow: "hidden",
      clip: "rect(0, 0, 0, 0)",
      whiteSpace: "nowrap" as const,
      border: "0",
    },
  }),

  /**
   * Skip to main content link attributes
   */
  skipLink: (targetId: string) => ({
    href: `#${targetId}`,
    className:
      "sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded",
  }),
};

/**
 * Keyboard event helpers
 */
export const keyboard = {
  /**
   * Check if Enter or Space was pressed (for button-like elements)
   */
  isActivation: (event: KeyboardEvent | React.KeyboardEvent): boolean => {
    return event.key === "Enter" || event.key === " ";
  },

  /**
   * Check if Escape was pressed
   */
  isEscape: (event: KeyboardEvent | React.KeyboardEvent): boolean => {
    return event.key === "Escape";
  },

  /**
   * Check if Tab was pressed
   */
  isTab: (event: KeyboardEvent | React.KeyboardEvent): boolean => {
    return event.key === "Tab";
  },

  /**
   * Check if arrow keys were pressed
   */
  isArrow: (
    event: KeyboardEvent | React.KeyboardEvent
  ): { up: boolean; down: boolean; left: boolean; right: boolean } | null => {
    const arrows = {
      ArrowUp: { up: true, down: false, left: false, right: false },
      ArrowDown: { up: false, down: true, left: false, right: false },
      ArrowLeft: { up: false, down: false, left: true, right: false },
      ArrowRight: { up: false, down: false, left: false, right: true },
    };
    return arrows[event.key as keyof typeof arrows] || null;
  },

  /**
   * Handle keyboard navigation in a list
   */
  handleListNavigation: (
    event: KeyboardEvent | React.KeyboardEvent,
    currentIndex: number,
    listLength: number,
    onSelect: (index: number) => void,
    options?: { wrap?: boolean; orientation?: "vertical" | "horizontal" }
  ): boolean => {
    const { wrap = true, orientation = "vertical" } = options || {};

    const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    const prevKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";

    if (event.key === nextKey) {
      event.preventDefault();
      const nextIndex = currentIndex + 1;
      if (nextIndex < listLength) {
        onSelect(nextIndex);
      } else if (wrap) {
        onSelect(0);
      }
      return true;
    }

    if (event.key === prevKey) {
      event.preventDefault();
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        onSelect(prevIndex);
      } else if (wrap) {
        onSelect(listLength - 1);
      }
      return true;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onSelect(0);
      return true;
    }

    if (event.key === "End") {
      event.preventDefault();
      onSelect(listLength - 1);
      return true;
    }

    return false;
  },
};

/**
 * Focus management utilities
 */
export const focus = {
  /**
   * Get all focusable elements within a container
   */
  getFocusableElements: (container: HTMLElement): HTMLElement[] => {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(", ");

    return Array.from(container.querySelectorAll<HTMLElement>(selector));
  },

  /**
   * Trap focus within a container (for modals)
   */
  trapFocus: (container: HTMLElement) => {
    const focusableElements = focus.getFocusableElements(container);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener("keydown", handleKeyDown);

    // Focus first element
    firstElement?.focus();

    // Return cleanup function
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
    };
  },

  /**
   * Restore focus to a previously focused element
   */
  createFocusRestore: (): (() => void) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocused?.focus();
    };
  },
};

/**
 * Announce text to screen readers
 */
export function announce(message: string, priority: "polite" | "assertive" = "polite"): void {
  const announcer = document.createElement("div");
  announcer.setAttribute("role", "status");
  announcer.setAttribute("aria-live", priority);
  announcer.setAttribute("aria-atomic", "true");
  announcer.className = "sr-only";
  announcer.textContent = message;

  document.body.appendChild(announcer);

  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcer);
  }, 1000);
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Check if user prefers high contrast
 */
export function prefersHighContrast(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-contrast: high)").matches;
}
