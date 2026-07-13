import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AnalyticsChartQueryDto {
  // Number of trailing days to chart, inclusive of today. Matches the Figma admin
  // dashboard's revenue-style chart, which appears to default to a short trailing window.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90) days?: number = 7;
}
