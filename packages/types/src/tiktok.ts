import { z } from "zod";

const TIKTOK_EMBED_ALLOWED_TAGS = new Set([
  "blockquote",
  "section",
  "a",
  "p",
  "span",
  "strong",
  "em",
  "img",
  "cite",
  "iframe"
]);

const TIKTOK_TRUSTED_SCRIPT_URL = "https://www.tiktok.com/embed.js";

const EMBED_HTML_MAX_LENGTH = 6000;

const TIKTOK_TRUSTED_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vt.tiktok.com",
  "vm.tiktok.com"
]);

const TIKTOK_TRUSTED_CDN_HOST_SUFFIXES = [
  ".tiktokcdn.com",
  ".tiktokcdn-us.com",
  ".tiktokcdn-eu.com",
  ".ttwstatic.com"
];

function isTrustedTikTokHost(url: URL): boolean {
  if (TIKTOK_TRUSTED_HOSTS.has(url.host)) {
    return true;
  }

  if (url.host.endsWith(".tiktok.com")) {
    return true;
  }

  return false;
}

function isTrustedTikTokCdnHost(url: URL): boolean {
  return TIKTOK_TRUSTED_CDN_HOST_SUFFIXES.some((suffix) => url.host.endsWith(suffix));
}

function isTrustedTikTokUrl(value: string, { allowCdn = false }: { allowCdn?: boolean } = {}): boolean {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      return false;
    }

    if (isTrustedTikTokHost(url)) {
      return true;
    }

    if (allowCdn && isTrustedTikTokCdnHost(url)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function containsOnlyAllowedTags(html: string): boolean {
  const tagRegex = /<\/?([a-z0-9:-]+)(?=\s|>|\/)/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    if (!TIKTOK_EMBED_ALLOWED_TAGS.has(tagName)) {
      return false;
    }
  }

  return true;
}

function assertTikTokEmbedHtml(html: string, ctx: z.RefinementCtx) {
  if (html.length > EMBED_HTML_MAX_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_big,
      type: "string",
      maximum: EMBED_HTML_MAX_LENGTH,
      inclusive: true,
      message: "TikTok embed HTML exceeds the maximum allowed length."
    });
    return;
  }

  if (/<script\b/i.test(html) || /<style\b/i.test(html)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TikTok embed HTML cannot contain script or style tags."
    });
    return;
  }

  if (/\son[a-z]+\s*=\s*['\"][^'\"]*['\"]/i.test(html)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TikTok embed HTML cannot contain inline event handlers."
    });
    return;
  }

  if (/javascript:/i.test(html)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TikTok embed HTML cannot contain javascript: URLs."
    });
    return;
  }

  if (!containsOnlyAllowedTags(html)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TikTok embed HTML contains unsupported tags."
    });
    return;
  }

  if (!/(?:class|className)=(['\"])[^'\"]*\btiktok-embed\b[^'\"]*\1/i.test(html)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TikTok embed HTML must include the tiktok-embed container class."
    });
    return;
  }

  const citeMatch = html.match(/cite=(['\"])(.*?)\1/i);
  if (!citeMatch || !isTrustedTikTokUrl(citeMatch[2])) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TikTok embed HTML cite attribute must reference a trusted TikTok URL."
    });
    return;
  }

  const urlAttrRegex = /\b(?:href|src)=(['\"])(.*?)\1/gi;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlAttrRegex.exec(html)) !== null) {
    const url = urlMatch[2];
    const allowCdn = urlMatch[0].startsWith("src=");
    if (!isTrustedTikTokUrl(url, { allowCdn })) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TikTok embed HTML references an untrusted URL."
      });
      return;
    }
  }
}

export const tikTokEmbedHtmlSchema = z
  .string()
  .trim()
  .min(1, "TikTok embed HTML cannot be empty.")
  .superRefine(assertTikTokEmbedHtml);

export const sanitizeTikTokEmbedHtml = (html: string): string => tikTokEmbedHtmlSchema.parse(html);

