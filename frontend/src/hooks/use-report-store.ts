"use client";

import { create } from "zustand";
import type { ReportPayload } from "@/types/report";

interface ReportState {
  viewerOpen: boolean;
  viewerReportId: string | null;
  viewerReport: ReportPayload | null;
  activeReportId: string | null;
  activeReportTitle: string | null;
  openViewer: (report: ReportPayload) => void;
  closeViewer: () => void;
  setActiveReport: (reportId: string, title?: string | null) => void;
  clearActiveReport: () => void;
}

export const useReportStore = create<ReportState>((set) => ({
  viewerOpen: false,
  viewerReportId: null,
  viewerReport: null,
  activeReportId: null,
  activeReportTitle: null,
  openViewer: (report) =>
    set({
      viewerOpen: true,
      viewerReportId: report.reportId,
      viewerReport: report,
    }),
  closeViewer: () =>
    set({
      viewerOpen: false,
    }),
  setActiveReport: (reportId, title = null) =>
    set({
      activeReportId: reportId,
      activeReportTitle: title,
      viewerOpen: false,
    }),
  clearActiveReport: () =>
    set({
      activeReportId: null,
      activeReportTitle: null,
    }),
}));
