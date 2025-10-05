import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'null',
      'capacitor://localhost',
      'ionic://localhost',
      'http://localhost:5000',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
    ];

    if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
      allowedOrigins.push(`https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
      allowedOrigins.push(`https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.replit.dev`);
    }

    if (process.env.REPLIT_DEV_DOMAIN) {
      allowedOrigins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    // Allow Railway domains
    const isRailway = !!origin && (
      origin.includes('railway.app') || origin.endsWith('.up.railway.app')
    );

    if (!origin || allowedOrigins.includes(origin) || origin?.includes('replit.dev') || origin?.includes('repl.co') || isRailway) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Set-Cookie'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
