import mongoose from "mongoose";
import CoverageMeter from "../models/CoverageMeterModel.js";

const getMeters = async () => await CoverageMeter.find().sort({ order: 1 });

/**
 * Replace the whole meter list in one shot.
 *
 * The settings card batches every edit behind a single "Save changes" button, so the
 * client sends the complete list rather than a stream of per-item creates/updates/
 * deletes. Meters absent from the payload are deleted; the rest are upserted with
 * `order` set from their position in the array.
 *
 * Meters the client created locally arrive without an `_id` (or with a temporary one
 * that isn't a valid ObjectId) and are inserted.
 */
const replaceAll = async (meters) => {
  const keptIds = meters
    .map((meter) => meter._id)
    .filter((id) => id && mongoose.isValidObjectId(id));

  await CoverageMeter.deleteMany({ _id: { $nin: keptIds } });

  await Promise.all(
    meters.map((meter, index) => {
      const doc = {
        name: meter.name,
        color: meter.color,
        positionIds: meter.positionIds,
        targets: meter.targets,
        order: index,
      };

      if (meter._id && mongoose.isValidObjectId(meter._id)) {
        return CoverageMeter.updateOne({ _id: meter._id }, { $set: doc });
      }
      return CoverageMeter.create(doc);
    }),
  );

  return await getMeters();
};

export default { getMeters, replaceAll };
