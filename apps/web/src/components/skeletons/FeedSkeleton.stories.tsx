import type { Meta, StoryObj } from "@storybook/react";
import { FeedSkeleton } from "./FeedSkeleton";

const meta = {
  title: "Skeletons/FeedSkeleton",
  component: FeedSkeleton,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A stack of PostCardSkeleton placeholders (minimum 3, maximum 5) using the same spacing rhythm as the loaded feed.",
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
  argTypes: {
    count: { control: { type: "number", min: 3, max: 5, step: 1 } },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof FeedSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const FiveItems: Story = { args: { count: 5 } };
