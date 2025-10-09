import mongoose from 'mongoose';

const AccountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    phone: { type: String },
    role: { type: String, enum: ['user', 'responder', 'admin'], default: 'user', index: true },
    password: { type: String, required: true },
    restricted: { type: Boolean, default: false },
    // Optional profile fields
    photoUrl: { type: String },
    avatarUrl: { type: String },
    address: { type: String },
    emergencyContact: { type: String },
  },
  { timestamps: true }
);

// Hide password and map _id -> id when converting to JSON
AccountSchema.methods.toSafeJSON = function () {
  const obj = this.toObject({ versionKey: false });
  obj.id = String(obj._id);
  delete obj._id;
  delete obj.password;
  return obj;
};

export const Account = mongoose.models.Account || mongoose.model('Account', AccountSchema);
export default Account;

