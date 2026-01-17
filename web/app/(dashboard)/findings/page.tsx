import { listFindings } from "@/lib/actions/findings";
import { FindingsList } from "@/components/findings/findings-list";

export default async function FindingsPage() {
  const { findings, total, nextCursor } = await listFindings({}, { limit: 20 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security Findings</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and manage security findings across all your scans
        </p>
      </div>

      {/* Findings List */}
      <FindingsList
        initialFindings={findings}
        initialTotal={total}
        initialNextCursor={nextCursor}
      />
    </div>
  );
}
