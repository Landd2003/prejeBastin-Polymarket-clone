import mongoose from 'mongoose';
import 'dotenv/config';
import Market from '../src/models/Market.js'; // adjust path
// Put an existing admin user's ObjectId here:
const ADMIN_USER_ID = '64f0c1a2b3c4d5e6f7a8b9c0'; // TODO: replace

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const res = await Market.updateMany(
            { $or: [{ visibility: { $exists: false } }, { visibility: null }] },
            { $set: { visibility: 'public' } }
        );
        console.log('Visibility backfilled:', res.modifiedCount);

        const res2 = await Market.updateMany(
            { $or: [{ createdBy: { $exists: false } }, { createdBy: null }] },
            { $set: { createdBy: ADMIN_USER_ID } }
        );
        console.log('createdBy backfilled:', res2.modifiedCount);

        await mongoose.disconnect();
        console.log('Done.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
