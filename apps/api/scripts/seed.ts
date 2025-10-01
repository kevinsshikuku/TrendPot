import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";
import mongoose, { Schema, Types } from "mongoose";

import { ChallengeEntity, ChallengeSchema, type ChallengeDocument } from "../src/models/challenge.schema";
import { DonationEntity, DonationSchema, type DonationDocument } from "../src/donations/donation.schema";

/**
 * The script seeds deterministic fixtures for local and staging environments so developers can
 * exercise the GraphQL API without relying on the in-memory demo dataset. Keeping this logic in
 * TypeScript makes it easier to evolve alongside the NestJS models while retaining strict typing.
 */
async function seedDatabase() {
  bootstrapEnv();

  const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/trendpot";
  const dbName = process.env.MONGODB_DB ?? "trendpot";

  // We reuse the NestJS Mongoose schema to guarantee seeded data matches runtime expectations.
  const ChallengeModel =
    mongoose.models[ChallengeEntity.name] ??
    mongoose.model<ChallengeDocument>(ChallengeEntity.name, ChallengeSchema);

  const DonationModel =
    mongoose.models[DonationEntity.name] ??
    mongoose.model<DonationDocument>(DonationEntity.name, DonationSchema);

  // Lightweight schemas for users and submissions keep the fixtures structured without committing
  // to an entire domain model before the related features land in the API.
  const UserSchema = new Schema<UserSeedDoc>(
    {
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      displayName: { type: String, required: true, trim: true },
      handle: { type: String, required: true, unique: true, lowercase: true, trim: true },
      bio: { type: String, default: "" },
      avatarUrl: { type: String, default: "" },
      roles: { type: [String], default: [] }
    },
    { collection: "users", timestamps: true }
  );

  const SubmissionSchema = new Schema<SubmissionSeedDoc>(
    {
      challengeId: { type: Schema.Types.ObjectId, required: true, ref: ChallengeEntity.name },
      creatorId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
      tiktokVideoUrl: { type: String, required: true, trim: true },
      caption: { type: String, required: true, trim: true },
      status: { type: String, required: true, lowercase: true, trim: true, default: "pending" },
      metrics: {
        likes: { type: Number, default: 0, min: 0 },
        views: { type: Number, default: 0, min: 0 },
        shares: { type: Number, default: 0, min: 0 }
      }
    },
    { collection: "submissions", timestamps: true }
  );

  const UserModel = mongoose.models.User ?? mongoose.model("User", UserSchema);
  const SubmissionModel = mongoose.models.Submission ?? mongoose.model("Submission", SubmissionSchema);

  const connection = await mongoose.connect(uri, { dbName });

  try {
    await DonationModel.createIndexes();

    const challenges = await seedChallenges(ChallengeModel);
    const users = await seedUsers(UserModel);
    await seedSubmissions({ SubmissionModel, challengeMap: challenges, userMap: users });
  } finally {
    await connection.connection.close();
  }
}

/**
 * Loads local environment overrides before connecting to MongoDB.
 */
function bootstrapEnv() {
  const cwd = process.cwd();
  const envCandidates = [".env.seed", ".env.local", ".env"].map((file) => resolve(cwd, file));

  for (const path of envCandidates) {
    if (existsSync(path)) {
      loadEnv({ path, override: false });
    }
  }
}

