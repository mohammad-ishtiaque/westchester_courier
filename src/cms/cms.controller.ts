import { Body, Controller, Get, Patch, Res } from '@nestjs/common';
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

  // --- HTML Web View Endpoints (for App Store / Play Store Requirements) ---

  @Public()
  @Get('privacy-policy-page')
  async getPrivacyPolicyHtml(@Res() res: any) {
    const data = await this.cmsService.get(CMS_COLLECTIONS.PRIVACY_POLICY);
    const content = data?.data?.description || `
      <p>Welcome to Westchester Courier Services. We value your privacy and are committed to protecting your personal data.</p>
      <h3>Information We Collect</h3>
      <p>We collect information you provide directly to us when creating an account, placing delivery orders, or communicating with us.</p>
      <h3>Use of Information</h3>
      <p>Your information is used strictly to facilitate courier deliveries, process payments, send order notifications, and improve our services.</p>
      <h3>Data Security & Sharing</h3>
      <p>We implement robust security measures to ensure your data is safe and never shared with unauthorized third parties.</p>
      <h3>Contact Us</h3>
      <p>If you have any questions regarding this Privacy Policy, please contact us at support@westchestercourierservices.com.</p>
    `;
    const html = this.renderHtmlPage('Privacy Policy', content);
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  }

  @Public()
  @Get('support-page')
  async getSupportHtml(@Res() res: any) {
    const data = await this.cmsService.get(CMS_COLLECTIONS.CONTACT_US);
    const content = data?.data?.description || `
      <p>Need assistance with your deliveries or account? Our Westchester Courier support team is here to help!</p>
      <div style="margin: 20px 0; padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <h4 style="margin-top:0;">Contact Information:</h4>
        <p><strong>Email Support:</strong> <a href="mailto:westchestercourierservices@gmail.com">westchestercourierservices@gmail.com</a></p>
        <p><strong>Operating Hours:</strong> 24/7 Delivery Support</p>
        <p><strong>Location:</strong> Westchester, NY, USA</p>
      </div>
    `;
    const html = this.renderHtmlPage('Customer Support & Contact Us', content);
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  }

  @Public()
  @Get('terms-page')
  async getTermsHtml(@Res() res: any) {
    const data = await this.cmsService.get(CMS_COLLECTIONS.TERMS_CONDITIONS);
    const content = data?.data?.description || `
      <p>Welcome to Westchester Courier Services. By using our mobile app and website, you agree to these Terms and Conditions.</p>
      <h3>Service Agreement</h3>
      <p>Westchester Courier provides reliable courier and package delivery services according to customer booking requests.</p>
      <h3>User Responsibilities</h3>
      <p>Users must provide accurate pickup and delivery details. Prohibited items cannot be shipped using our service.</p>
    `;
    const html = this.renderHtmlPage('Terms & Conditions', content);
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  }

  private renderHtmlPage(title: string, bodyContent: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Westchester Courier</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      background-color: #f1f5f9;
      margin: 0;
      padding: 0;
    }
    .header {
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      padding: 20px 0;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .header h1 {
      margin: 0;
      color: #1e40af;
      font-size: 24px;
      font-weight: 700;
    }
    .header p {
      margin: 5px 0 0 0;
      color: #64748b;
      font-size: 14px;
    }
    .container {
      max-width: 800px;
      margin: 40px auto;
      background: #ffffff;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
    }
    h2 {
      color: #0f172a;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 10px;
      margin-top: 0;
    }
    h3, h4 {
      color: #1e293b;
      margin-top: 24px;
    }
    a {
      color: #2563eb;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .footer {
      text-align: center;
      padding: 30px 0;
      color: #64748b;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Westchester Courier</h1>
    <p>Fast, Reliable & Secure Delivery Services</p>
  </div>
  <div class="container">
    <h2>${title}</h2>
    <div>${bodyContent}</div>
  </div>
  <div class="footer">
    &copy; ${new Date().getFullYear()} Westchester Courier Services. All rights reserved.
  </div>
</body>
</html>`;
  }
}

