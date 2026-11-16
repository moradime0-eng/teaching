import passport from 'passport';
import crypto from 'crypto';
import { Strategy as JwtStrategy, ExtractJwt, StrategyOptions } from 'passport-jwt';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as LocalStrategy } from 'passport-local';
import User from '../models/User';
import Membership from '../models/Membership';
import Cart from '../models/Cart';
import Wishlist from '../models/Wishlist';
import Tenant from '../models/Tenant'; // 🆕 ایمپورت مدل Tenant

const jwtOptions: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_ACCESS_SECRET!,
};

passport.use(
  new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
      const user = await User.findById(payload.id).select('-password');
      if (user) return done(null, user);
      return done(null, false);
    } catch (error) {
      return done(error, false);
    }
  }),
);

passport.use(
  new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email }).select('+password');
        if (!user) return done(null, false, { message: 'Invalid credentials' });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return done(null, false, { message: 'Invalid credentials' });

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    },
  ),
);

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL!,
        passReqToCallback: true,
      },
      async (req, _accessToken, _refreshToken, profile, done) => {
        try {
          // [MULTI-TENANT-DISABLED] - تمام کد tenant در این بخش غیرفعال شده

          // 1. Check if user exists by googleId
          let user = await User.findOne({ googleId: profile.id });
          if (user) {
            console.log('✅ [Google Strategy] Existing user by googleId:', user.email);
            return done(null, user);
          }

          // 2. Check if user exists by email (link accounts)
          const email = profile.emails?.[0]?.value;
          if (email) {
            user = await User.findOne({ email });
            if (user) {
              console.log('✅ [Google Strategy] Linking googleId to existing email:', email);
              user.googleId = profile.id;
              user.isEmailVerified = true;
              if (!user.avatar && profile.photos?.[0]?.value) {
                user.avatar = profile.photos[0].value;
              }
              await user.save();
              return done(null, user);
            }
          }

          // Check if this is the first user — they become admin
          const userCount = await User.countDocuments({ isActive: true });
          const isFirstUser = userCount === 0;
          const oauthRole = isFirstUser ? 'admin' : 'student';

          // Create new user (first user becomes admin, rest get student role)
          user = await User.create({
            googleId: profile.id,
            email: email,
            fullName: profile.displayName,
            avatar: profile.photos?.[0]?.value,
            isEmailVerified: true,
            isActive: true,
            role: oauthRole,
            isProfileComplete: isFirstUser,
            password: 'OAUTH_PENDING_' + crypto.randomBytes(16).toString('hex'),
            // [MULTI-TENANT-DISABLED] - activeTenant حذف شده
            refreshTokens: [],
            ...(isFirstUser ? {} : { studentProfile: {} }),
            ...(isFirstUser ? { instructorProfile: { isApproved: false } } : {}),
          });

          // [MULTI-TENANT-DISABLED] - Membership, Cart, Wishlist tenant-scoped حذف شده
          // [MULTI-TENANT-DISABLED] - بروزرسانی owner تننت غیرفعال شده

          if (isFirstUser) {
            console.log('🎉 [Google Strategy] اولین کاربر سایت — نقش: ادمین:', user.email);
          } else {
            console.log('✅ [Google Strategy] New user created:', user.email);
          }
          return done(null, user);
        } catch (error: any) {
          console.error('❌ [Google Strategy Error]', error?.message || error);
          return done(error as Error, undefined);
        }
      },
    ),
  );
}

// ==================== GitHub OAuth Strategy ====================
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL!,
        passReqToCallback: true,
      },
      async (req: any, _accessToken: string, _refreshToken: string, profile: any, done: any) => {
        try {
          // [MULTI-TENANT-DISABLED] - تمام کد tenant در این بخش غیرفعال شده

          // 1. Check if user exists by githubId
          let user = await User.findOne({ githubId: profile.id });
          if (user) return done(null, user);

          // 2. Check if user exists by email (link accounts)
          const email = profile.emails?.[0]?.value;
          if (email) {
            user = await User.findOne({ email });
            if (user) {
              user.githubId = profile.id;
              user.isEmailVerified = true;
              if (!user.avatar && profile.photos?.[0]?.value) {
                user.avatar = profile.photos[0].value;
              }
              await user.save();
              return done(null, user);
            }
          }

          // Generate a placeholder email if GitHub didn't provide one
          const userEmail =
            email || `github_${profile.username || profile.id}@placeholder.local`;

          // Check if this is the first user — they become admin
          const userCount = await User.countDocuments({ isActive: true });
          const isFirstUser = userCount === 0;
          const oauthRole = isFirstUser ? 'admin' : 'student';

          // Create new user (first user becomes admin, rest get student role)
          user = await User.create({
            githubId: profile.id,
            email: userEmail,
            fullName: profile.displayName || profile.username,
            avatar: profile.photos?.[0]?.value,
            isEmailVerified: true,
            isActive: true,
            role: oauthRole,
            isProfileComplete: isFirstUser,
            password: 'OAUTH_PENDING_' + crypto.randomBytes(16).toString('hex'),
            // [MULTI-TENANT-DISABLED] - activeTenant حذف شده
            refreshTokens: [],
            ...(isFirstUser ? {} : { studentProfile: {} }),
          });

          // [MULTI-TENANT-DISABLED] - Membership, Cart, Wishlist tenant-scoped حذف شده

          if (isFirstUser) {
            console.log('🎉 [GitHub Strategy] اولین کاربر سایت — نقش: ادمین:', user.email);
          }
          return done(null, user);
        } catch (error) {
          console.error('❌ GitHub Strategy Error:', error);
          return done(error as Error, undefined);
        }
      },
    ),
  );
}

export default passport;
