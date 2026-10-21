import { Metadata } from "next";
import { dmPageSchema } from "@/lib/dm/validation";
import { DMConversation } from "./DMConversation";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ conversationId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { conversationId } = await params;
  return {
    title: `DM with ${conversationId.slice(0, 8)}…`,
    description: "Direct message conversation on Linkora",
  };
}

export default async function DMPage({ params }: PageProps) {
  const { conversationId } = await params;

  // Validate conversationId format
  const validation = dmPageSchema.safeParse({ conversationId });
  if (!validation.success) {
    notFound();
  }

  return <DMConversation conversationId={conversationId} />;
}