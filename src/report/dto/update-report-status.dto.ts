import { IsEnum, IsNotEmpty } from 'class-validator';
import { ReportStatus } from '../../common/enums/report-status.enum';

export class UpdateReportStatusDto {
  @IsEnum(ReportStatus)
  @IsNotEmpty()
  status: ReportStatus;
}
