import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Toaster as Sonner, toast } from "sonner";

import { cn } from "@/lib/utils";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function subscribeHtmlClass(callback: () => void) {
  const el = document.documentElement;
  const obs = new MutationObserver(callback);
  obs.observe(el, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

function getDarkFromHtml() {
  return document.documentElement.classList.contains("dark");
}

function getServerDark() {
  return false;
}

function SonnerInner({ ...props }: ToasterProps) {
  const isDark = useSyncExternalStore(subscribeHtmlClass, getDarkFromHtml, getServerDark);

  return (
    <Sonner
      theme={isDark ? "dark" : "light"}
      className="toaster group"
      position="top-right"
      richColors
      closeButton
      duration={5000}
      visibleToasts={5}
      toastOptions={{
        duration: 5000,
        classNames: {
          toast: cn(
            "group toast group-[.toaster]:shadow-lg group-[.toaster]:border group-[.toaster]:border-border"
          ),
          description: "group-[.toast]:opacity-90",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: cn(
            "group-[.toast]:bg-background group-[.toast]:text-foreground",
            "group-[.toast]:hover:bg-muted group-[.toast]:border group-[.toast]:border-border",
            "group-[.toast]:rounded-full group-[.toast]:w-6 group-[.toast]:h-6",
            "group-[.toast]:flex group-[.toast]:items-center group-[.toast]:justify-center group-[.toast]:text-xs"
          ),
        },
      }}
      style={{ zIndex: 2147483647 }}
      {...props}
    />
  );
}

export function Toaster({ ...props }: ToasterProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.createElement("div");
    el.setAttribute("data-sonner-portal", "true");
    document.body.appendChild(el);
    setContainer(el);
    return () => {
      el.remove();
    };
  }, []);

  if (!container) return null;
  return createPortal(<SonnerInner {...props} />, container);
}

export { toast };
