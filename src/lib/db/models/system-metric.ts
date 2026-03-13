import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface ISystemMetric extends Document {
  ts: Date;
  cpuPct: number;
  ramPct: number;
}

const SystemMetricSchema = new Schema<ISystemMetric>({
  ts: { type: Date, required: true, default: Date.now },
  cpuPct: { type: Number, required: true },
  ramPct: { type: Number, required: true },
});

// Regular index for ts queries; TTL removes docs after 24 h
SystemMetricSchema.index({ ts: 1 }, { expireAfterSeconds: 86400 });

export const SystemMetricModel: Model<ISystemMetric> =
  mongoose.models.SystemMetric ||
  mongoose.model<ISystemMetric>("SystemMetric", SystemMetricSchema);
