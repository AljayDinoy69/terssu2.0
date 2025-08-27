import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: false }, // Optional for registered users
    deviceId: { type: String, required: false }, // For anonymous reports
    title: { type: String, required: true },
    reportId: { type: String },
    kind: { type: String, enum: ['new', 'update'], default: 'new' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.methods.toClient = function () {
  const obj = this.toObject({ versionKey: false });
  obj.id = String(obj._id);
  delete obj._id;
  return obj;
};

export const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
export default Notification;
