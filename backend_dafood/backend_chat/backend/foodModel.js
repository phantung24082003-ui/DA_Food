const mongoose = require("mongoose");

const foodSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User' 
    },

    category: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    unit: { type: String, default: "cái" }, 
    location: { type: String, default: "Ngăn lạnh" },
    registerDate: { type: Date, default: Date.now },
    expiryDate: { type: Date },
    note: { type: String, default: "" },
    icon: { type: String, default: "" },

    status: {
      type: String,
      enum: ["available", "used", "expired", "shared"],
      default: "available",
    },

    
    history: [
      {
        action: String, // "add", "update", "delete", "consume"
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
        message: String,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Food", foodSchema);
