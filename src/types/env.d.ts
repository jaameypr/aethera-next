declare namespace NodeJS {
  interface ProcessEnv {
    // Database
    MONGODB_URI: string;

    // JWT
    JWT_SECRET: string;
    JWT_ACCESS_TTL?: string;
    JWT_REFRESH_TTL?: string;
    JWT_ISSUER?: string;

    // App
    NEXT_PUBLIC_APP_NAME?: string;
    NODE_ENV: "development" | "production" | "test";

    // Mail (optional)
    MAIL_SMTP_HOST?: string;
    MAIL_SMTP_PORT?: string;
    MAIL_SMTP_USERNAME?: string;
    MAIL_SMTP_PASSWORD?: string;
    MAIL_SMTP_SENDER?: string;
    MAIL_SMTP_TLS?: string;
    MAIL_SMTP_AUTH?: string;

    // First-run admin
    ADMIN_USERNAME?: string;
    ADMIN_EMAIL?: string;
    ADMIN_PASSWORD?: string;
  }
}
