"use client";

import { Button } from "./button";
import { Modal } from "@/components/modal";

export function ConfirmDialog({
  open,
  title = "确认操作",
  message,
  confirmText = "确认",
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <Modal title={title} size="sm" onClose={onClose}>
      <p className="text-sm text-t2">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}
