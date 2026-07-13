import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

// @Global so every feature module (Auth now, others later) can inject MailService
// without re-importing MailModule everywhere.
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
