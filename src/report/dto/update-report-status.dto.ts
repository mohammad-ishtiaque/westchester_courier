import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ReportStatus } from '../../common/enums/report-status.enum';
import { DeliveryStatus } from '../../common/enums/delivery-status.enum';

export class UpdateReportStatusDto {
  @IsEnum(ReportStatus)
  @IsNotEmpty()
  status: ReportStatus;

  @IsOptional()
  @IsEnum(DeliveryStatus)
  deliveryStatus?: DeliveryStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
