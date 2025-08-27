import mongoose from 'mongoose';

// Schema for notifications sent to anonymous users
const AnonymousNotificationSchema = new mongoose.Schema(
  {
    // Device identifier for anonymous users (required)
    deviceId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    reportId: { type: String, required: true }, // Reference to AnonymousReport
    kind: { type: String, enum: ['new', 'update'], default: 'update' },
    read: { type: Boolean, default: false },
    // Anonymous-specific fields
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    category: { type: String, enum: ['report_update', 'system'], default: 'report_update' }
  },
  { timestamps: true }
);

// Indexes for efficient queries
AnonymousNotificationSchema.index({ deviceId: 1, read: 1 });
AnonymousNotificationSchema.index({ deviceId: 1, createdAt: -1 });
AnonymousNotificationSchema.index({ reportId: 1 });

AnonymousNotificationSchema.methods.toClient = function () {
  const obj = this.toObject({ versionKey: false });
  obj.id = String(obj._id);
  delete obj._id;
  // Remove deviceId from client response for privacy
  delete obj.deviceId;
  return obj;
};

export const AnonymousNotification = mongoose.models.AnonymousNotification || mongoose.model('AnonymousNotification', AnonymousNotificationSchema);
export default AnonymousNotification;
