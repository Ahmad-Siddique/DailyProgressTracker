import { GoalDetailView } from "@/features/goals/goal-detail-view";

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ goalId: string }>;
}) {
  const { goalId } = await params;
  return <GoalDetailView goalId={goalId} />;
}