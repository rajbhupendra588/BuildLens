"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "buildlens:source-panel-width";
const COLLAPSED_KEY = "buildlens:source-panel-collapsed";
const DEFAULT = 360;
const MIN = 300;
const MAX = 520;

export function useSourcePanelWidth() {
  const [width, setWidthState] = useState(DEFAULT);
  const [collapsed, setCollapsedState] = useState(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const n = Number.parseInt(raw, 10);
        if (!Number.isNaN(n) && n >= MIN && n <= MAX) setWidthState(n);
      }
      const collapsedRaw = sessionStorage.getItem(COLLAPSED_KEY);
      if (collapsedRaw === "0") setCollapsedState(false);
      if (collapsedRaw === "1") setCollapsedState(true);
    } catch {
      // ignore
    }
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      sessionStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  const setWidth = useCallback((next: number) => {
    const clamped = Math.min(MAX, Math.max(MIN, next));
    setWidthState(clamped);
    try {
      sessionStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // ignore
    }
  }, []);

  return { width, setWidth, min: MIN, max: MAX, collapsed, setCollapsed };
}
