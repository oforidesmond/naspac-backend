import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bull';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import * as express from 'express';
// import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;
  const nodeEnv = configService.get<string>('NODE_ENV') || 'development';

  // app.enableCors({
  //   origin: '*',
  //   methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  //   allowedHeaders: 'Content-Type, Authorization',
  //   credentials: true,
  // });

  // Bull Dashboard
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const emailQueue = app.get<Queue>('BullQueue_email');
  createBullBoard({
    queues: [new BullAdapter(emailQueue)],
    serverAdapter,
  });

  const expressApp = app.getHttpAdapter().getInstance();

  if (nodeEnv === 'production') {
    const storagePath = join(process.env.SERVER_ABSOLUTE_PATH || process.cwd(), 'files');
    console.log(`(PROD) Serving static files from: ${storagePath}`);
    expressApp.use('/files', express.static(storagePath));
  } else {
    const storagePath = join(process.cwd(), 'storage');
    console.log(`(DEV) Serving static files from: ${storagePath}`);
    expressApp.use('/files', express.static(storagePath));
  }

  // Bull dashboard route
  expressApp.use('/admin/queues', serverAdapter.getRouter());

  await app.listen(port);
  console.log(`Application is running on port ${port}`);
  console.log(`Bull Dashboard available at http://localhost:${port}/admin/queues`);
}
bootstrap();