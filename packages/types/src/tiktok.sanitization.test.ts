import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZodError } from "zod";

import { sanitizeTikTokEmbedHtml } from "./tiktok";

describe("sanitizeTikTokEmbedHtml", () => {
  const validEmbed = `  <blockquote class="tiktok-embed" cite="https://www.tiktok.com/@creator/video/123">
    <section>
      <a href="https://www.tiktok.com/@creator/video/123">Watch on TikTok</a>
    </section>
  </blockquote>`;

  it("accepts valid TikTok embed HTML and trims whitespace", () => {
    const sanitized = sanitizeTikTokEmbedHtml(validEmbed);
    assert.equal(
      sanitized,
      '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@creator/video/123">\n    <section>\n      <a href="https://www.tiktok.com/@creator/video/123">Watch on TikTok</a>\n    </section>\n  </blockquote>'
    );
  });

  it("rejects script tags", () => {
    assert.throws(
      () =>
        sanitizeTikTokEmbedHtml(
          '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@creator/video/123"><script>alert(1)</script></blockquote>'
        ),
      (error) => {
        assert.ok(error instanceof ZodError);
        assert.match(error.message, /script or style tags/);
        return true;
      }
    );
  });

  it("rejects inline event handlers", () => {
    assert.throws(
      () =>
        sanitizeTikTokEmbedHtml(
          '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@creator/video/123"><section onload="alert(1)"></section></blockquote>'
        ),
      (error) => {
        assert.ok(error instanceof ZodError);
        assert.match(error.message, /inline event handlers/);
        return true;
      }
    );
  });

  it("rejects javascript URLs", () => {
    assert.throws(
      () =>
        sanitizeTikTokEmbedHtml(
          '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@creator/video/123"><a href="javascript:alert(1)">bad</a></blockquote>'
        ),
      (error) => {
        assert.ok(error instanceof ZodError);
        assert.match(error.message, /javascript: URLs/);
        return true;
      }
    );
  });

  it("rejects untrusted hosts in URL attributes", () => {
    assert.throws(
      () =>
        sanitizeTikTokEmbedHtml(
          '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@creator/video/123"><a href="https://evil.com/video">bad</a></blockquote>'
        ),
      (error) => {
        assert.ok(error instanceof ZodError);
        assert.match(error.message, /untrusted URL/);
        return true;
      }
    );
  });

  it("rejects embeds missing the required container class", () => {
    assert.throws(
      () =>
        sanitizeTikTokEmbedHtml(
          '<blockquote cite="https://www.tiktok.com/@creator/video/123"><section><a href="https://www.tiktok.com/@creator/video/123">Watch</a></section></blockquote>'
        ),
      (error) => {
        assert.ok(error instanceof ZodError);
        assert.match(error.message, /tiktok-embed container class/);
        return true;
      }
    );
  });

  it("rejects embeds with untrusted cite URLs", () => {
    assert.throws(
      () =>
        sanitizeTikTokEmbedHtml(
          '<blockquote class="tiktok-embed" cite="https://evil.com/video/123"><section><a href="https://www.tiktok.com/@creator/video/123">Watch</a></section></blockquote>'
        ),
      (error) => {
        assert.ok(error instanceof ZodError);
        assert.match(error.message, /cite attribute must reference a trusted TikTok URL/);
        return true;
      }
    );
  });
});
