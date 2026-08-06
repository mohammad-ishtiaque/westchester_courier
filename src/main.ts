import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const allowedOrigins = [
    'http://localhost:2050',
    'http://127.0.0.1:2050',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://10.10.20.52:2050',
    'http://10.10.20.52:3000',
    'http://10.10.20.52:5173',
    'http://10.10.20.52:8001',
  ];

  const envOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];

  const origins = Array.from(new Set([...allowedOrigins, ...envOrigins]));

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) {
        return callback(null, true);
      }
      if (
        origins.includes(origin) ||
        origin.startsWith('http://10.10.20.52') ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        process.env.NODE_ENV !== 'production'
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Accept,Authorization',
  });

  // Serve the uploads directory as static files so stored paths like
  // "uploads/profile-images/xxx.jpg" resolve to GET /uploads/profile-images/xxx.jpg.
  // The frontend can prefix this with the server base URL to render images.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  // Global validation: DTOs are auto-validated against their class-validator decorators
  // before the controller method ever runs. whitelist strips unknown fields instead of
  // erroring, forbidNonWhitelisted throws instead of silently accepting an unexpected field.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT) || 8001;
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`Westchester Courier API running at:`);
  console.log(`- Local:   http://localhost:${port}`);
  console.log(`- Network: http://10.10.20.52:${port}`);
}
bootstrap();

