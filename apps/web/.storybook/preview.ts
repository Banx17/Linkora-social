import type { Preview } from "@storybook/react";

// Design tokens (CSS custom properties) — the skeletons consume these via
// the --skeleton-* variables, so stories must load them to render faithfully.
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#0B1120" },
        { name: "light", value: "#FFFFFF" },
      ],
    },
  },
};

export default preview;