async function seedChallenges(ChallengeModel: mongoose.Model<ChallengeDocument>) {
  const fixtureCatalog: ChallengeSeedInput[] = [
    {
      slug: "nairobi-green-fest",
      title: "Nairobi Green Fest",
      tagline: "Plant 5,000 trees across Nairobi estates",
      description:
        "A city-wide challenge rallying estates to plant indigenous trees, restore riparian zones, and crowdsource caretakers for long-term upkeep.",
      goalCents: 1_000_000,
      raisedCents: 250_000,
      currency: "KES",
      status: "live"
    },
    {
      slug: "mombasa-shoreline-cleanup",
      title: "Mombasa Shoreline Cleanup",
      tagline: "50km of shoreline restored by local creators",
      description:
        "Creators document beach cleanups while partnering with local recycling co-ops to keep plastics out of the Indian Ocean.",
      goalCents: 750_000,
      raisedCents: 305_000,
      currency: "KES",
      status: "live"
    },
    {
      slug: "kisumu-tech-labs",
      title: "Kisumu STEM Lab Sprint",
      tagline: "Equip 10 community labs with laptops and robotics kits",
      description:
        "Grassroots innovators rally support for new STEM hubs by showcasing maker nights, student prototypes, and mentorship circles.",
      goalCents: 1_500_000,
      raisedCents: 640_000,
      currency: "KES",
      status: "draft"
    }
  ];

  const challengeMap = new Map<string, Types.ObjectId>();

  for (const challenge of fixtureCatalog) {
    const result = await ChallengeModel.findOneAndUpdate(
      { slug: challenge.slug },
      {
        $set: {
          title: challenge.title,
          tagline: challenge.tagline,
          description: challenge.description,
          goalCents: challenge.goalCents,
          raisedCents: challenge.raisedCents,
          currency: challenge.currency,
          status: challenge.status
        },
        $setOnInsert: { slug: challenge.slug }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    if (!result) {
      throw new Error(`Challenge upsert failed for slug: ${challenge.slug}`);
    }

    challengeMap.set(challenge.slug, result._id as Types.ObjectId);
  }

  return challengeMap;
}

async function seedUsers(UserModel: mongoose.Model<UserSeedDoc & mongoose.Document>) {
  const fixtureCatalog: UserSeedInput[] = [
    {
      email: "njeri@trendpot.local",
      displayName: "Njeri Kamau",
      handle: "njeri-cares",
      bio: "Community mobilizer documenting Nairobi estates embracing green living.",
      avatarUrl: "https://images.trendpot.local/avatars/njeri.png",
      roles: ["creator"]
    },
    {
      email: "daudi@trendpot.local",
      displayName: "Daudi Mwangi",
      handle: "daudi-waves",
      bio: "Ocean conservation storyteller elevating coastal youth voices.",
      avatarUrl: "https://images.trendpot.local/avatars/daudi.png",
      roles: ["creator"]
    },
    {
      email: "admin@trendpot.local",
      displayName: "TrendPot Ops",
      handle: "trendpot-ops",
      bio: "Operations team account coordinating grants and payouts.",
      avatarUrl: "",
      roles: ["admin"]
    }
  ];

  const userMap = new Map<string, Types.ObjectId>();

  for (const user of fixtureCatalog) {
    const result = await UserModel.findOneAndUpdate(
      { email: user.email },
      {
        $set: {
          displayName: user.displayName,
          handle: user.handle,
          bio: user.bio,
          avatarUrl: user.avatarUrl,
          roles: user.roles
        },
        $setOnInsert: { email: user.email }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    if (!result) {
      throw new Error(`User upsert failed for email: ${user.email}`);
    }

    userMap.set(user.email, result._id as Types.ObjectId);
  }

  return userMap;
}

async function seedSubmissions({
  SubmissionModel,
  challengeMap,
  userMap
}: SubmissionSeedDeps) {
  const fixtureCatalog: SubmissionSeedInput[] = [
    {
      challengeSlug: "nairobi-green-fest",
      creatorEmail: "njeri@trendpot.local",
      tiktokVideoUrl: "https://www.tiktok.com/@njeri-cares/video/1234567890",
      caption: "Tree planting drive across Lang'ata with resident volunteers and local schools.",
      status: "published",
      metrics: { likes: 1850, views: 42000, shares: 310 }
    },
    {
      challengeSlug: "mombasa-shoreline-cleanup",
      creatorEmail: "daudi@trendpot.local",
      tiktokVideoUrl: "https://www.tiktok.com/@daudi-waves/video/0987654321",
      caption: "Day one of the Mombasa shoreline cleanup with recycled art workshops for kids.",
      status: "published",
      metrics: { likes: 2400, views: 56000, shares: 450 }
    }
  ];

  for (const submission of fixtureCatalog) {
    const challengeId = challengeMap.get(submission.challengeSlug);
    const creatorId = userMap.get(submission.creatorEmail);

    if (!challengeId) {
      throw new Error(`Missing challenge for submission seed: ${submission.challengeSlug}`);
    }

    if (!creatorId) {
      throw new Error(`Missing user for submission seed: ${submission.creatorEmail}`);
    }

    await SubmissionModel.findOneAndUpdate(
      {
        challengeId,
        creatorId,
        tiktokVideoUrl: submission.tiktokVideoUrl
      },
      {
        $set: {
          caption: submission.caption,
          status: submission.status,
          metrics: submission.metrics
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();
  }
}

seedDatabase()
  .then(() => {
    console.info("✅ Mongo fixtures seeded successfully.");
  })
  .catch((error) => {
    console.error("❌ Mongo fixture seeding failed.", error);
    process.exitCode = 1;
  });

type ChallengeSeedInput = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  goalCents: number;
  raisedCents: number;
  currency: string;
  status: string;
};

type UserSeedInput = {
  email: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarUrl: string;
  roles: string[];
};

type SubmissionSeedInput = {
  challengeSlug: string;
  creatorEmail: string;
  tiktokVideoUrl: string;
  caption: string;
  status: string;
  metrics: SubmissionSeedDoc["metrics"];
};

type UserSeedDoc = {
  email: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarUrl: string;
  roles: string[];
};

type SubmissionSeedDoc = {
  challengeId: Types.ObjectId;
  creatorId: Types.ObjectId;
  tiktokVideoUrl: string;
  caption: string;
  status: string;
  metrics: {
    likes: number;
    views: number;
    shares: number;
  };
};

type SubmissionSeedDeps = {
  SubmissionModel: mongoose.Model<SubmissionSeedDoc & mongoose.Document>;
  challengeMap: Map<string, Types.ObjectId>;
  userMap: Map<string, Types.ObjectId>;
};
