import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IMailTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  key: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  allowedPlaceholders: string[];
  updatedAt: Date;
}

const MailTemplateSchema = new Schema<IMailTemplate>(
  {
    key: { type: String, required: true, unique: true },
    subject: { type: String, required: true },
    htmlBody: { type: String, required: true },
    textBody: { type: String, required: true },
    allowedPlaceholders: [{ type: String }],
  },
  { timestamps: true },
);

export const MailTemplateModel: Model<IMailTemplate> =
  mongoose.models.MailTemplate ||
  mongoose.model<IMailTemplate>("MailTemplate", MailTemplateSchema);
