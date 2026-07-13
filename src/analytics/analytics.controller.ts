import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AnalyticsChartQueryDto } from './dto/analytics-chart-query.dto';

// Admin-only. Backs the admin dashboard's KPI cards + chart.
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  getOverview() {
    return this.analyticsService.getOverview();
  }

  @Get('chart')
  getChart(@Query() query: AnalyticsChartQueryDto) {
    return this.analyticsService.getChart(query.days ?? 7);
  }
}
