// One-off cleanup: remove legacy fields from existing Position documents.
//
// `minTime`, `maxTime`, `stress`, and `requiredSkills` were part of a project
// that got canceled. They've been dropped from the schema, the API, and the UI;
// this script strips them from documents that still carry them.
//
// Safe to run multiple times (idempotent). Run once from calendar-api-backend:
//   node src/database/scripts/unsetLegacyPositionFields.js
//
// Uses the native collection (not the Mongoose model) so the $unset isn't
// filtered out by strict-mode schema stripping now that these paths are gone.

import mongoose from "mongoose";
import dotenv from "dotenv";
import process from "process";
import Position from "../../models/PositionModel.js";

dotenv.config();

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting.");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    const result = await Position.collection.updateMany(
      {
        $or: [
          { minTime: { $exists: true } },
          { maxTime: { $exists: true } },
          { stress: { $exists: true } },
          { requiredSkills: { $exists: true } },
        ],
      },
      {
        $unset: {
          minTime: "",
          maxTime: "",
          stress: "",
          requiredSkills: "",
        },
      },
    );

    console.log(
      `Legacy fields removed. Matched ${result.matchedCount}, modified ${result.modifiedCount} position(s).`,
    );
  } catch (err) {
    console.error("Cleanup failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("MongoDB disconnected");
  }
};

run();
