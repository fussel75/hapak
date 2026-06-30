import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { pool } from "./db";
import connectPgSimple from "connect-pg-simple";
import type { User } from "@shared/schema";

const scryptAsync = promisify(scrypt);
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const loginFailures = new Map<string, { count: number; firstFailureAt: number }>();

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  const hashedBuf = Buffer.from(hashed, "hex");
  const buf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  if (hashedBuf.length !== buf.length) return false;
  return timingSafeEqual(hashedBuf, buf);
}

function getLoginRateKey(req: any): string {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const username = String(req.body?.username || "").trim().toLowerCase();
  return `${ip}:${username}`;
}

function isLoginRateLimited(key: string, now = Date.now()): boolean {
  const record = loginFailures.get(key);
  if (!record) return false;
  if (now - record.firstFailureAt > LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return false;
  }
  return record.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(key: string, now = Date.now()): void {
  const record = loginFailures.get(key);
  if (!record || now - record.firstFailureAt > LOGIN_WINDOW_MS) {
    loginFailures.set(key, { count: 1, firstFailureAt: now });
    return;
  }
  record.count += 1;
}

function clearLoginFailures(key: string): void {
  loginFailures.delete(key);
}

declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      password: string;
      fullName: string;
      email: string | null;
      role: string;
      branch: string | null;
      active: boolean;
    }
  }
}

export function setupAuth(app: Express) {
  const PgSession = connectPgSimple(session);
  const isProduction = process.env.NODE_ENV === "production";
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    if (isProduction) throw new Error("SESSION_SECRET muss in Produktion gesetzt sein");
    console.warn("SESSION_SECRET ist nicht gesetzt; verwende lokalen Entwicklungswert.");
  }

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret || "local-dev-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
    },
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
  };

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) return done(null, false, { message: "Benutzer nicht gefunden" });
        if (!user.active) return done(null, false, { message: "Benutzer deaktiviert" });
        const isValid = await comparePasswords(password, user.password);
        if (!isValid) return done(null, false, { message: "Falsches Passwort" });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || undefined);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    const rateKey = getLoginRateKey(req);
    if (isLoginRateLimited(rateKey)) {
      return res.status(429).json({ message: "Zu viele fehlgeschlagene Login-Versuche. Bitte später erneut versuchen." });
    }

    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) return next(err);
      if (!user) {
        recordLoginFailure(rateKey);
        return res.status(401).json({ message: info?.message || "Login fehlgeschlagen" });
      }
      req.logIn(user, (err) => {
        if (err) return next(err);
        clearLoginFailures(rateKey);
        const { password, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout fehlgeschlagen" });
      res.json({ message: "Erfolgreich abgemeldet" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Nicht angemeldet" });
    const { password, ...safeUser } = req.user!;
    res.json(safeUser);
  });

  app.post("/api/auth/register", requireAuth, async (req, res, next) => {
    try {
      const currentUser = req.user as any;
      if (currentUser.role !== "chef" && currentUser.role !== "admin") {
        return res.status(403).json({ message: "Nur Administratoren können Benutzer anlegen" });
      }

      const { username, password, fullName, email, role, branch, active } = req.body;
      if (!username || !password) return res.status(400).json({ message: "Benutzername und Passwort erforderlich" });

      const allowedRoles = ["chef", "bauleiter", "meister", "monteur", "azubi", "buero", "buchhaltung"];
      const safeRole = allowedRoles.includes(role) ? role : "monteur";

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) return res.status(400).json({ message: "Benutzername bereits vergeben" });

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        fullName: fullName || username,
        email: email || null,
        role: safeRole,
        branch: branch || null,
        active: active !== false,
      });

      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (err) {
      next(err);
    }
  });
}

export function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Nicht angemeldet" });
  next();
}

export { hashPassword };
