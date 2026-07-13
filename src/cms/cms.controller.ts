import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CmsService } from './cms.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CMS_COLLECTIONS } from './cms.constants';
import { UpsertContentDto } from './dto/upsert-content.dto';

// Five singleton content docs, each with a public read (app Settings/About/FAQ
// screens, no login required) and an admin-only write (dashboard CMS forms).
@Controller()
export class CmsController {
  constructor(private readonly cmsService: CmsService) {}

  @Public()
  @Get('terms-conditions')
  getTerms() {
    return this.cmsService.get(CMS_COLLECTIONS.TERMS_CONDITIONS);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch('admin/terms-conditions')
  upsertTerms(@Body() dto: UpsertContentDto) {
    return this.cmsService.upsert(CMS_COLLECTIONS.TERMS_CONDITIONS, dto);
  }

  @Public()
  @Get('privacy-policy')
  getPrivacy() {
    return this.cmsService.get(CMS_COLLECTIONS.PRIVACY_POLICY);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch('admin/privacy-policy')
  upsertPrivacy(@Body() dto: UpsertContentDto) {
    return this.cmsService.upsert(CMS_COLLECTIONS.PRIVACY_POLICY, dto);
  }

  @Public()
  @Get('about-us')
  getAboutUs() {
    return this.cmsService.get(CMS_COLLECTIONS.ABOUT_US);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch('admin/about-us')
  upsertAboutUs(@Body() dto: UpsertContentDto) {
    return this.cmsService.upsert(CMS_COLLECTIONS.ABOUT_US, dto);
  }

  @Public()
  @Get('faq')
  getFaq() {
    return this.cmsService.get(CMS_COLLECTIONS.FAQ);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch('admin/faq')
  upsertFaq(@Body() dto: UpsertContentDto) {
    return this.cmsService.upsert(CMS_COLLECTIONS.FAQ, dto);
  }

  @Public()
  @Get('contact-us')
  getContactUs() {
    return this.cmsService.get(CMS_COLLECTIONS.CONTACT_US);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch('admin/contact-us')
  upsertContactUs(@Body() dto: UpsertContentDto) {
    return this.cmsService.upsert(CMS_COLLECTIONS.CONTACT_US, dto);
  }
}
