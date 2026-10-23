import type { Meta, StoryObj } from "@storybook/react";
import { PoolCardSkeleton } from "./PoolCardSkeleton";

const meta = {
  title: "Skeletons/PoolCardSkeleton",
  component: PoolCardSkeleton,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Mirrors <PoolCard />: header/status, token, balance, governance and CTA rows inside the same card shell.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 340, background: "var(--color-surface-1)", padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
} satisfies Meta<typeof PoolCardSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Grid: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: "var(--space-4)",
        width: 960,
      }}
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <PoolCardSkeleton key={i} />
      ))}
    </div>
  ),
};
