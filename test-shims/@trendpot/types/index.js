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

const EMBED_HTML_MAX_LENGTH = 6000;

const isTrustedTikTokHost = (url) => {
  if (TIKTOK_TRUSTED_HOSTS.has(url.host)) {
    return true;
  }
  if (url.host.endsWith(".tiktok.com")) {
    return true;
  }
  return false;
};

const isTrustedTikTokCdnHost = (url) => TIKTOK_TRUSTED_CDN_HOST_SUFFIXES.some((suffix) => url.host.endsWith(suffix));

const isTrustedTikTokUrl = (value, { allowCdn = false } = {}) => {
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
};

const containsOnlyAllowedTags = (html) => {
  const tagRegex = /<\/?([a-z0-9:-]+)(?=\s|>|\/)/gi;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    if (!TIKTOK_EMBED_ALLOWED_TAGS.has(tagName)) {
      return false;
    }
  }
  return true;
};

const parseEmbedHtml = (value) => {
  if (typeof value !== "string") {
    throw new Error("TikTok embed HTML must be a string.");
  }
  const html = value.trim();
  if (!html) {
    throw new Error("TikTok embed HTML cannot be empty.");
  }
  if (html.length > EMBED_HTML_MAX_LENGTH) {
    throw new Error("TikTok embed HTML exceeds the maximum allowed length.");
  }
  if (/<script\b/i.test(html) || /<style\b/i.test(html)) {
    throw new Error("TikTok embed HTML cannot contain script or style tags.");
  }
  if (/\son[a-z]+\s*=\s*['\"][^'\"]*['\"]/i.test(html)) {
    throw new Error("TikTok embed HTML cannot contain inline event handlers.");
  }
  if (/javascript:/i.test(html)) {
    throw new Error("TikTok embed HTML cannot contain javascript: URLs.");
  }
  if (!containsOnlyAllowedTags(html)) {
    throw new Error("TikTok embed HTML contains unsupported tags.");
  }
  if (!/(?:class|className)=(['\"])[^'\"]*\btiktok-embed\b[^'\"]*\1/i.test(html)) {
    throw new Error("TikTok embed HTML must include the tiktok-embed container class.");
  }
  const citeMatch = html.match(/cite=(['\"])(.*?)\1/i);
  if (!citeMatch || !isTrustedTikTokUrl(citeMatch[2])) {
    throw new Error("TikTok embed HTML cite attribute must reference a trusted TikTok URL.");
  }
  const urlAttrRegex = /\b(?:href|src)=(['\"])(.*?)\1/gi;
  let urlMatch;
  while ((urlMatch = urlAttrRegex.exec(html)) !== null) {
    const url = urlMatch[2];
    const allowCdn = urlMatch[0].startsWith("src=");
    if (!isTrustedTikTokUrl(url, { allowCdn })) {
      throw new Error("TikTok embed HTML references an untrusted URL.");
    }
  }
  return html;
};

const tikTokEmbedHtmlSchema = {
  parse: parseEmbedHtml
};

const sanitizeTikTokEmbedHtml = (html) => parseEmbedHtml(html);

const tikTokEmbedSchema = {
  parse(value) {
    if (!value || typeof value !== "object") {
      throw new Error("TikTok embed payload must be an object.");
    }
    if (value.provider !== "tiktok") {
      throw new Error("TikTok embed provider must be 'tiktok'.");
    }
    const html = parseEmbedHtml(value.html);
    if (value.scriptUrl !== "https://www.tiktok.com/embed.js") {
      throw new Error("TikTok embed script URL must reference TikTok.");
    }
    if (value.thumbnailUrl && !isTrustedTikTokUrl(value.thumbnailUrl, { allowCdn: true })) {
      throw new Error("TikTok embed thumbnail URL must point to TikTok CDN.");
    }
    if (value.authorUrl && !isTrustedTikTokUrl(value.authorUrl)) {
      throw new Error("TikTok embed author URL must point to TikTok.");
    }
    return {
      provider: "tiktok",
      html,
      scriptUrl: value.scriptUrl,
      width: value.width,
      height: value.height,
      thumbnailUrl: value.thumbnailUrl,
      authorName: value.authorName,
      authorUrl: value.authorUrl
    };
  }
};

const videoMetricsSchema = {
  parse(value) {
    const toNumber = (num) => (typeof num === "number" && Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0);
    return {
      likeCount: toNumber(value?.likeCount),
      commentCount: toNumber(value?.commentCount),
      shareCount: toNumber(value?.shareCount),
      viewCount: toNumber(value?.viewCount)
    };
  }
};

const ensureString = (value, field) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
  return value;
};

const ensureEnum = (value, allowed, field) => {
  if (!allowed.includes(value)) {
    throw new Error(`${field} must be one of ${allowed.join(", ")}.`);
  }
  return value;
};

const ensureOptionalIso = (value, field) => {
  if (value === undefined) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be an ISO date string.`);
  }
  return value;
};

const ensureOptionalNumber = (value, field) => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return value;
};

const fanPermissions = Object.freeze([
  "view_public_profile",
  "initiate_donation",
  "manage_own_sessions",
  "update_own_profile"
]);

const creatorPermissions = Object.freeze([
  ...fanPermissions,
  "manage_own_challenges",
  "view_own_donations",
  "manage_own_submissions",
  "manage_creator_profile"
]);

const operatorPermissions = Object.freeze([
  ...creatorPermissions,
  "view_all_donations",
  "view_audit_logs",
  "manage_sessions",
  "flag_content",
  "resolve_support_cases"
]);

const adminPermissions = Object.freeze([
  ...operatorPermissions,
  "manage_all_challenges",
  "manage_roles",
  "manage_payouts",
  "manage_security_settings",
  "manage_rate_limits"
]);

const rolePermissions = Object.freeze({
  fan: fanPermissions,
  creator: creatorPermissions,
  operator: operatorPermissions,
  admin: adminPermissions
});

const TIKTOK_INGESTION_QUEUE = "tiktok:ingestion";
const TIKTOK_REFRESH_QUEUE = "tiktok:refresh";
const TIKTOK_VIDEO_UPDATE_CHANNEL = "tiktok:videos:update";

const tiktokInitialSyncJobSchema = {
  parse(value) {
    if (!value || typeof value !== "object") {
      throw new Error("TikTok initial sync job must be an object.");
    }
    return {
      accountId: ensureString(value.accountId, "TikTok account id"),
      userId: ensureString(value.userId, "User id"),
      trigger: ensureEnum(value.trigger, ["account_linked", "manual", "retry"], "trigger"),
      requestId: value.requestId ? ensureString(value.requestId, "requestId") : undefined,
      queuedAt: ensureString(value.queuedAt, "queuedAt")
    };
  }
};

const tiktokMetricsRefreshJobSchema = {
  parse(value) {
    if (!value || typeof value !== "object") {
      throw new Error("TikTok metrics refresh job must be an object.");
    }
    return {
      accountId: ensureString(value.accountId, "TikTok account id"),
      reason: ensureEnum(value.reason, ["scheduled", "manual", "backfill"], "reason"),
      requestId: value.requestId ? ensureString(value.requestId, "requestId") : undefined,
      queuedAt: ensureString(value.queuedAt, "queuedAt"),
      retryCount: ensureOptionalNumber(value.retryCount, "retryCount")
    };
  }
};

class GraphQLRequestError extends Error {
  constructor(errors = []) {
    super(errors.map((entry) => entry.message ?? String(entry)).join(" | "));
    this.errors = errors;
  }

  get messages() {
    return this.errors.map((entry) => entry.message ?? String(entry));
  }
}

class TrendPotGraphQLClient {
  constructor() {
    this.store = new Map();
  }

  setChallenge(id, value) {
    this.store.set(id, value);
  }

  async getChallenge(id) {
    return this.store.get(id) ?? null;
  }
}

module.exports = {
  GraphQLRequestError,
  TrendPotGraphQLClient,
  tikTokEmbedHtmlSchema,
  sanitizeTikTokEmbedHtml,
  tikTokEmbedSchema,
  videoMetricsSchema,
  TIKTOK_INGESTION_QUEUE,
  TIKTOK_REFRESH_QUEUE,
  TIKTOK_VIDEO_UPDATE_CHANNEL,
  tiktokInitialSyncJobSchema,
  tiktokMetricsRefreshJobSchema,
  rolePermissions
};

module.exports.default = module.exports;
