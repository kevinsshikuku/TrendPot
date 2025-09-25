import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Challenge, ChallengeSummary, ListChallengesParams } from "@trendpot/types";
import type { Model } from "mongoose";
import { ChallengeEntity, type ChallengeDocument } from "./models/challenge.schema";
import { ChallengeStatus } from "./models/challenge-status.enum";

interface CreateChallengeParams {
  id: string;
  title: string;
  tagline: string;
  description: string;
  goal: number;
  currency?: string;
  status?: string;
}

interface ChallengeListFilter {
  status?: string;
  search?: string;
}

interface ChallengeListParams {
  first?: number;
  after?: string;
  filter?: ChallengeListFilter;
}

interface ChallengeListEdge {
  cursor: string;
  node: ChallengeSummary;
}

interface ChallengeListResult {
  edges: ChallengeListEdge[];
  pageInfo: {
    endCursor: string | null;
    hasNextPage: boolean;
  };
  analytics: {
    totalChallenges: number;
    totalRaised: number;
    totalGoal: number;
    averageCompletion: number;
    statusBreakdown: Record<ChallengeStatus, number>;
  };
}

interface UpdateChallengeParams {
  id: string;
  expectedVersion: number;
  title?: string;
  tagline?: string;
  description?: string;
  goal?: number;
  currency?: string;
  status?: string;
}

interface ArchiveChallengeParams {
  id: string;
  expectedVersion: number;
}

type ChallengeDocumentShape = ChallengeEntity & {
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
};

@Injectable()
export class AppService {
  constructor(
    @InjectModel(ChallengeEntity.name)
    private readonly challengeModel: Model<ChallengeDocument>
  ) {}

  async getFeaturedChallenges(params: ListChallengesParams = {}): Promise<ChallengeSummary[]> {
    const limit = sanitizeLimit(params.limit);
    const query = this.challengeModel
      .find(buildStatusFilter(params.status))
      .sort({ createdAt: -1 })
      .lean();

    if (typeof limit === "number") {
      query.limit(limit);
    }

    const challenges = await query.exec();
    return challenges.map(toChallengeSummary);
  }

  async listChallenges(params: ListChallengesParams = {}): Promise<ChallengeSummary[]> {
    const limit = sanitizeLimit(params.limit);
    const query = this.challengeModel
      .find(buildStatusFilter(params.status))
      .sort({ createdAt: -1 })
      .lean();

    if (typeof limit === "number") {
      query.limit(limit);
    }

    const challenges = await query.exec();
    return challenges.map(toChallengeSummary);
  }

