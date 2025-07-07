const requiredEnvVars = [
  "MONGO_URI",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "JWT_SECRET",
  "MAILERSEND_API_KEY",
  "NODE_ENV",
] as const;

// Проверяем наличие всех обязательных переменных окружения
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const isDev = process.env.NODE_ENV === "development";

export const env = {
  // База данных
  mongoUri: process.env.MONGO_URI!,

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID!,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET!,

  // JWT
  jwtSecret: process.env.JWT_SECRET!,

  // Email
  mailerSendApiKey: process.env.MAILERSEND_API_KEY!,

  // Environment
  isDev,
  isProd: !isDev,

  // Domains
  frontendDomain: isDev ? "localhost:5173" : "3welle.com",
  backendDomain: isDev ? "localhost:3000" : "yatsenko.site",
  cookieDomain: isDev ? "localhost" : "yatsenko.site",

  // URLs
  get frontendUrl() {
    return `http${this.isProd ? "s" : ""}://${this.frontendDomain}`;
  },
  get backendUrl() {
    return `http${this.isProd ? "s" : ""}://${this.backendDomain}`;
  },

  // Cookie settings
  get cookieSettings() {
    return {
      httpOnly: true,
      secure: this.isProd,
      sameSite: this.isProd ? "none" : ("lax" as "none" | "lax"),
      domain: this.cookieDomain,
      path: "/",
      maxAge: 24 * 60 * 60 * 1000 * 2, // 2 days
    };
  },
} as const;

// Типы для использования в других файлах
export type Env = typeof env;
