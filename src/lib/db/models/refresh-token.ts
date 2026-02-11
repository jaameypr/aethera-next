import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IRefreshToken extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  jti: string;
  expiresAt: Date;
  revoked: boolean;
}

const RefreshTokenSchema = new Schema<IRefreshToken>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  revoked: { type: Boolean, default: false },
});

RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel: Model<IRefreshToken> =
  mongoose.models.RefreshToken ||
  mongoose.model<IRefreshToken>("RefreshToken", RefreshTokenSchema);
