import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { ProfileImageUploader } from "@/components/profile/ProfileImageUploader";

/* eslint-disable react/display-name -- test doubles have no display name */
jest.mock("react-image-crop", () => {
  const React = jest.requireActual("react");
  const ReactCrop = (props: any) =>
    React.createElement("div", { className: props.className }, props.children);
  return {
    __esModule: true,
    default: ReactCrop,
    ReactCrop,
    centerCrop: (crop: unknown) => crop,
    makeAspectCrop: (options: unknown) => options,
  };
});

jest.mock("@radix-ui/react-dialog", () => {
  const React = jest.requireActual("react");
  const passthrough = (tag: string) => (props: any) =>
    React.createElement(tag, props, props.children);
  return {
    Root: ({ open, children }: any) =>
      open ? React.createElement(React.Fragment, null, children) : null,
    Portal: ({ children }: any) => React.createElement(React.Fragment, null, children),
    Overlay: () => React.createElement("div", { "data-testid": "dialog-overlay" }),
    Content: passthrough("div"),
    Title: passthrough("h2"),
    Description: passthrough("p"),
    Close: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock("@/lib/api", () => ({
  uploadMediaFileWithProgress: jest.fn(),
}));

jest.mock("@/lib/cropImage", () => ({
  cropImageToBlob: jest.fn(),
}));

import { uploadMediaFileWithProgress } from "@/lib/api";
import { cropImageToBlob } from "@/lib/cropImage";

const mockedUpload = uploadMediaFileWithProgress as jest.MockedFunction<
  typeof uploadMediaFileWithProgress
>;
const mockedCrop = cropImageToBlob as jest.MockedFunction<typeof cropImageToBlob>;

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

/** Fires the dropzone's image onLoad so the crop is initialised in jsdom. */
async function loadCropImage(afterOpen: () => void) {
  afterOpen();
  const img = await screen.findByAltText(/to crop/i);
  Object.defineProperty(img, "width", { value: 600, configurable: true });
  Object.defineProperty(img, "height", { value: 600, configurable: true });
  fireEvent.load(img);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUpload.mockResolvedValue({ url: "/api/posts/media/avatar.jpg", size: 1234 });
  mockedCrop.mockResolvedValue(new Blob(["cropped"], { type: "image/jpeg" }));
  (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = jest
    .fn()
    .mockReturnValue("blob:preview");
  (URL as unknown as { revokeObjectURL: jest.Mock }).revokeObjectURL = jest.fn();
});

describe("ProfileImageUploader", () => {
  it("has no axe violations", async () => {
    const { container } = render(<ProfileImageUploader kind="avatar" onChange={jest.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("rejects unsupported file types with a clear error", async () => {
    const onChange = jest.fn();
    render(<ProfileImageUploader kind="avatar" onChange={onChange} />);

    const input = screen.getByTestId("avatar-input") as HTMLInputElement;
    const bad = makeFile("doc.pdf", "application/pdf", 1024);
    fireEvent.change(input, { target: { files: [bad] } });

    expect(await screen.findByTestId("avatar-error")).toHaveTextContent(/Unsupported file type/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects files over the max size with a clear error", async () => {
    const onChange = jest.fn();
    render(
      <ProfileImageUploader kind="avatar" onChange={onChange} maxUploadBytes={5 * 1024 * 1024} />
    );

    const input = screen.getByTestId("avatar-input") as HTMLInputElement;
    const big = makeFile("big.png", "image/png", 6 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [big] } });

    expect(await screen.findByTestId("avatar-error")).toHaveTextContent(/exceeds the 5.0MB limit/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("accepts a dropped image and opens the crop dialog", async () => {
    render(<ProfileImageUploader kind="cover" onChange={jest.fn()} />);

    const dropzone = screen.getByTestId("cover-dropzone");
    const good = makeFile("cover.jpg", "image/jpeg", 1024);
    fireEvent.drop(dropzone, { dataTransfer: { files: [good] } });

    await waitFor(() => expect(screen.getByText(/Crop cover image/i)).toBeInTheDocument());
  });

  it("uploads the cropped image and reports progress", async () => {
    const onChange = jest.fn();
    render(<ProfileImageUploader kind="avatar" onChange={onChange} />);

    const input = screen.getByTestId("avatar-input") as HTMLInputElement;
    const good = makeFile("me.png", "image/png", 2048);
    fireEvent.change(input, { target: { files: [good] } });

    await loadCropImage(() => {});

    mockedUpload.mockImplementation(async (_file, onProgress) => {
      onProgress?.(50);
      onProgress?.(100);
      return { url: "/api/posts/media/me.jpg", size: 900 };
    });

    fireEvent.click(screen.getByTestId("avatar-confirm"));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("/api/posts/media/me.jpg"));
    expect(mockedCrop).toHaveBeenCalled();
    expect(mockedUpload).toHaveBeenCalled();
  });

  it("is keyboard navigable via the dropzone", async () => {
    render(<ProfileImageUploader kind="avatar" onChange={jest.fn()} />);
    const dropzone = screen.getByTestId("avatar-dropzone");
    const input = screen.getByTestId("avatar-input") as HTMLInputElement;
    const clickSpy = jest.spyOn(input, "click");

    dropzone.focus();
    expect(dropzone).toHaveFocus();
    fireEvent.keyDown(dropzone, { key: "Enter" });

    expect(clickSpy).toHaveBeenCalled();
  });
});
