import type { Meta, StoryObj } from "@storybook/react";
import { PostCardSkeleton } from "./PostCardSkeleton";

const meta = {
  title: "Skeletons/PostCardSkeleton",
  component: PostCardSkeleton,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Loading placeholder matching <PostCard />. Same shell, padding and line heights so swapping to real content causes no layout shift.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 560 }}>
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
} satisfies Meta<typeof PostCardSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
