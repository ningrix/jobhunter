"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CircleCheck, CircleX, Info } from "lucide-react";

type ToastType = "success" | "error" | "info";
interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
}

const ToastCtx = createContext<(msg: string, type?: ToastType) => void>(() => undefined);

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((msg: string, type: ToastType = "success") => {
    const id = ++idRef.current;
    setItems((list) => [...list, { id, msg, type }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 3200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-t1 shadow-lg"
          >
            {t.type === "success" ? (
              <CircleCheck size={16} className="text-success" />
            ) : t.type === "error" ? (
              <CircleX size={16} className="text-danger" />
            ) : (
              <Info size={16} className="text-primary" />
            )}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
