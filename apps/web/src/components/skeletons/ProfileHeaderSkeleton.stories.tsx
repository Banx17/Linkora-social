import type { Meta, StoryObj } from "@storybook/react";
import { ProfileHeaderSkeleton } from "./ProfileHeaderSkeleton";

const meta = {
  title: "Skeletons/ProfileHeaderSkeleton",
  component: ProfileHeaderSkeleton,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Mirrors the profile page header (#profile-header): avatar, username, address, follower counts and action buttons.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 896, background: "var(--bg-primary)", padding: 24 }}>
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
} satisfies Meta<typeof ProfileHeaderSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
