import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Challenge, ChallengeSummary, ListChallengesParams } from "@trendpot/types";
import type { Model } from "mongoose";
import { ChallengeEntity, type ChallengeDocument } from "./models/challenge.schema";

interface CreateChallengeParams {
  id: string;
  title: string;
  tagline: string;
  description: string;
  goal: number;
  currency?: string;
  status?: string;
}

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
    return toChallenge(created.toObject());
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

const normalizeStatus = (status?: string): string => {
  if (!status) {
    return "draft";
  }

  const normalized = status.toLowerCase().trim();
  return allowedStatuses.has(normalized) ? normalized : "draft";
};

const normalizeCurrency = (currency?: string): string => {
  if (!currency) {
    return "KES";
  }

  const normalized = currency.toUpperCase().trim();
  return normalized.length === 3 ? normalized : "KES";
};

const allowedStatuses = new Set(["draft", "live", "archived"]);

const buildStatusFilter = (status?: string) => {
  if (!status) {
    return {};
  }

  const normalized = status.toLowerCase().trim();
  return allowedStatuses.has(normalized) ? { status: normalized } : {};
};

const toChallengeSummary = (challenge: ChallengeEntity & { createdAt: Date; updatedAt: Date }): ChallengeSummary => ({
  id: challenge.slug,
  title: challenge.title,
  tagline: challenge.tagline,
  raised: challenge.raisedCents,
  goal: challenge.goalCents,
  currency: challenge.currency
});

const toChallenge = (challenge: ChallengeEntity & { createdAt: Date; updatedAt: Date }): Challenge => ({
  id: challenge.slug,
  title: challenge.title,
  tagline: challenge.tagline,
  description: challenge.description,
  raised: challenge.raisedCents,
  goal: challenge.goalCents,
  currency: challenge.currency,
  status: challenge.status,
  createdAt: challenge.createdAt.toISOString(),
  updatedAt: challenge.updatedAt.toISOString()
});
