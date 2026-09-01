'use client';

import { Close } from "@mui/icons-material";
import { useTranslations } from "next-intl";
import * as React from "react";

import { useFocusTrap } from "@/lib/useFocusTrap";
import { cn } from "@/lib/utils";


interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  side?: "start" | "end";
}

export function Drawer({
  open,
  onClose,
  children,
  title,
  description,
  className,
  side = "end",
}: DrawerProps) {
  const t = useTranslations("common");
  const titleId = React.useId();
  const descriptionId = React.useId();
  const panelRef = useFocusTrap<HTMLDivElement>(open, onClose);

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-[var(--z-modal)] bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer content */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        // Fully removes the off-screen (translated, not unmounted) panel
        // from the tab order and a11y tree while closed — without `inert`,
        // its buttons/links stay keyboard-focusable even though invisible.
        inert={!open}
        className={cn(
          "fixed inset-y-0 z-[var(--z-modal)] flex flex-col bg-background shadow-2xl transition-transform duration-300 ease-in-out outline-none",
          side === "end" ? "end-0" : "start-0",
          side === "end"
            ? (open ? "translate-x-0" : "ltr:translate-x-full rtl:-translate-x-full")
            : (open ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full"),
          "w-full md:w-[520px] max-w-full",
          className
        )}
      >
        {/* Header (Optional) */}
        {(title || description) && (
          <div className="flex items-center justify-between p-6 border-b border-border/50">
            <div className="space-y-1">
              {title && <h2 id={titleId} className="text-xl font-bold tracking-tight">{title}</h2>}
              {description && <p id={descriptionId} className="text-sm text-muted-foreground">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-faang active:scale-95"
            >
              <Close className="text-xl" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}
