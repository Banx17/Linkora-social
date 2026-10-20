import type { Meta, StoryObj } from "@storybook/react";
import { NotificationItemSkeleton } from "./NotificationItemSkeleton";

const meta = {
  title: "Skeletons/NotificationItemSkeleton",
  component: NotificationItemSkeleton,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Mirrors NotificationRow: unread dot, message line and timestamp inside the same bordered, padded row.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 560, background: "var(--bg-primary)", padding: 16 }}>
        <ul style={{ display: "flex", flexDirection: "column", gap: 12, listStyle: "none", margin: 0, padding: 0 }}>
          {[0, 1, 2].map((i) => (
            <Story key={i} />
          ))}
        </ul>
      </div>
    ),
  ],
  tags: ["autodocs"],
} satisfies Meta<typeof NotificationItemSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
