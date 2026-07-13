import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContentDocument } from './schemas/content.schema';
import { CMS_COLLECTIONS, CmsCollectionName } from './cms.constants';
import { UpsertContentDto } from './dto/upsert-content.dto';

@Injectable()
export class CmsService {
  private readonly models: Record<CmsCollectionName, Model<ContentDocument>>;

  constructor(
    @InjectModel(CMS_COLLECTIONS.TERMS_CONDITIONS) termsModel: Model<ContentDocument>,
    @InjectModel(CMS_COLLECTIONS.PRIVACY_POLICY) privacyModel: Model<ContentDocument>,
    @InjectModel(CMS_COLLECTIONS.ABOUT_US) aboutModel: Model<ContentDocument>,
    @InjectModel(CMS_COLLECTIONS.FAQ) faqModel: Model<ContentDocument>,
    @InjectModel(CMS_COLLECTIONS.CONTACT_US) contactModel: Model<ContentDocument>,
  ) {
    this.models = {
      [CMS_COLLECTIONS.TERMS_CONDITIONS]: termsModel,
      [CMS_COLLECTIONS.PRIVACY_POLICY]: privacyModel,
      [CMS_COLLECTIONS.ABOUT_US]: aboutModel,
      [CMS_COLLECTIONS.FAQ]: faqModel,
      [CMS_COLLECTIONS.CONTACT_US]: contactModel,
    };
  }

  async get(collection: CmsCollectionName) {
    const doc = await this.models[collection].findOne();
    return { message: 'Successful', data: doc };
  }

  // Same upsertDoc pattern as the Express template: at most one document per
  // collection ever exists — first write creates it, every write after that updates
  // the same document in place.
  async upsert(collection: CmsCollectionName, dto: UpsertContentDto) {
    const model = this.models[collection];
    const exists = await model.findOne();
    if (exists) {
      const updated = await model.findOneAndUpdate({}, dto, { new: true, runValidators: true });
      return { message: 'Updated successfully', data: updated };
    }
    const created = await model.create(dto);
    return { message: 'Created successfully', data: created };
  }
}
