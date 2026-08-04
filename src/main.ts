import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors();

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

  const port = process.env.PORT ?? 8001;
  await app.listen(port);
  console.log(`Westchester Courier API running on port ${port}`);
}
bootstrap();