export const tikTokEmbedSchema = z.object({
  provider: z.literal("tiktok"),
  html: tikTokEmbedHtmlSchema,
  scriptUrl: z.literal(TIKTOK_TRUSTED_SCRIPT_URL),
  width: z.number().int().positive().max(2048).optional(),
  height: z.number().int().positive().max(2048).optional(),
  thumbnailUrl: z
    .string()
    .url()
    .optional()
    .refine((value) => (value ? isTrustedTikTokUrl(value, { allowCdn: true }) : true), {
      message: "TikTok embed thumbnail URL must point to TikTok CDN."
    }),
  authorName: z.string().optional(),
  authorUrl: z
    .string()
    .url()
    .optional()
    .refine((value) => (value ? isTrustedTikTokUrl(value) : true), {
      message: "TikTok embed author URL must point to TikTok."
    })
});

export const videoMetricsSchema = z.object({
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  shareCount: z.number().int().nonnegative(),
  viewCount: z.number().int().nonnegative()
});

export const TIKTOK_INGESTION_QUEUE = "tiktok:ingestion" as const;
export const TIKTOK_REFRESH_QUEUE = "tiktok:refresh" as const;
export const TIKTOK_VIDEO_UPDATE_CHANNEL = "tiktok:videos:update" as const;

export const tiktokInitialSyncJobSchema = z.object({
  accountId: z.string().min(1, "TikTok account id is required."),
  userId: z.string().min(1, "User id is required."),
  trigger: z.enum(["account_linked", "manual", "retry"]),
  requestId: z.string().min(1).optional(),
  queuedAt: z.string().datetime()
});

export const tiktokMetricsRefreshJobSchema = z.object({
  accountId: z.string().min(1, "TikTok account id is required."),
  reason: z.enum(["scheduled", "manual", "backfill"]),
  requestId: z.string().min(1).optional(),
  queuedAt: z.string().datetime(),
  retryCount: z.number().int().nonnegative().optional()
});

export type TikTokInitialSyncJob = z.infer<typeof tiktokInitialSyncJobSchema>;
export type TikTokMetricsRefreshJob = z.infer<typeof tiktokMetricsRefreshJobSchema>;

export const tikTokAccountSchema = z.object({
  id: z.string(),
  userId: z.string(),
  openId: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  scopes: z.array(z.string()),
  accessTokenExpiresAt: z.string(),
  refreshTokenExpiresAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const videoSchema = z.object({
  id: z.string(),
  tiktokVideoId: z.string(),
  ownerAccountId: z.string(),
  shareUrl: z.string().url(),
  caption: z.string().nullable(),
  postedAt: z.string().nullable(),
  embed: tikTokEmbedSchema,
  metrics: videoMetricsSchema,
  lastRefreshedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const videoEdgeSchema = z.object({
  cursor: z.string(),
  node: videoSchema
});

export const videoPageInfoSchema = z.object({
  endCursor: z.string().nullable(),
  hasNextPage: z.boolean()
});

export const videoConnectionSchema = z.object({
  edges: z.array(videoEdgeSchema),
  pageInfo: videoPageInfoSchema
});

export const submissionStateSchema = z.enum(["pending", "approved", "rejected", "removed"]);

export const submissionSchema = z.object({
  id: z.string(),
  challengeId: z.string(),
  creatorUserId: z.string(),
  videoId: z.string(),
  state: submissionStateSchema,
  rejectionReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  video: videoSchema
});

export const submissionEdgeSchema = z.object({
  cursor: z.string(),
  node: submissionSchema
});

export const submissionPageInfoSchema = z.object({
  endCursor: z.string().nullable(),
  hasNextPage: z.boolean()
});

export const submissionConnectionSchema = z.object({
  edges: z.array(submissionEdgeSchema),
  pageInfo: submissionPageInfoSchema
});

export const submitToChallengeInputSchema = z.object({
  challengeId: z.string(),
  tiktokVideoId: z.string()
});

export type TikTokEmbed = z.infer<typeof tikTokEmbedSchema>;
export type VideoMetrics = z.infer<typeof videoMetricsSchema>;
export type TikTokAccount = z.infer<typeof tikTokAccountSchema>;
export type Video = z.infer<typeof videoSchema>;
export type VideoConnection = z.infer<typeof videoConnectionSchema>;
export type SubmissionState = z.infer<typeof submissionStateSchema>;
export type Submission = z.infer<typeof submissionSchema>;
export type SubmissionConnection = z.infer<typeof submissionConnectionSchema>;
export type SubmitToChallengeInput = z.infer<typeof submitToChallengeInputSchema>;
