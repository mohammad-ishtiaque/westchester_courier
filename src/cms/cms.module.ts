import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContentSchema } from './schemas/content.schema';
import { CMS_COLLECTIONS } from './cms.constants';
import { CmsService } from './cms.service';
import { CmsController } from './cms.controller';

@Module({
  imports: [
    MongooseModule.forFeature(
      Object.values(CMS_COLLECTIONS).map((name) => ({ name, schema: ContentSchema })),
    ),
  ],
  controllers: [CmsController],
  providers: [CmsService],
})
export class CmsModule {}
