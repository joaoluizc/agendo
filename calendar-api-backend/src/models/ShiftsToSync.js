import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const ShiftsToSyncSchema = new Schema({
    positionId: {
        type: Schema.Types.ObjectId,
        ref: 'Position',
        auto: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    shouldSync: {
        type: Boolean,
        required: true,
    },
    defaultShouldSync: {
        type: Boolean,
        required: false,
        default: false,
    },
});