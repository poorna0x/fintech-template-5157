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
      closeButton
      duration={5000}
      visibleToasts={5}
      toastOptions={{
        duration: 5000,
        classNames: {
          toast: cn(
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground",
            "group-[.toaster]:border-border group-[.toaster]:shadow-lg",
            "group-[.toaster]:pr-12"
          ),
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: cn(
            "group-[.toast]:!absolute group-[.toast]:!top-2.5 group-[.toast]:!right-2.5",
            "group-[.toast]:!left-auto group-[.toast]:!translate-x-0 group-[.toast]:!translate-y-0",
            "group-[.toast]:!w-8 group-[.toast]:!h-8 group-[.toast]:!min-w-8 group-[.toast]:!min-h-8",
            "group-[.toast]:flex group-[.toast]:items-center group-[.toast]:justify-center",
            "group-[.toast]:bg-gray-100 group-[.toast]:text-gray-700",
            "group-[.toast]:hover:bg-gray-200 group-[.toast]:active:bg-gray-300",
            "group-[.toast]:border group-[.toast]:border-gray-300 group-[.toast]:rounded-full",
            "group-[.toast]:opacity-100 group-[.toast]:!z-20 group-[.toast]:pointer-events-auto",
            "group-[.toast]:touch-manipulation group-[.toast]:cursor-pointer"
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
