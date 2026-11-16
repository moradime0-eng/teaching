// FIRST import: load .env + Docker `_FILE` secrets (MONGODB_URI).
import '../config/loadEnv';
import database from '../config/database';
import { seedAdmin } from './adminSeed';
import { seedCategories } from './categorySeed';

const runSeeds = async () => {
  try {
    console.log('🌱 Starting database seeding...\n');

    await database.connect();

    await seedAdmin();
    await seedCategories();

    console.log('\n✅ All seeds completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
};

runSeeds();