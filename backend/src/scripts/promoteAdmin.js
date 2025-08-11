// import mongoose from 'mongoose';
// import dotenv from 'dotenv';
// import User from '../models/User.js';

// dotenv.config(); // Load .env variables

// const promoteAdmin = async (email) => {
//     try {
//         await mongoose.connect(process.env.MONGO_URI);
//         console.log('✅ Connected to MongoDB');

//         const user = await User.findOne({ email: email.toLowerCase().trim() });
//         if (!user) {
//             console.error(`❌ User with email ${email} not found`);
//             process.exit(1);
//         }

//         user.role = 'admin';
//         await user.save();

//         console.log(`🎉 User ${user.username} (${user.email}) is now an admin!`);
//         process.exit(0);
//     } catch (err) {
//         console.error('❌ Error promoting user:', err.message);
//         process.exit(1);
//     }
// };

// // Replace with the email of the user you want to promote
// const emailToPromote = 'landi@example.com';
// promoteAdmin(emailToPromote);
