// Application entry point. Validates the environment (config.ts throws on
// import if it is wrong), bootstraps the NestJS app, applies the HTTP-level
// protections, enables CORS for the web origin and graceful shutdown hooks,
// then starts the HTTP server.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { rejectForeignOrigins } from './auth/origin-check';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
    bodyParser: false,
  });

  // Security headers. The CSP is dropped outside production only because
  // GraphiQL loads its UI from a CDN; the API itself serves JSON.
  app.use(helmet({ contentSecurityPolicy: config.isProduction ? undefined : false }));

  // The branding uploads (D-23) are the one place that takes bytes, not
  // JSON: the image is the body, its Content-Type says what it is.
  app.use('/api/branding', express.raw({ type: () => true, limit: '600kb' }));

  // Default Express body limit (~100kb) is too small for a full data-exchange
  // import bundle; raise it explicitly.
  app.use(express.json({ limit: '5mb' }));

  // Second line of CSRF defence behind the SameSite cookie: a browser always
  // sends Origin on a cross-site POST, and we only accept our own.
  app.use(rejectForeignOrigins);

  // See TRUST_PROXY in config.ts.
  app.set('trust proxy', config.TRUST_PROXY);

  app.enableCors({
    origin: config.WEB_ORIGIN,
    credentials: true,
  });

  app.enableShutdownHooks();

  await app.listen(config.API_PORT, '0.0.0.0');

  console.log(`OpenEAM API listening on http://localhost:${config.API_PORT}`);
}

void bootstrap();
