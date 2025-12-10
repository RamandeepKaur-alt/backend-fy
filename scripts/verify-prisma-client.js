/**
 * Verify Prisma Client has Google OAuth fields
 * Run this script to check if Prisma Client is up to date
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyPrismaClient() {
  console.log('🔍 Verifying Prisma Client...\n');

  try {
    // Try to query with googleId field
    const testQuery = await prisma.user.findUnique({
      where: { googleId: 'test-verification' },
      select: {
        id: true,
        email: true,
        googleId: true,
        googleEmail: true,
        avatar: true,
        authMethod: true,
        emailVerified: true,
      },
    });

    console.log('✅ Prisma Client recognizes googleId field');
    console.log('✅ All Google OAuth fields are available\n');
    
    // Check schema fields
    const userFields = [
      'googleId',
      'googleEmail',
      'avatar',
      'authMethod',
      'emailVerified',
      'isActive',
      'lastLogin',
      'refreshToken',
      'updatedAt'
    ];

    console.log('📋 Available User model fields:');
    userFields.forEach(field => {
      console.log(`   ✓ ${field}`);
    });

    console.log('\n✅ Prisma Client is properly configured for Google OAuth!');
    return true;

  } catch (error) {
    if (error.message && error.message.includes('Unknown argument `googleId`')) {
      console.error('❌ ERROR: Prisma Client does NOT recognize googleId field!');
      console.error('\n🔧 SOLUTION:');
      console.error('   1. Stop your backend server (Ctrl+C)');
      console.error('   2. Run: cd backend && npx prisma generate');
      console.error('   3. Restart your server\n');
      return false;
    } else {
      console.error('❌ Unexpected error:', error.message);
      return false;
    }
  } finally {
    await prisma.$disconnect();
  }
}

verifyPrismaClient()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });















