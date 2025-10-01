import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { ClientSession, Model } from "mongoose";
import { AuditLogEntity, AuditLogDocument } from "./audit-log.schema";

export interface AuditLogInput {
  eventType: string;
  actorType: string;
  actorId?: string;
  outcome: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLogEntity.name)
    private readonly auditLogModel: Model<AuditLogDocument>
  ) {}

  async record(entry: AuditLogInput, session?: ClientSession) {
    await this.auditLogModel.create([entry], { session });
  }
}
