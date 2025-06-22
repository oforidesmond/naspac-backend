import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bull';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;

  // app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  // Enable CORS for frontend (adjust for your frontend URL)
  app.enableCors({
    origin: 'http://localhost:5173', // Update if your frontend runs on a different port
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization',
    credentials: true,
  });

  // Bull Dashboard
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const emailQueue = app.get<Queue>('BullQueue_email');
  createBullBoard({
    queues: [new BullAdapter(emailQueue)],
    serverAdapter,
  });

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use('/admin/queues', serverAdapter.getRouter());

  await app.listen(port);
  console.log(`Application is running on port ${port}`);
  console.log(`Bull Dashboard available at http://localhost:${port}/admin/queues`);
}
bootstrap();