import {
  BLUR_DATA_URL,
  DEFAULT_IMAGE_QUALITY,
  SAVE_DATA_IMAGE_QUALITY,
  canOptimizeImage,
  getImageQuality,
  getOptimizableImageHosts,
  isAboveTheFold,
} from "../responsiveImage";
import {
  getSaveDataCookieAction,
  hasSaveDataCookie,
  isSaveDataHeader,
  SAVE_DATA_COOKIE,
} from "../saveData";

describe("responsive image policy (#1748)", () => {
  it("lowers quality only in save-data mode", () => {
    expect(getImageQuality(false)).toBe(DEFAULT_IMAGE_QUALITY);
    expect(getImageQuality(true)).toBe(SAVE_DATA_IMAGE_QUALITY);
    expect(SAVE_DATA_IMAGE_QUALITY).toBeLessThan(DEFAULT_IMAGE_QUALITY);
  });

  it("treats the first three feed posts as above the fold", () => {
    expect([0, 1, 2, 3, 10].map((index) => isAboveTheFold(index))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(isAboveTheFold(-1)).toBe(false);
  });

  it("ships a network-free blur placeholder", () => {
    expect(BLUR_DATA_URL.startsWith("data:image/svg+xml")).toBe(true);
  });

  it("derives optimizable hosts from the indexer URL and extra hosts", () => {
    expect(
      getOptimizableImageHosts({
        indexerUrl: "https://indexer.linkora.social/api",
        extraHosts: " cdn.linkora.social , ,ipfs.io",
      })
    ).toEqual(["indexer.linkora.social", "cdn.linkora.social", "ipfs.io"]);
    expect(getOptimizableImageHosts({ indexerUrl: "", extraHosts: "" })).toEqual([]);
    expect(getOptimizableImageHosts({ indexerUrl: "/relative" })).toEqual([]);
  });

  it("only routes same-origin and configured hosts through the optimizer", () => {
    const hosts = ["cdn.linkora.social"];

    expect(canOptimizeImage("/media/a.png", hosts)).toBe(true);
    expect(canOptimizeImage("https://cdn.linkora.social/a.png", hosts)).toBe(true);
    expect(canOptimizeImage("https://evil.example/a.png", hosts)).toBe(false);
    expect(canOptimizeImage("//cdn.linkora.social/a.png", hosts)).toBe(false);
    expect(canOptimizeImage("data:image/png;base64,AAAA", hosts)).toBe(false);
    expect(canOptimizeImage("blob:http://localhost/123", hosts)).toBe(false);
  });
});

describe("Save-Data signal parsing (#1748)", () => {
  it("accepts only the `on` token", () => {
    expect(isSaveDataHeader("on")).toBe(true);
    expect(isSaveDataHeader(" ON ")).toBe(true);
    expect(isSaveDataHeader("off")).toBe(false);
    expect(isSaveDataHeader(null)).toBe(false);
  });

  it("finds the mirrored cookie among others", () => {
    expect(hasSaveDataCookie(`theme=dark; ${SAVE_DATA_COOKIE}=1`)).toBe(true);
    expect(hasSaveDataCookie(`${SAVE_DATA_COOKIE}=0`)).toBe(false);
    expect(hasSaveDataCookie("")).toBe(false);
  });
});

describe("getSaveDataCookieAction (#1748 middleware)", () => {
  it("writes the cookie when the header appears", () => {
    expect(getSaveDataCookieAction("on", undefined)).toBe("set");
  });

  it("does not rewrite an existing cookie", () => {
    expect(getSaveDataCookieAction("on", "1")).toBeNull();
  });

  it("deletes the cookie once the header is gone", () => {
    expect(getSaveDataCookieAction(null, "1")).toBe("delete");
  });

  it("leaves ordinary requests untouched", () => {
    expect(getSaveDataCookieAction(null, undefined)).toBeNull();
    expect(getSaveDataCookieAction("off", undefined)).toBeNull();
  });
});
