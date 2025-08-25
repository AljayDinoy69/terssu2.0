import mongoose from 'mongoose';

const ReportSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, required: true },
    responderId: { type: String, required: true, index: true },
    userId: { type: String },
    status: { type: String, enum: ['Pending', 'In-progress', 'Resolved'], default: 'Pending', index: true },
  },
  { timestamps: true }
);

export const Report = mongoose.models.Report || mongoose.model('Report', ReportSchema);
export default Report;
