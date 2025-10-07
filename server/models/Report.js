import mongoose from 'mongoose';

const ReportSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, required: true },
    photoUrl: { type: String },
    photoUrls: [{ type: String }],
    responderId: { type: String, required: true, index: true },
    userId: { type: String },
    // Device identifier for anonymous reports to enable targeted notifications
    deviceId: { type: String },
    status: { type: String, enum: ['Pending', 'In-progress', 'Resolved'], default: 'Pending', index: true },
  },
  { timestamps: true }
);

export const Report = mongoose.models.Report || mongoose.model('Report', ReportSchema);
export default Report;
