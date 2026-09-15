"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

export interface Workspace {
  project_name: string;
  project_subtitle: string;
}

export const DEFAULT_WORKSPACE: Workspace = {
  project_name: "BuildLens",
  project_subtitle: "Construction document intelligence",
};

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>(DEFAULT_WORKSPACE);

  const refresh = useCallback(async () => {
    try {
      const data = await apiRequest<Workspace>("/workspace");
      setWorkspace({
        project_name: data.project_name?.trim() || DEFAULT_WORKSPACE.project_name,
        project_subtitle:
          data.project_subtitle?.trim() || DEFAULT_WORKSPACE.project_subtitle,
      });
    } catch {
      setWorkspace(DEFAULT_WORKSPACE);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { workspace, refresh };
}