  async paginateChallenges(params: ChallengeListParams = {}): Promise<ChallengeListResult> {
    const limit = sanitizePageSize(params.first);
    const filter = buildStatusFilter(params.filter?.status);
    const searchFilter = buildSearchFilter(params.filter?.search);
    const cursor = decodeCursor(params.after);

    const conditions: Record<string, unknown>[] = [];

    if (Object.keys(filter).length > 0) {
      conditions.push(filter);
    }

    if (Object.keys(searchFilter).length > 0) {
      conditions.push(searchFilter);
    }

    if (cursor) {
      conditions.push({
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, slug: { $lt: cursor.slug } }
        ]
      });
    }

    const queryFilter = conditions.length > 0 ? { $and: conditions } : {};

    const query = this.challengeModel
      .find(queryFilter)
      .sort({ createdAt: -1, slug: 1 })
      .limit(limit + 1)
      .lean();

    const documents = await query.exec();
    const hasNextPage = documents.length > limit;
    const window = hasNextPage ? documents.slice(0, -1) : documents;
    const edges = window.map((challenge) => ({
      cursor: encodeCursor(challenge.createdAt, challenge.slug),
      node: toChallengeSummary(challenge)
    }));

    const analytics = calculateAnalytics(edges.map((edge) => edge.node));
    const endCursor = edges.length > 0 ? edges[edges.length - 1]?.cursor ?? null : null;

    return {
      edges,
      pageInfo: {
        endCursor,
        hasNextPage
      },
      analytics
    };
  }

  async getChallenge(id: string): Promise<Challenge | null> {
    const slug = normalizeId(id);
    const challenge = await this.challengeModel.findOne({ slug }).lean();
    if (!challenge) {
      return null;
    }

    return toChallenge(challenge);
  }

  async createChallenge(input: CreateChallengeParams): Promise<Challenge> {
    const sanitized = this.prepareChallengeInput(input);
    const existing = await this.challengeModel.findOne({ slug: sanitized.slug }).lean();

    if (existing) {
      throw new BadRequestException("A challenge with this id already exists.");
    }

    const created = await this.challengeModel.create(sanitized);
    return toChallenge(created.toObject() as ChallengeDocumentShape);
  }

  async updateChallenge(input: UpdateChallengeParams): Promise<Challenge> {
    const slug = normalizeId(input.id);
    if (!slug) {
      throw new BadRequestException("A challenge id must contain at least one alphanumeric character.");
    }

    const expectedVersion = Number.isInteger(input.expectedVersion) ? input.expectedVersion : NaN;
    if (!Number.isFinite(expectedVersion) || expectedVersion < 0) {
      throw new BadRequestException("A valid expected version is required for optimistic locking.");
    }

    const existing = await this.challengeModel.findOne({ slug }).lean();
    if (!existing) {
      throw new BadRequestException("Challenge not found.");
    }

    if ((existing.__v ?? 0) !== expectedVersion) {
      throw new ConflictException("Challenge has been modified since you last loaded it.");
    }

    const update: Partial<ChallengeEntity> = {};
    const nextTitle = input.title?.trim();
    const nextTagline = input.tagline?.trim();
    const nextDescription = input.description?.trim();

    if (typeof nextTitle === "string") {
      if (!nextTitle) {
        throw new BadRequestException("Title cannot be empty.");
      }
      update.title = nextTitle;
    }

    if (typeof nextTagline === "string") {
      if (!nextTagline) {
        throw new BadRequestException("Tagline cannot be empty.");
      }
      update.tagline = nextTagline;
    }

    if (typeof nextDescription === "string") {
      if (!nextDescription) {
        throw new BadRequestException("Description cannot be empty.");
      }
      update.description = nextDescription;
    }

    if (typeof input.goal === "number") {
      const goalCents = sanitizeAmount(input.goal);
      if (goalCents <= 0) {
        throw new BadRequestException("Goal must be greater than zero.");
      }
      update.goalCents = goalCents;
    }

    if (typeof input.currency === "string") {
      update.currency = normalizeCurrency(input.currency);
    }

    if (typeof input.status === "string") {
      const nextStatus = normalizeStatus(input.status);
      assertValidStatusTransition(existing.status, nextStatus);
      update.status = nextStatus;
    }

    if (Object.keys(update).length === 0) {
      return toChallenge(existing as ChallengeDocumentShape);
    }

    const updated = await this.challengeModel
      .findOneAndUpdate(
        { slug, __v: expectedVersion },
        { ...update, updatedAt: new Date(), $inc: { __v: 1 } },
        { new: true, lean: true }
      )
      .exec();

    if (!updated) {
      throw new ConflictException("Challenge has been modified since you last loaded it.");
    }

    return toChallenge(updated as ChallengeDocumentShape);
  }

  async archiveChallenge(input: ArchiveChallengeParams): Promise<Challenge> {
    const slug = normalizeId(input.id);
    if (!slug) {
      throw new BadRequestException("A challenge id must contain at least one alphanumeric character.");
    }

    const expectedVersion = Number.isInteger(input.expectedVersion) ? input.expectedVersion : NaN;
    if (!Number.isFinite(expectedVersion) || expectedVersion < 0) {
      throw new BadRequestException("A valid expected version is required for optimistic locking.");
    }

    const existing = await this.challengeModel.findOne({ slug }).lean();
    if (!existing) {
      throw new BadRequestException("Challenge not found.");
    }

    if ((existing.__v ?? 0) !== expectedVersion) {
      throw new ConflictException("Challenge has been modified since you last loaded it.");
    }

    if (existing.status === ChallengeStatus.Archived) {
      return toChallenge(existing as ChallengeDocumentShape);
    }

    const updated = await this.challengeModel
      .findOneAndUpdate(
        { slug, __v: expectedVersion },
        { status: ChallengeStatus.Archived, updatedAt: new Date(), $inc: { __v: 1 } },
        { new: true, lean: true }
      )
      .exec();

    if (!updated) {
      throw new ConflictException("Challenge has been modified since you last loaded it.");
    }

    return toChallenge(updated as ChallengeDocumentShape);
  }

  private prepareChallengeInput(input: CreateChallengeParams) {
    const slug = normalizeId(input.id);

    if (!slug) {
      throw new BadRequestException("A challenge id must contain at least one alphanumeric character.");
    }

    const goalCents = sanitizeAmount(input.goal);

    if (goalCents <= 0) {
      throw new BadRequestException("Goal must be greater than zero.");
    }

    const status = normalizeStatus(input.status);
    const currency = normalizeCurrency(input.currency);

    const title = input.title.trim();
    const tagline = input.tagline.trim();
    const description = input.description.trim();

    if (!title || !tagline || !description) {
      throw new BadRequestException("Title, tagline, and description are required.");
    }

    return {
      slug,
      title,
      tagline,
      description,
      goalCents,
      raisedCents: 0,
      currency,
      status
    } satisfies Partial<ChallengeEntity>;
  }
}

const sanitizeLimit = (limit: ListChallengesParams["limit"]): number | undefined => {
  if (typeof limit !== "number") {
    return undefined;
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    return undefined;
  }

  return Math.floor(limit);
};

const sanitizeAmount = (amount: number): number => {
  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.max(0, Math.round(amount));
};

