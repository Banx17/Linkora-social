import type { Meta, StoryObj } from "@storybook/react";
import { ExploreGridSkeleton } from "./ExploreGridSkeleton";

const meta = {
  title: "Skeletons/ExploreGridSkeleton",
  component: ExploreGridSkeleton,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Loading state for the explore results grid. Reuses the same grid container and card shell as loaded results.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 672 }}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    count: { control: { type: "number", min: 1, max: 8, step: 1 } },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ExploreGridSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const EightResults: Story = { args: { count: 8 } };
