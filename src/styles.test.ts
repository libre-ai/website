import { describe, expect, test } from "bun:test";

import { renderSiteCss } from "./styles";

describe("website-owned brand CSS", () => {
  test("uses only shared color tokens and no gradients", () => {
    const css = renderSiteCss();
    const withoutComments = css.replaceAll(/\/\*[\s\S]*?\*\//g, "");

    expect(withoutComments).not.toMatch(/#[0-9a-f]{3,8}\b|\brgb\(|\bhsl\(|\boklch\(/i);
    expect(withoutComments).not.toMatch(/linear-gradient|radial-gradient/i);
    expect(css).toContain("var(--lai-color-accent)");
    expect(renderSiteCss()).toBe(css);
  });
});