const normalizeId = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const normalizeStatus = (status?: string): ChallengeStatus => {
  if (!status) {
    return ChallengeStatus.Draft;
  }

  const normalized = status.toLowerCase().trim();
  return allowedStatuses.has(normalized as ChallengeStatus)
    ? (normalized as ChallengeStatus)
    : ChallengeStatus.Draft;
};

const normalizeCurrency = (currency?: string): string => {
  if (!currency) {
    return "KES";
  }

  const normalized = currency.toUpperCase().trim();
  return normalized.length === 3 ? normalized : "KES";
};

const sanitizePageSize = (first?: number): number => {
  if (typeof first !== "number" || !Number.isFinite(first) || first <= 0) {
    return 10;
  }

  return Math.min(50, Math.floor(first));
};

const decodeCursor = (cursor?: string): { createdAt: Date; slug: string } | null => {
  if (!cursor) {
    return null;
  }

  try {
    const raw = Buffer.from(cursor, "base64").toString("utf8");
    const [createdAtIso, slug] = raw.split("::");
    const createdAt = new Date(createdAtIso);

    if (!slug || Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return { createdAt, slug };
  } catch {
    return null;
  }
};

const encodeCursor = (createdAt: Date, slug: string): string => {
  return Buffer.from(`${createdAt.toISOString()}::${slug}`).toString("base64");
};

const buildStatusFilter = (status?: string) => {
  if (!status) {
    return {};
  }

  const normalized = status.toLowerCase().trim();
  return allowedStatuses.has(normalized as ChallengeStatus) ? { status: normalized } : {};
};

const buildSearchFilter = (search?: string) => {
  if (!search) {
    return {};
  }

  const trimmed = search.trim();
  if (!trimmed) {
    return {};
  }

  const safe = escapeRegExp(trimmed);
  const pattern = new RegExp(safe, "i");
  return {
    $or: [{ title: pattern }, { tagline: pattern }, { slug: pattern }]
  };
};

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const toChallengeSummary = (challenge: ChallengeDocumentShape): ChallengeSummary => ({
  id: challenge.slug,
  title: challenge.title,
  tagline: challenge.tagline,
  raised: challenge.raisedCents,
  goal: challenge.goalCents,
  currency: challenge.currency,
  status: (challenge.status as ChallengeStatus) ?? ChallengeStatus.Draft,
  updatedAt: challenge.updatedAt,
  version: challenge.__v ?? 0
});

const toChallenge = (challenge: ChallengeDocumentShape): Challenge => ({
  id: challenge.slug,
  title: challenge.title,
  tagline: challenge.tagline,
  description: challenge.description,
  raised: challenge.raisedCents,
  goal: challenge.goalCents,
  currency: challenge.currency,
  status: (challenge.status as ChallengeStatus) ?? ChallengeStatus.Draft,
  createdAt: challenge.createdAt.toISOString(),
  updatedAt: challenge.updatedAt.toISOString(),
  version: challenge.__v ?? 0
});

const allowedStatuses = new Set<ChallengeStatus>([
  ChallengeStatus.Draft,
  ChallengeStatus.Live,
  ChallengeStatus.Archived
]);

const assertValidStatusTransition = (current: string, next: ChallengeStatus) => {
  const normalizedCurrent = normalizeStatus(current);

  if (normalizedCurrent === next) {
    return;
  }

  if (normalizedCurrent === ChallengeStatus.Archived) {
    throw new BadRequestException("Archived challenges cannot transition to another status.");
  }

  if (normalizedCurrent === ChallengeStatus.Draft && next === ChallengeStatus.Live) {
    return;
  }

  if (next === ChallengeStatus.Archived) {
    return;
  }

  if (normalizedCurrent === ChallengeStatus.Live && next === ChallengeStatus.Draft) {
    throw new BadRequestException("Live challenges cannot return to draft.");
  }

  throw new BadRequestException("Unsupported status transition.");
};

const calculateAnalytics = (items: ChallengeSummary[]): ChallengeListResult["analytics"] => {
  if (items.length === 0) {
    return {
      totalChallenges: 0,
      totalRaised: 0,
      totalGoal: 0,
      averageCompletion: 0,
      statusBreakdown: {
        [ChallengeStatus.Draft]: 0,
        [ChallengeStatus.Live]: 0,
        [ChallengeStatus.Archived]: 0
      }
    };
  }

  let totalRaised = 0;
  let totalGoal = 0;
  let completionAccumulator = 0;
  const statusBreakdown: Record<ChallengeStatus, number> = {
    [ChallengeStatus.Draft]: 0,
    [ChallengeStatus.Live]: 0,
    [ChallengeStatus.Archived]: 0
  };

  for (const item of items) {
    totalRaised += item.raised;
    totalGoal += item.goal;
    if (item.goal > 0) {
      completionAccumulator += Math.min(1, item.raised / item.goal);
    }

    const status = (item.status as ChallengeStatus) ?? ChallengeStatus.Draft;
    statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1;
  }

  return {
    totalChallenges: items.length,
    totalRaised,
    totalGoal,
    averageCompletion: completionAccumulator / items.length,
    statusBreakdown
  };
};
