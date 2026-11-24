"use client";

import { Button } from "@/components/ui/button";
import {
  EmptyState,
  PageHeader,
  SurfaceCard,
} from "@/components/ui/page-chrome";
import { useOffline } from "@/components/pwa/offline-provider";

export default function ExportPage() {
  const { online } = useOffline();

  async function download(path: string, filename: string) {
    if (!online) return;
    const res = await fetch(path, { method: "POST" });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Export"
        description="Downloads only. There is no import control."
      />
      {!online ? (
        <EmptyState message="Available online." />
      ) : (
        <SurfaceCard className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            disabled={!online}
            onClick={() => void download("/api/export/csv", "ledger.csv")}
          >
            Download CSV pack
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!online}
            onClick={() => void download("/api/export/backup", "backup.json")}
          >
            Download backup.json
          </Button>
        </SurfaceCard>
      )}
    </div>
  );
}