'use client';

import * as React from "react";
import { cn } from "@/lib/utils";
import { Close } from "@mui/icons-material";

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
  // Handle ESC key
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      window.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "auto";
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-[var(--z-modal)] bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer content */}
      <div
        className={cn(
          "fixed inset-y-0 z-[var(--z-modal)] flex flex-col bg-background shadow-2xl transition-transform duration-300 ease-in-out",
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
              {title && <h2 className="text-xl font-bold tracking-tight">{title}</h2>}
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            <button
              onClick={onClose}
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
