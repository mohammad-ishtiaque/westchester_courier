import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CmsService } from './cms.service';
import { CMS_COLLECTIONS } from './cms.constants';

describe('CmsService', () => {
  let service: CmsService;
  let termsModel: any;
  let privacyModel: any;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CmsService,
        { provide: getModelToken(CMS_COLLECTIONS.TERMS_CONDITIONS), useValue: {} },
        { provide: getModelToken(CMS_COLLECTIONS.PRIVACY_POLICY), useValue: {} },
        { provide: getModelToken(CMS_COLLECTIONS.ABOUT_US), useValue: {} },
        { provide: getModelToken(CMS_COLLECTIONS.FAQ), useValue: {} },
        { provide: getModelToken(CMS_COLLECTIONS.CONTACT_US), useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(CmsService);
    termsModel = moduleRef.get(getModelToken(CMS_COLLECTIONS.TERMS_CONDITIONS));
    privacyModel = moduleRef.get(getModelToken(CMS_COLLECTIONS.PRIVACY_POLICY));
  });

  describe('get', () => {
    it('returns null data when no document exists yet', async () => {
      termsModel.findOne = jest.fn().mockResolvedValue(null);
      const result = await service.get(CMS_COLLECTIONS.TERMS_CONDITIONS);
      expect(result.data).toBeNull();
    });

    it('returns the singleton document when it exists', async () => {
      privacyModel.findOne = jest.fn().mockResolvedValue({ description: 'Our privacy policy...' });
      const result = await service.get(CMS_COLLECTIONS.PRIVACY_POLICY);
      expect(result.data.description).toBe('Our privacy policy...');
    });
  });

  describe('upsert', () => {
    it('creates a new document on first write', async () => {
      termsModel.findOne = jest.fn().mockResolvedValue(null);
      termsModel.create = jest.fn().mockResolvedValue({ description: 'v1' });

      const result = await service.upsert(CMS_COLLECTIONS.TERMS_CONDITIONS, { description: 'v1' });
      expect(termsModel.create).toHaveBeenCalledWith({ description: 'v1' });
      expect(result.message).toContain('Created');
    });

    it('updates the existing document in place on subsequent writes, never creating a second one', async () => {
      termsModel.findOne = jest.fn().mockResolvedValue({ description: 'v1' });
      termsModel.findOneAndUpdate = jest.fn().mockResolvedValue({ description: 'v2' });
      termsModel.create = jest.fn();

      const result = await service.upsert(CMS_COLLECTIONS.TERMS_CONDITIONS, { description: 'v2' });
      expect(termsModel.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        { description: 'v2' },
        { new: true, runValidators: true },
      );
      expect(termsModel.create).not.toHaveBeenCalled();
      expect(result.message).toContain('Updated');
    });

    it('keeps each collection independent (terms write does not touch privacy model)', async () => {
      termsModel.findOne = jest.fn().mockResolvedValue(null);
      termsModel.create = jest.fn().mockResolvedValue({ description: 'terms' });
      privacyModel.findOne = jest.fn();
      privacyModel.create = jest.fn();

      await service.upsert(CMS_COLLECTIONS.TERMS_CONDITIONS, { description: 'terms' });
      expect(privacyModel.findOne).not.toHaveBeenCalled();
      expect(privacyModel.create).not.toHaveBeenCalled();
    });
  });
});
