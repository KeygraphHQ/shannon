import { notFound } from "next/navigation";
import { getFinding } from "@/lib/actions/findings";
import { FindingDetail } from "@/components/findings/finding-detail";

export default async function FindingDetailPage({
  params,
}: {
  params: Promise<{ findingId: string }>;
}) {
  const { findingId } = await params;

  const finding = await getFinding(findingId);

  if (!finding) {
    notFound();
  }

  return <FindingDetail finding={finding} />;
}
