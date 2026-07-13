import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

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
