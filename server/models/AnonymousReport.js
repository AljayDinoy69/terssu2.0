import mongoose from 'mongoose';

// Schema for anonymous reports (no user identification)
const AnonymousReportSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, required: true },
    photoUrl: { type: String },
    photoUrls: [{ type: String }],
    responderId: { type: String, required: true, index: true },
    // Device identifier for tracking anonymous reports and notifications
    deviceId: { type: String, required: true, index: true },
    // Anonymous-specific fields
    contactNo: { type: String }, // Optional contact for anonymous users
    chiefComplaint: { type: String }, // Medical complaint type
    personsInvolved: { type: String }, // Number of persons involved
    fullName: { type: String }, // Optional name for anonymous reports
    status: { type: String, enum: ['Pending', 'In-progress', 'Resolved'], default: 'Pending', index: true },
    // Privacy flag to ensure this is always anonymous
    isAnonymous: { type: Boolean, default: true, required: true }
  },
  { timestamps: true }
);

// Index for efficient queries
AnonymousReportSchema.index({ deviceId: 1, status: 1 });
AnonymousReportSchema.index({ responderId: 1, status: 1 });
AnonymousReportSchema.index({ createdAt: -1 });

AnonymousReportSchema.methods.toClient = function () {
  const obj = this.toObject({ versionKey: false });
  obj.id = String(obj._id);
  delete obj._id;
  // Remove deviceId from client response for privacy
  delete obj.deviceId;
  return obj;
};

export const AnonymousReport = mongoose.models.AnonymousReport || mongoose.model('AnonymousReport', AnonymousReportSchema);
export default AnonymousReport;
