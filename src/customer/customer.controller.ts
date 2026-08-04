import { Controller, Get, Param, Query } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { QueryCustomerDto } from './dto/query-customer.dto';

// Admin-only, read-only. Backs the admin dashboard's Customers screen. See customer.service.ts
// for why there's no dedicated Customer schema/auth in this app.
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('admin/customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  findAll(@Query() query: QueryCustomerDto) {
    return this.customerService.findAll(query);
  }

  @Get('suggestions')
  getSuggestions(@Query('q') q?: string, @Query('search') search?: string) {
    return this.customerService.getSuggestions(q || search);
  }

  @Get(':phone')
  findOne(@Param('phone') phone: string) {
    return this.customerService.findOne(phone);
  }
}
